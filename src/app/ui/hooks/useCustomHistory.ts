import { useLingui } from "@lingui/react/macro";
import { Duration, Effect, Fiber } from "effect";
import type {
  EditorState,
  LexicalEditor,
  NodeKey,
  SerializedEditorState,
  SerializedLexicalNode,
} from "lexical";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EDITOR_TAGS_USED, type EditorShape } from "@/app/data/editor.ts";
import { tokensToUsfm } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import {
  type CanonicalChapterSnapshot,
  canonicalSnapshotToTokens,
  chapterSnapshotsAreEqual,
  chapterStateToCanonicalSnapshot,
  chapterTokensToCanonicalSnapshot,
} from "@/app/domain/history/canonicalChapterState.ts";
import { classifyEditorContentUpdate } from "@/app/domain/history/classifyEditorUpdate.ts";
import {
  chapterKey,
  dedupeChapterRefs,
  findChapterRecordIn,
  type HistoryChapterRecord,
} from "@/app/domain/history/historyChapterRefs.ts";
import {
  type HistoryChapterRef,
  HistoryManager,
  type HistorySnapshotChange,
} from "@/app/domain/history/HistoryManager.ts";
import {
  $captureCurrentSelection,
  $restoreSelectionById,
  $restoreSelectionNearId,
  type ChapterCursor,
  debugRestoreGaveUp,
  findScrollAncestor,
  orderedTextIdsFromSnapshot,
  typingRunContiguous,
} from "@/app/domain/history/historySelection.ts";
import { getUndoRedoNotificationTarget } from "@/app/domain/history/historyUndoRedoNotifications.ts";
import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import {
  requireGateOpen,
  type WorkspaceGateStore,
} from "@/app/state/WorkspaceInteractionGate.ts";
import { showNotificationInfo } from "@/app/ui/components/primitives/notifications.ts";
import { setEditorContent } from "@/app/ui/hooks/utils/editorUtils.ts";

type CaptureEditorUpdateArgs = {
  editorState: EditorState;
  prevEditorState: EditorState;
  dirtyElements: Map<NodeKey, boolean>;
  dirtyLeaves: Set<NodeKey>;
  tags: Set<string>;
  /**
   * The update's selection, captured once by the single lexical→app
   * listener (`WorkingFilesBridgePlugin`) and shared between this capture
   * and the commit it publishes afterwards.
   */
  nextSelection: ChapterCursor;
};

/**
 * Pre-commit world captured by `captureHistory`, consumed by `recordHistory`
 * after the verb commits. Holds the pre-commit files array (valid pre-images
 * because the store never mutates a chapter object in place) and the visible
 * chapter's selection.
 */
type HistoryRecordToken = {
  beforeFiles: ScriptureBookState[];
  selectionBefore: ChapterCursor;
  currentKey: string;
};

type UseCustomHistoryArgs = {
  workingFilesStore: WorkingFilesStore;
  interactionGate: WorkspaceGateStore;
  editorRef: React.RefObject<LexicalEditor | null>;
  currentFileBibleIdentifier: string;
  currentChapter: number;
  /** Current main-editor shape — undo/redo replay re-renders the visible chapter in it. */
  getEditorShape: () => EditorShape;
  maxEntries?: number;
  coalesceWindowMs?: number;
};

type SerializedEditorStateLike =
  SerializedEditorState<SerializedLexicalNode> & {
    selection?: unknown | null;
  };

const DEFAULT_MAX_ENTRIES = 200;
const DEFAULT_COALESCE_WINDOW_MS = 2500;
// Long enough to land past Lexical's reconcile + flush of the replay's
// queued tagged update; short enough that one-off undo feels immediate.
// Tune down toward 30ms if a single undo feels laggy in practice.
const POST_REPLAY_RESTORE_DELAY_MS = 50;

export type CustomHistoryHook = ReturnType<typeof useCustomHistory>;

/**
 * Workspace-owned history hook for scripture editing.
 *
 * Lexical emits granular updates, but the app wants undo/redo in terms of chapter
 * snapshots, selection restoration, and user-visible transactions. This hook is
 * the orchestration layer that captures editor changes, feeds `HistoryManager`,
 * and reapplies snapshots back onto the working scripture noun.
 */
export function useCustomHistory({
  workingFilesStore,
  interactionGate,
  editorRef,
  currentFileBibleIdentifier,
  currentChapter,
  getEditorShape,
  maxEntries = DEFAULT_MAX_ENTRIES,
  coalesceWindowMs = DEFAULT_COALESCE_WINDOW_MS,
}: UseCustomHistoryArgs) {
  const { t } = useLingui();
  const managerRef = useRef(
    new HistoryManager<CanonicalChapterSnapshot, ChapterCursor>({
      maxEntries,
      coalesceWindowMs,
      selectionsContiguous: typingRunContiguous,
    }),
  );

  // Post-undo/redo cursor + scroll restore is deferred so it lands after
  // Lexical's reconcile flushes the queued tagged update from
  // `setEditorContent`. A scheduled restore is held in a ref; back-to-back
  // undo presses interrupt the in-flight fiber and reschedule, coalescing
  // rapid replay into one restore.
  const pendingRestoreRef = useRef<Fiber.Fiber<void> | null>(null);
  const cancelPendingRestore = useCallback(() => {
    const inflight = pendingRestoreRef.current;
    if (inflight) Effect.runFork(Fiber.interrupt(inflight));
    pendingRestoreRef.current = null;
  }, []);
  // Interrupt the in-flight restore when the visible chapter changes — a
  // user who undoes and immediately navigates should not have the prior
  // restore land in the new chapter's editor. The fiber's in-body guard
  // is a second line of defense; this avoids the wait entirely. The
  // chapter/editor deps are intentional — their identity change triggers
  // cleanup → cancelPendingRestore. The effect body doesn't reference
  // them directly; that's the point.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above.
  useEffect(() => {
    return () => {
      cancelPendingRestore();
    };
  }, [
    cancelPendingRestore,
    currentFileBibleIdentifier,
    currentChapter,
    editorRef,
  ]);
  const baselineByChapterRef = useRef(
    new Map<string, CanonicalChapterSnapshot>(),
  );
  const nextTypingLabelRef = useRef<{
    label: string;
    forceNewEntry: boolean;
  } | null>(null);
  const [version, setVersion] = useState(0);

  const bumpVersion = useCallback(() => {
    setVersion((prev) => prev + 1);
  }, []);

  const findChapterRecord = useCallback(
    (chapterRef: HistoryChapterRef): HistoryChapterRecord | null =>
      findChapterRecordIn(workingFilesStore.read(), chapterRef),
    [workingFilesStore],
  );

  const readSnapshotFromChapter = useCallback(
    (chapterRef: HistoryChapterRef): CanonicalChapterSnapshot | null => {
      const record = findChapterRecord(chapterRef);
      if (!record) return null;
      return chapterTokensToCanonicalSnapshot(
        record.chapter.currentTokens,
        record.chapter.direction,
      );
    },
    [findChapterRecord],
  );

  const setBaselineSnapshot = useCallback(
    (chapterRef: HistoryChapterRef, snapshot: CanonicalChapterSnapshot) => {
      baselineByChapterRef.current.set(chapterKey(chapterRef), snapshot);
    },
    [],
  );

  const getBaselineSnapshot = useCallback(
    (chapterRef: HistoryChapterRef): CanonicalChapterSnapshot | null => {
      const existing = baselineByChapterRef.current.get(chapterKey(chapterRef));
      if (existing) return existing;
      return readSnapshotFromChapter(chapterRef);
    },
    [readSnapshotFromChapter],
  );

  // The store is the selection-fact holder (selection rides every bridge
  // patch; see `CapturedSelection` in state/types.ts). History COPIES
  // facts into entries at record time, so entries stay self-contained and
  // HistoryManager stays decoupled from the store. Read during capture,
  // the fact always describes the world BEFORE the in-flight commit — the
  // single lexical→app listener captures before it publishes
  // (`WorkingFilesBridgePlugin`).
  const readStoreLatestSelection = useCallback(
    (chapterRef: HistoryChapterRef): ChapterCursor => {
      const fact = workingFilesStore.readSelectionFact(
        chapterRef.bookCode,
        chapterRef.chapterNum,
      );
      const selection = fact?.selection;
      return selection ? { ...selection } : null;
    },
    [workingFilesStore],
  );

  const markChapterDirty = useCallback((chapter: ScriptureChapterState) => {
    // currentTokens is the canonical content (set by the caller from the
    // replayed snapshot); dirty is purely derived from it vs the baseline.
    chapter.dirty =
      tokensToUsfm(chapter.currentTokens, chapter.eol) !==
      tokensToUsfm(chapter.sourceTokens, chapter.eol);
  }, []);

  // Undo/redo replay swaps chapter content; this hook then restores
  // focus, cursor (by USFMTextNode `data-id`, which survives
  // `parseEditorState`), and scroll position. The restore is deferred so
  // it lands after Lexical reconciles the queued tagged update from
  // `setEditorContent` — running focus/selection synchronously fights
  // reconcile and loses the contenteditable. Historical cursor wins;
  // current cursor in the old tree is a fallback when the historical
  // anchor's data-id no longer exists. When NO cursor's id survives the
  // replay (the change deleted the node the cursor sat on), the last
  // resort is the nearest surviving neighbor in document order — ordered
  // by `leavingSnapshot`, the entry snapshot of the tree being replaced,
  // which still contains the dead id.
  //
  // Why this lives here and not in `editorSyncPipeline`: that pipeline only
  // renders committed content for the visible chapter and deliberately EXCLUDES
  // `undo`/`redo` (see `editorSyncScopeFor`). Replay isn't just a content swap —
  // it must restore the HISTORICAL cursor + scroll + focus, coordinated with the
  // content push and timed after Lexical reconciles. The pipeline has no cursor
  // concept; splitting content (pipeline) from cursor (here) would race reconcile.
  // So undo/redo self-services the visible chapter as one atomic replay.
  const refreshVisibleEditorIfTouched = useCallback(
    (
      touched: Set<string>,
      historicalCursor: ChapterCursor,
      leavingSnapshot: CanonicalChapterSnapshot | null,
    ) => {
      const currentRef = {
        bookCode: currentFileBibleIdentifier,
        chapterNum: currentChapter,
      };
      if (!touched.has(chapterKey(currentRef))) return;
      const editor = editorRef.current;
      if (!editor) return;
      const currentRecord = findChapterRecord(currentRef);
      if (!currentRecord) return;

      const scrollAncestor = findScrollAncestor(editor.getRootElement());
      const savedScrollTop = scrollAncestor?.scrollTop ?? null;

      const liveCursor: ChapterCursor = editor
        .getEditorState()
        .read($captureCurrentSelection);

      const rootEl = editor.getRootElement();
      const editorHadFocus =
        rootEl !== null &&
        (rootEl === document.activeElement ||
          rootEl.contains(document.activeElement));

      setEditorContent(
        editor,
        currentRef.bookCode,
        currentRef.chapterNum,
        currentRecord.chapter,
        workingFilesStore,
        getEditorShape(),
      );

      // Cancel any in-flight restore; the newest replay supersedes.
      // Coalesces rapid Cmd-Z bursts into one restore. Sleep duration
      // lets reconcile flush before we touch focus/selection.
      cancelPendingRestore();

      // Snapshot the visible chapter so the deferred body can verify
      // the user hasn't navigated away during the 50ms wait. The
      // chapter-change `useEffect` interrupts in that case too, but
      // this guard covers paths that don't trigger React updates.
      const restoreTargetRef = {
        bookCode: currentRef.bookCode,
        chapterNum: currentRef.chapterNum,
      };

      // Order inside the restore matters: focus first (contenteditable
      // owns selection target), set selection (Lexical syncs DOM
      // selection into the focused host), then restore scroll last so
      // focus/selection can't re-trigger a scrollIntoView that fights
      // us.
      const restore = Effect.sync(() => {
        // Bail if the user navigated, the editor was swapped, or
        // the visible chapter changed before the sleep elapsed.
        if (editorRef.current !== editor) {
          pendingRestoreRef.current = null;
          return;
        }
        if (
          restoreTargetRef.bookCode !== currentFileBibleIdentifier ||
          restoreTargetRef.chapterNum !== currentChapter
        ) {
          pendingRestoreRef.current = null;
          return;
        }
        if (editorHadFocus) {
          editor.focus(undefined, { defaultSelection: "rootStart" });
        }
        const targets: ChapterCursor[] = [];
        if (historicalCursor) targets.push(historicalCursor);
        if (liveCursor) targets.push(liveCursor);
        if (targets.length > 0) {
          editor.update(
            () => {
              for (const target of targets) {
                if (target && $restoreSelectionById(target)) {
                  return;
                }
              }
              // Every target's id is dead in the replayed
              // tree — caret to the nearest surviving
              // neighbor instead of silently landing at
              // chapter start. Only the LIVE cursor can be
              // located in the leaving ordering (it was
              // captured from that tree); the historical
              // cursor is a target-tree position the leaving
              // snapshot can't place.
              if (
                leavingSnapshot &&
                liveCursor &&
                $restoreSelectionNearId(
                  liveCursor.anchorId,
                  orderedTextIdsFromSnapshot(leavingSnapshot),
                )
              ) {
                return;
              }
              debugRestoreGaveUp(
                "no target id survived the replay and no neighbor was found",
              );
            },
            { tag: EDITOR_TAGS_USED.programaticIgnore },
          );
        }
        if (scrollAncestor && savedScrollTop !== null) {
          scrollAncestor.scrollTop = savedScrollTop;
        }
        pendingRestoreRef.current = null;
      });

      pendingRestoreRef.current = Effect.runFork(
        Effect.sleep(Duration.millis(POST_REPLAY_RESTORE_DELAY_MS)).pipe(
          Effect.andThen(restore),
        ),
      );
    },
    // biome-ignore lint/correctness/useExhaustiveDependencies: getEditorShape is
    // a live getter reading appSettingsRef.current; its per-render arrow identity
    // is irrelevant (never stale) and listing it would only churn this memo.
    [
      currentFileBibleIdentifier,
      currentChapter,
      editorRef,
      findChapterRecord,
      workingFilesStore,
      cancelPendingRestore,
    ],
  );

  const getCurrentEditorSelection = useCallback((): ChapterCursor => {
    const editor = editorRef.current;
    if (!editor) return null;
    return editor.getEditorState().read($captureCurrentSelection);
  }, [editorRef]);

  const applyEntry = useCallback(
    (
      action: "undo" | "redo",
      direction: "before" | "after",
      labelPrefix: "Undid" | "Redid",
      chapterChanges: Array<
        HistorySnapshotChange<CanonicalChapterSnapshot, ChapterCursor>
      >,
      label: string,
    ) => {
      const touchedChapters = new Set<string>();
      const touchedChapterRefs: HistoryChapterRef[] = [];
      const currentRef = {
        bookCode: currentFileBibleIdentifier,
        chapterNum: currentChapter,
      };
      // Historical cursor for the visible chapter (if any of the
      // changes touch it). Used by refreshVisibleEditorIfTouched as
      // the primary restore target — for typing entries, this is
      // the cursor at the moment typing started (undo) or ended
      // (redo), matching what the user expects.
      let historicalCursorForVisible: ChapterCursor = null;
      // Snapshot of the visible chapter's tree being REPLACED by this
      // replay — the nearest-neighbor restore fallback derives its
      // document ordering from it (it still contains ids the target
      // tree may have dropped).
      let leavingSnapshotForVisible: CanonicalChapterSnapshot | null = null;
      // Selection facts riding the replay commit: the restore that
      // follows is a `programaticIgnore` update the bridge skips, so
      // this commit is where the store learns the replayed cursor.
      const selections: Array<{
        bookCode: string;
        chapter: number;
        selection: ChapterCursor;
      }> = [];

      const draft = workingFilesStore.draftWithChapters(
        chapterChanges.map((c) => c.chapter),
      );

      let draftMutated = false;
      for (const change of chapterChanges) {
        const record = findChapterRecordIn(draft, change.chapter);
        if (!record) continue;
        const targetSnapshot =
          direction === "before" ? change.before : change.after;
        const targetSelection =
          direction === "before"
            ? change.selectionBefore
            : change.selectionAfter;

        // Write the canonical token stream; the visible editor re-derives its
        // shape from it on read (refreshVisibleEditorIfTouched below).
        record.chapter.currentTokens =
          canonicalSnapshotToTokens(targetSnapshot);
        markChapterDirty(record.chapter);

        setBaselineSnapshot(change.chapter, targetSnapshot);
        selections.push({
          bookCode: change.chapter.bookCode,
          chapter: change.chapter.chapterNum,
          selection: targetSelection ?? null,
        });
        if (chapterKey(change.chapter) === chapterKey(currentRef)) {
          if (targetSelection) {
            historicalCursorForVisible = targetSelection;
          }
          leavingSnapshotForVisible =
            direction === "before" ? change.after : change.before;
        }
        touchedChapters.add(chapterKey(change.chapter));
        touchedChapterRefs.push(change.chapter);
        draftMutated = true;
      }

      if (draftMutated) {
        workingFilesStore.commit({
          patch: { kind: "bulk", files: draft, selections },
          meta: {
            kind: action,
            scope: {
              chapters: dedupeChapterRefs(touchedChapterRefs),
            },
            dirtyTextContent: true,
          },
        });
      }

      if (touchedChapters.size) {
        refreshVisibleEditorIfTouched(
          touchedChapters,
          historicalCursorForVisible,
          leavingSnapshotForVisible,
        );
        const notificationTarget = getUndoRedoNotificationTarget({
          currentChapter: currentRef,
          touchedChapters: touchedChapterRefs,
        });
        if (notificationTarget.kind === "single-remote") {
          const remoteRecord = findChapterRecord(notificationTarget.chapter);
          const bookName =
            remoteRecord?.file.title ?? notificationTarget.chapter.bookCode;
          showNotificationInfo({
            notification: {
              title:
                labelPrefix === "Undid"
                  ? t`Undid last edit in ${bookName} ${notificationTarget.chapter.chapterNum}`
                  : t`Redid last edit in ${bookName} ${notificationTarget.chapter.chapterNum}`,
              message: "",
            },
          });
        } else if (notificationTarget.kind === "multiple") {
          showNotificationInfo({
            notification: {
              title:
                labelPrefix === "Undid"
                  ? t`Undid: ${label}`
                  : t`Redid: ${label}`,
              message: t`Affected ${notificationTarget.count} chapters`,
            },
          });
        }
      }
      bumpVersion();
    },
    [
      currentFileBibleIdentifier,
      currentChapter,
      workingFilesStore,
      findChapterRecord,
      markChapterDirty,
      setBaselineSnapshot,
      refreshVisibleEditorIfTouched,
      bumpVersion,
      t,
    ],
  );

  const captureEditorUpdate = useCallback(
    ({
      editorState,
      prevEditorState,
      dirtyElements,
      dirtyLeaves,
      tags,
      nextSelection,
    }: CaptureEditorUpdateArgs) => {
      const chapterRef: HistoryChapterRef = {
        bookCode: currentFileBibleIdentifier,
        chapterNum: currentChapter,
      };

      // Selection-only update: nothing to record — the bridge
      // publishes these as selectionOnly commits and the store keeps
      // the selection fact; history only cares about content changes.
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) {
        return;
      }

      // Content-changing commit. `nextSelection` (cursor after the
      // edit) arrives pre-captured; prevSelection from the prior
      // state is "where the cursor was right before this edit" —
      // what undo wants: landing at the start of the just-undone
      // change instead of clamping the post-change offset into the
      // now-shorter text.
      const prevSelection = prevEditorState.read($captureCurrentSelection);
      const serializedState = editorState.toJSON() as SerializedEditorStateLike;
      const nextSnapshot = chapterStateToCanonicalSnapshot(serializedState);

      const beforeSnapshot = getBaselineSnapshot(chapterRef);

      const action = classifyEditorContentUpdate({
        hasBeforeSnapshot: beforeSnapshot !== null,
        snapshotsEqual: beforeSnapshot
          ? chapterSnapshotsAreEqual(beforeSnapshot, nextSnapshot)
          : false,
        isHistoryMerge: tags.has(EDITOR_TAGS_USED.historyMerge),
        isProgrammaticIgnore: tags.has(EDITOR_TAGS_USED.programaticIgnore),
      });

      // First snapshot for this chapter / no real content change: adopt
      // baseline without recording an entry.
      if (action.kind === "first-snapshot" || action.kind === "no-op") {
        if (action.kind === "first-snapshot") {
          setBaselineSnapshot(chapterRef, nextSnapshot);
        }
        return;
      }

      if (action.kind === "history-merge") {
        // Guardrail write-back: ride the latest entry for this
        // chapter if one exists (undo shouldn't discard guardrail
        // work); with no entry to ride, stay out of undo — the
        // fixup re-derives from content, so replay doesn't need it.
        const merged = managerRef.current.mergeLatestChapterAfter(
          chapterRef,
          nextSnapshot,
          nextSelection,
        );
        setBaselineSnapshot(chapterRef, nextSnapshot);
        if (merged) {
          bumpVersion();
        }
        return;
      }
      if (action.kind === "programmatic-ignore") {
        setBaselineSnapshot(chapterRef, nextSnapshot);
        return;
      }

      // action.kind === "record-typing". The classifier only reaches
      // here with a baseline present (it returns "first-snapshot"
      // otherwise); this narrows it for TS.
      if (!beforeSnapshot) return;
      // The user is editing again: a still-pending post-replay restore
      // would yank the caret to the historical position MID-typing,
      // splicing the input across two locations. The new edit wins.
      cancelPendingRestore();
      const queuedTypingLabel = nextTypingLabelRef.current;
      const label = queuedTypingLabel?.label ?? t`Edit`;
      nextTypingLabelRef.current = null;
      // selectionBefore on a NEW typing entry = where the cursor was
      // right before this edit (prevSelection). When this entry is
      // merged with subsequent typing in the same coalesce window,
      // HistoryManager keeps the original selectionBefore and only
      // updates selectionAfter — so the entry's selectionBefore
      // stays pinned to "where the user started typing this run."
      // Fall back to the store's selection fact (the cursor riding
      // the last commit before this one) if prev wasn't readable.
      managerRef.current.recordTypingChange({
        label,
        forceNewEntry: queuedTypingLabel?.forceNewEntry,
        change: {
          chapter: chapterRef,
          before: beforeSnapshot,
          after: nextSnapshot,
          selectionBefore:
            prevSelection ?? readStoreLatestSelection(chapterRef),
          selectionAfter: nextSelection,
        },
      });
      setBaselineSnapshot(chapterRef, nextSnapshot);
      bumpVersion();
    },
    [
      currentFileBibleIdentifier,
      currentChapter,
      getBaselineSnapshot,
      readStoreLatestSelection,
      setBaselineSnapshot,
      cancelPendingRestore,
      bumpVersion,
      t,
    ],
  );

  // The single door for programmatic-mutation history: capture the pre-commit
  // world, let the verb mutate + commit however it likes (recording-draft seam,
  // sync door, or a direct draft+commit), then record what actually changed.
  // No upfront candidate list and no closure wrapping the mutation — the
  // `affected` the verb's commit MEASURED is what gets recorded.
  const captureHistory = useCallback((): HistoryRecordToken => {
    const currentRef: HistoryChapterRef = {
      bookCode: currentFileBibleIdentifier,
      chapterNum: currentChapter,
    };
    return {
      // Retained pre-commit array: the store never mutates a chapter object in
      // place (every write produces a fresh object via structural sharing), so
      // these chapters stay valid pre-images even after the commit lands.
      beforeFiles: workingFilesStore.read(),
      selectionBefore:
        getCurrentEditorSelection() ?? readStoreLatestSelection(currentRef),
      currentKey: chapterKey(currentRef),
    };
  }, [
    currentFileBibleIdentifier,
    currentChapter,
    workingFilesStore,
    getCurrentEditorSelection,
    readStoreLatestSelection,
  ]);

  const recordHistory = useCallback(
    (
      token: HistoryRecordToken,
      args: { label: string; affected: HistoryChapterRef[] },
    ) => {
      const afterFiles = workingFilesStore.read();
      const changes = dedupeChapterRefs(args.affected)
        .map((chapterRef) => {
          const key = chapterKey(chapterRef);
          const beforeChapter = findChapterRecordIn(
            token.beforeFiles,
            chapterRef,
          )?.chapter;
          const afterChapter = findChapterRecordIn(
            afterFiles,
            chapterRef,
          )?.chapter;
          // Add/remove of a chapter is not yet replayable; only record
          // chapters present before AND after (same as the prior transaction
          // recorder).
          if (!beforeChapter || !afterChapter) return null;
          // Same object under structural sharing ⇒ untouched: nothing changed.
          if (beforeChapter === afterChapter) return null;
          const before = chapterTokensToCanonicalSnapshot(
            beforeChapter.currentTokens,
            beforeChapter.direction,
          );
          const after = chapterTokensToCanonicalSnapshot(
            afterChapter.currentTokens,
            afterChapter.direction,
          );
          if (chapterSnapshotsAreEqual(before, after)) return null;
          setBaselineSnapshot(chapterRef, after);
          const selectionAfter: ChapterCursor =
            key === token.currentKey ? getCurrentEditorSelection() : null;
          return {
            chapter: chapterRef,
            before,
            after,
            selectionBefore:
              key === token.currentKey ? token.selectionBefore : null,
            selectionAfter,
          };
        })
        .filter(
          (change): change is NonNullable<typeof change> => change !== null,
        );

      if (changes.length) {
        managerRef.current.pushTransaction({ label: args.label, changes });
        bumpVersion();
      }
    },
    [
      workingFilesStore,
      setBaselineSnapshot,
      getCurrentEditorSelection,
      bumpVersion,
    ],
  );

  const setNextTypingLabel = useCallback(
    (label: string, options?: { forceNewEntry?: boolean }) => {
      nextTypingLabelRef.current = {
        label,
        forceNewEntry: options?.forceNewEntry ?? false,
      };
    },
    [],
  );

  const undo = useCallback(() => {
    if (!requireGateOpen(interactionGate.get())) return;
    const entry = managerRef.current.undo();
    if (!entry) return;
    applyEntry("undo", "before", "Undid", entry.changes, entry.label);
  }, [applyEntry, interactionGate]);

  const redo = useCallback(() => {
    if (!requireGateOpen(interactionGate.get())) return;
    const entry = managerRef.current.redo();
    if (!entry) return;
    applyEntry("redo", "after", "Redid", entry.changes, entry.label);
  }, [applyEntry, interactionGate]);

  const clearHistory = useCallback(() => {
    managerRef.current.reset();
    baselineByChapterRef.current.clear();
    nextTypingLabelRef.current = null;
    bumpVersion();
  }, [bumpVersion]);

  return useMemo(
    () => ({
      version,
      canUndo: managerRef.current.canUndo(),
      canRedo: managerRef.current.canRedo(),
      peekUndoLabel: () => managerRef.current.peekUndoLabel(),
      peekRedoLabel: () => managerRef.current.peekRedoLabel(),
      captureEditorUpdate,
      captureHistory,
      recordHistory,
      setNextTypingLabel,
      undo,
      redo,
      clearHistory,
    }),
    [
      version,
      captureEditorUpdate,
      captureHistory,
      recordHistory,
      setNextTypingLabel,
      undo,
      redo,
      clearHistory,
    ],
  );
}
