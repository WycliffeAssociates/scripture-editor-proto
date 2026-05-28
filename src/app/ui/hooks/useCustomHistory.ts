import { $dfsIterator } from "@lexical/utils";
import { useLingui } from "@lingui/react/macro";
import { Duration, Effect, Fiber } from "effect";
import {
    $createRangeSelection,
    $getRoot,
    $getSelection,
    $isRangeSelection,
    $setSelection,
    type EditorState,
    type LexicalEditor,
    type NodeKey,
    type SerializedEditorState,
    type SerializedLexicalNode,
} from "lexical";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EDITOR_TAGS_USED } from "@/app/data/editor.ts";
import {
    $isUSFMTextNode,
    type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    lexicalToTokens,
    tokensToUsfm,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import {
    type CanonicalChapterSnapshot,
    canonicalSnapshotToChapterState,
    chapterSnapshotsAreEqual,
    chapterStateToCanonicalSnapshot,
    inferChapterModeFromState,
} from "@/app/domain/history/canonicalChapterState.ts";
import {
    type HistoryChapterRef,
    HistoryManager,
} from "@/app/domain/history/HistoryManager.ts";
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
};

type TransactionArgs<T> = {
    label: string;
    candidates: HistoryChapterRef[];
    run: () => Promise<T> | T;
};

export type UndoRedoEvent = {
    action: "undo" | "redo";
    label: string;
    touchedChapters: HistoryChapterRef[];
};

type UseCustomHistoryArgs = {
    workingFilesStore: WorkingFilesStore;
    interactionGate: WorkspaceGateStore;
    editorRef: React.RefObject<LexicalEditor | null>;
    currentFileBibleIdentifier: string;
    currentChapter: number;
    maxEntries?: number;
    coalesceWindowMs?: number;
};

type HistoryChapterRecord = {
    file: ScriptureBookState;
    chapter: ScriptureChapterState;
};
type SerializedEditorStateLike =
    SerializedEditorState<SerializedLexicalNode> & {
        selection?: unknown | null;
    };

/**
 * Selection state keyed by USFMTextNode `data-id` instead of by Lexical
 * key. Lexical keys regenerate on every `parseEditorState`, so
 * key-based selection serializations (what `editorState.toJSON().selection`
 * produces) can't survive undo/redo replays. `data-id` is preserved
 * across re-serialization, so a CapturedSelection always re-resolves
 * if the anchor and focus nodes still exist in the target tree.
 *
 * Used everywhere in this hook in place of the legacy serialized
 * selection: baseline tracking, recorded history entries (selectionBefore
 * / selectionAfter), and the undo/redo replay restore path.
 */
type CapturedSelection = {
    anchorId: string;
    anchorOffset: number;
    focusId: string;
    focusOffset: number;
};

type ChapterCursor = CapturedSelection | null;

const DEFAULT_MAX_ENTRIES = 200;
const DEFAULT_COALESCE_WINDOW_MS = 2500;
// Long enough to land past Lexical's reconcile + flush of the replay's
// queued tagged update; short enough that one-off undo feels immediate.
// Tune down toward 30ms if a single undo feels laggy in practice.
const POST_REPLAY_RESTORE_DELAY_MS = 50;

function chapterKey(chapter: HistoryChapterRef) {
    return `${chapter.bookCode}:${chapter.chapterNum}`;
}

function dedupeChapterRefs(candidates: HistoryChapterRef[]) {
    const seen = new Set<string>();
    return candidates.filter((candidate) => {
        const key = chapterKey(candidate);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function cloneCursor(cursor: ChapterCursor): ChapterCursor {
    return cursor ? { ...cursor } : null;
}

function findChapterRecordIn(
    files: ScriptureBookState[],
    chapterRef: HistoryChapterRef,
): HistoryChapterRecord | null {
    const file = files.find(
        (candidate) => candidate.bookCode === chapterRef.bookCode,
    );
    if (!file) return null;
    const chapter = file.chapters.find(
        (candidate) => candidate.chapterNumber === chapterRef.chapterNum,
    );
    if (!chapter) return null;
    return { file, chapter };
}

/**
 * Walk up from the contenteditable to find the nearest scrolling ancestor.
 * Used so undo/redo can snapshot + restore scroll position across an editor
 * state swap.
 */
function findScrollAncestor(start: HTMLElement | null): HTMLElement | null {
    let current: HTMLElement | null = start;
    while (current) {
        const cs = window.getComputedStyle(current);
        const canScrollY =
            /(auto|scroll|overlay)/.test(cs.overflowY) &&
            current.scrollHeight > current.clientHeight;
        if (canScrollY) return current;
        current = current.parentElement;
    }
    return null;
}

/**
 * Read the current Lexical selection (range selections only) and capture
 * its anchor/focus by USFMTextNode `data-id`. Returns null when there's
 * nothing to preserve (non-range selection, selection sits on a non-USFM
 * node, or nodes lack ids). MUST be called from inside `editor.read` or
 * `editor.update`.
 */
function $captureCurrentSelection(): CapturedSelection | null {
    const sel = $getSelection();
    if (!$isRangeSelection(sel)) return null;
    const anchorNode = sel.anchor.getNode();
    const focusNode = sel.focus.getNode();
    if (!$isUSFMTextNode(anchorNode) || !$isUSFMTextNode(focusNode)) {
        return null;
    }
    const anchorId = anchorNode.getId();
    const focusId = focusNode.getId();
    if (!anchorId || !focusId) return null;
    return {
        anchorId,
        anchorOffset: sel.anchor.offset,
        focusId,
        focusOffset: sel.focus.offset,
    };
}

/**
 * Find USFMTextNodes in the current editor state by `data-id`. Single
 * DFS walk, returns both anchor and focus nodes (which may be the same).
 * MUST be called from inside `editor.read` or `editor.update`.
 */
function $findUsfmTextNodesById(
    anchorId: string,
    focusId: string,
): { anchorNode: USFMTextNode | null; focusNode: USFMTextNode | null } {
    let anchorNode: USFMTextNode | null = null;
    let focusNode: USFMTextNode | null = null;
    for (const dfsNode of $dfsIterator($getRoot())) {
        const node = dfsNode.node;
        if (!$isUSFMTextNode(node)) continue;
        const id = node.getId();
        if (anchorNode === null && id === anchorId) anchorNode = node;
        if (focusNode === null && id === focusId) focusNode = node;
        if (anchorNode && focusNode) break;
    }
    return { anchorNode, focusNode };
}

/**
 * Restore selection by `data-id` after a state replay. If both anchor
 * and focus nodes are found in the new tree, set a RangeSelection at the
 * same (clamped) offsets. If either is missing (the change deleted the
 * node the cursor was sitting on), leave the selection cleared. MUST be
 * called from inside `editor.update`.
 */
function $restoreSelectionById(captured: CapturedSelection): boolean {
    const { anchorNode, focusNode } = $findUsfmTextNodesById(
        captured.anchorId,
        captured.focusId,
    );
    if (!anchorNode || !focusNode) return false;
    const sel = $createRangeSelection();
    const anchorTextLen = anchorNode.getTextContentSize();
    const focusTextLen = focusNode.getTextContentSize();
    sel.anchor.set(
        anchorNode.getKey(),
        Math.min(captured.anchorOffset, anchorTextLen),
        "text",
    );
    sel.focus.set(
        focusNode.getKey(),
        Math.min(captured.focusOffset, focusTextLen),
        "text",
    );
    $setSelection(sel);
    return true;
}

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
    maxEntries = DEFAULT_MAX_ENTRIES,
    coalesceWindowMs = DEFAULT_COALESCE_WINDOW_MS,
}: UseCustomHistoryArgs) {
    const { t } = useLingui();
    const managerRef = useRef(
        new HistoryManager<CanonicalChapterSnapshot>({
            maxEntries,
            coalesceWindowMs,
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
    const baselineSelectionByChapterRef = useRef(
        new Map<string, CapturedSelection>(),
    );
    const nextTypingLabelRef = useRef<{
        label: string;
        forceNewEntry: boolean;
    } | null>(null);
    const undoRedoListenersRef = useRef(
        new Set<(event: UndoRedoEvent) => void>(),
    );
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
            return chapterStateToCanonicalSnapshot(record.chapter.lexicalState);
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
            const existing = baselineByChapterRef.current.get(
                chapterKey(chapterRef),
            );
            if (existing) return existing;
            return readSnapshotFromChapter(chapterRef);
        },
        [readSnapshotFromChapter],
    );

    const setBaselineSelection = useCallback(
        (chapterRef: HistoryChapterRef, cursor: ChapterCursor) => {
            const key = chapterKey(chapterRef);
            if (cursor === null) {
                baselineSelectionByChapterRef.current.delete(key);
                return;
            }
            baselineSelectionByChapterRef.current.set(key, { ...cursor });
        },
        [],
    );

    const getBaselineSelection = useCallback(
        (chapterRef: HistoryChapterRef): ChapterCursor => {
            const key = chapterKey(chapterRef);
            const existing = baselineSelectionByChapterRef.current.get(key);
            return existing ? cloneCursor(existing) : null;
        },
        [],
    );

    const markChapterDirty = useCallback(
        (chapter: ScriptureChapterState) => {
            chapter.currentTokens = lexicalToTokens(chapter.lexicalState, {
                bookCode: currentFileBibleIdentifier,
            });
            chapter.dirty =
                tokensToUsfm(chapter.currentTokens) !==
                tokensToUsfm(chapter.sourceTokens);
        },
        [currentFileBibleIdentifier],
    );

    // Undo/redo replay swaps chapter content; this hook then restores
    // focus, cursor (by USFMTextNode `data-id`, which survives
    // `parseEditorState`), and scroll position. The restore is deferred so
    // it lands after Lexical reconciles the queued tagged update from
    // `setEditorContent` — running focus/selection synchronously fights
    // reconcile and loses the contenteditable. Historical cursor wins;
    // current cursor in the old tree is a fallback when the historical
    // anchor's data-id no longer exists.
    const refreshVisibleEditorIfTouched = useCallback(
        (touched: Set<string>, historicalCursor: ChapterCursor) => {
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
                Effect.sleep(
                    Duration.millis(POST_REPLAY_RESTORE_DELAY_MS),
                ).pipe(Effect.andThen(restore)),
            );
        },
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

    const captureEditorSelection = useCallback(
        (editorState: EditorState) => {
            const chapterRef: HistoryChapterRef = {
                bookCode: currentFileBibleIdentifier,
                chapterNum: currentChapter,
            };
            setBaselineSelection(
                chapterRef,
                editorState.read($captureCurrentSelection),
            );
        },
        [currentFileBibleIdentifier, currentChapter, setBaselineSelection],
    );

    const emitUndoRedoEvent = useCallback((event: UndoRedoEvent) => {
        for (const listener of undoRedoListenersRef.current) {
            listener(event);
        }
    }, []);

    const registerPostUndoRedoAction = useCallback(
        (listener: (event: UndoRedoEvent) => void) => {
            undoRedoListenersRef.current.add(listener);
            return () => {
                undoRedoListenersRef.current.delete(listener);
            };
        },
        [],
    );

    const applyEntry = useCallback(
        (
            action: UndoRedoEvent["action"],
            direction: "before" | "after",
            labelPrefix: "Undid" | "Redid",
            chapterChanges: Array<{
                chapter: HistoryChapterRef;
                before: CanonicalChapterSnapshot;
                after: CanonicalChapterSnapshot;
                selectionBefore?: unknown;
                selectionAfter?: unknown;
            }>,
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

            const draft = workingFilesStore.draftWithChapters(
                chapterChanges.map((c) => c.chapter),
            );

            let draftMutated = false;
            for (const change of chapterChanges) {
                const record = findChapterRecordIn(draft, change.chapter);
                if (!record) continue;
                const targetSnapshot =
                    direction === "before" ? change.before : change.after;
                const targetSelection = (
                    direction === "before"
                        ? change.selectionBefore
                        : change.selectionAfter
                ) as ChapterCursor | undefined;
                const targetMode = inferChapterModeFromState(
                    record.chapter.lexicalState,
                );

                record.chapter.lexicalState = canonicalSnapshotToChapterState({
                    snapshot: targetSnapshot,
                    targetMode,
                });
                markChapterDirty(record.chapter);

                setBaselineSnapshot(change.chapter, targetSnapshot);
                setBaselineSelection(change.chapter, targetSelection ?? null);
                if (
                    chapterKey(change.chapter) === chapterKey(currentRef) &&
                    targetSelection
                ) {
                    historicalCursorForVisible = targetSelection;
                }
                touchedChapters.add(chapterKey(change.chapter));
                touchedChapterRefs.push(change.chapter);
                draftMutated = true;
            }

            if (draftMutated) {
                workingFilesStore.commit(
                    { kind: "bulk", files: draft },
                    {
                        kind: action,
                        scope: { project: true },
                        dirtyTextContent: true,
                    },
                );
            }

            if (touchedChapters.size) {
                refreshVisibleEditorIfTouched(
                    touchedChapters,
                    historicalCursorForVisible,
                );
                const notificationTarget = getUndoRedoNotificationTarget({
                    currentChapter: currentRef,
                    touchedChapters: touchedChapterRefs,
                });
                if (notificationTarget.kind === "single-remote") {
                    const remoteRecord = findChapterRecord(
                        notificationTarget.chapter,
                    );
                    const bookName =
                        remoteRecord?.file.title ??
                        notificationTarget.chapter.bookCode;
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

                emitUndoRedoEvent({
                    action,
                    label,
                    touchedChapters: dedupeChapterRefs(touchedChapterRefs),
                });
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
            setBaselineSelection,
            refreshVisibleEditorIfTouched,
            bumpVersion,
            emitUndoRedoEvent,
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
        }: CaptureEditorUpdateArgs) => {
            const chapterRef: HistoryChapterRef = {
                bookCode: currentFileBibleIdentifier,
                chapterNum: currentChapter,
            };

            // Selection-only commit: cheap path. Fires on every cursor
            // move (arrow keys, clicks, focus changes), so the cost has
            // to be O(selection-size), not O(tree-size). $captureCurrentSelection
            // reads the live $getSelection and returns a data-id-keyed
            // snapshot — no full toJSON walk.
            if (dirtyElements.size === 0 && dirtyLeaves.size === 0) {
                setBaselineSelection(
                    chapterRef,
                    editorState.read($captureCurrentSelection),
                );
                return;
            }

            // Content-changing commit. Capture the data-id-keyed cursor
            // BEFORE and AFTER the change: nextSelection from the new
            // state is "where the cursor is now," prevSelection from the
            // prior state is "where the cursor was right before this
            // edit." prevSelection is what undo wants — landing at the
            // start of the just-undone change instead of clamping the
            // post-change offset into the now-shorter text.
            const nextSelection = editorState.read($captureCurrentSelection);
            const prevSelection = prevEditorState.read(
                $captureCurrentSelection,
            );
            const serializedState =
                editorState.toJSON() as SerializedEditorStateLike;
            const nextSnapshot =
                chapterStateToCanonicalSnapshot(serializedState);

            const beforeSnapshot = getBaselineSnapshot(chapterRef);
            const beforeSelection = getBaselineSelection(chapterRef);
            if (!beforeSnapshot) {
                setBaselineSnapshot(chapterRef, nextSnapshot);
                setBaselineSelection(chapterRef, nextSelection);
                return;
            }

            if (chapterSnapshotsAreEqual(beforeSnapshot, nextSnapshot)) {
                setBaselineSelection(chapterRef, nextSelection);
                return;
            }

            if (tags.has(EDITOR_TAGS_USED.historyMerge)) {
                const merged = managerRef.current.mergeLatestChapterAfter(
                    chapterRef,
                    nextSnapshot,
                    nextSelection,
                );
                setBaselineSnapshot(chapterRef, nextSnapshot);
                setBaselineSelection(chapterRef, nextSelection);
                if (merged) {
                    bumpVersion();
                }
                if (tags.has(EDITOR_TAGS_USED.programaticIgnore)) {
                    return;
                }
            }

            if (tags.has(EDITOR_TAGS_USED.programaticIgnore)) {
                setBaselineSnapshot(chapterRef, nextSnapshot);
                setBaselineSelection(chapterRef, nextSelection);
                return;
            }

            const queuedTypingLabel = nextTypingLabelRef.current;
            const label = queuedTypingLabel?.label ?? t`Edit`;
            nextTypingLabelRef.current = null;
            // selectionBefore on a NEW typing entry = where the cursor was
            // right before this edit (prevSelection). When this entry is
            // merged with subsequent typing in the same coalesce window,
            // HistoryManager keeps the original selectionBefore and only
            // updates selectionAfter — so the entry's selectionBefore
            // stays pinned to "where the user started typing this run."
            // Fall back to the baseline (last known cursor) if prev wasn't
            // readable.
            managerRef.current.recordTypingChange({
                label,
                forceNewEntry: queuedTypingLabel?.forceNewEntry,
                change: {
                    chapter: chapterRef,
                    before: beforeSnapshot,
                    after: nextSnapshot,
                    selectionBefore: prevSelection ?? beforeSelection,
                    selectionAfter: nextSelection,
                },
            });
            setBaselineSnapshot(chapterRef, nextSnapshot);
            setBaselineSelection(chapterRef, nextSelection);
            bumpVersion();
        },
        [
            currentFileBibleIdentifier,
            currentChapter,
            getBaselineSnapshot,
            getBaselineSelection,
            setBaselineSnapshot,
            setBaselineSelection,
            bumpVersion,
            t,
        ],
    );

    const runTransaction = useCallback(
        async <T>({
            label,
            candidates,
            run,
        }: TransactionArgs<T>): Promise<T> => {
            const uniqueCandidates = dedupeChapterRefs(candidates);
            const beforeByChapter = new Map<string, CanonicalChapterSnapshot>();
            const beforeSelectionByChapter = new Map<string, ChapterCursor>();
            const currentRef: HistoryChapterRef = {
                bookCode: currentFileBibleIdentifier,
                chapterNum: currentChapter,
            };

            for (const chapterRef of uniqueCandidates) {
                const snapshot = readSnapshotFromChapter(chapterRef);
                if (!snapshot) continue;
                const key = chapterKey(chapterRef);
                beforeByChapter.set(key, snapshot);
                if (key === chapterKey(currentRef)) {
                    beforeSelectionByChapter.set(
                        key,
                        getCurrentEditorSelection() ??
                            getBaselineSelection(chapterRef),
                    );
                }
            }

            const result = await run();

            const changes = uniqueCandidates
                .map((chapterRef) => {
                    const key = chapterKey(chapterRef);
                    const before = beforeByChapter.get(key);
                    const after = readSnapshotFromChapter(chapterRef);
                    if (!before || !after) return null;
                    if (chapterSnapshotsAreEqual(before, after)) return null;
                    setBaselineSnapshot(chapterRef, after);
                    const selectionAfter: ChapterCursor =
                        key === chapterKey(currentRef)
                            ? getCurrentEditorSelection()
                            : null;
                    if (key === chapterKey(currentRef)) {
                        setBaselineSelection(chapterRef, selectionAfter);
                    }
                    return {
                        chapter: chapterRef,
                        before,
                        after,
                        selectionBefore:
                            beforeSelectionByChapter.get(key) ?? null,
                        selectionAfter,
                    };
                })
                .filter(
                    (change): change is NonNullable<typeof change> =>
                        change !== null,
                );

            if (changes.length) {
                managerRef.current.pushTransaction({
                    label,
                    changes,
                });
                bumpVersion();
            }

            return result;
        },
        [
            currentFileBibleIdentifier,
            currentChapter,
            readSnapshotFromChapter,
            setBaselineSnapshot,
            setBaselineSelection,
            getCurrentEditorSelection,
            getBaselineSelection,
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
        baselineSelectionByChapterRef.current.clear();
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
            captureEditorSelection,
            runTransaction,
            setNextTypingLabel,
            registerPostUndoRedoAction,
            undo,
            redo,
            clearHistory,
        }),
        [
            version,
            captureEditorUpdate,
            captureEditorSelection,
            runTransaction,
            setNextTypingLabel,
            registerPostUndoRedoAction,
            undo,
            redo,
            clearHistory,
        ],
    );
}
