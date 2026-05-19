import { useLingui } from "@lingui/react/macro";
import {
    $getSelection,
    type EditorState,
    type LexicalEditor,
    type SerializedEditorState,
    type SerializedLexicalNode,
} from "lexical";
import { useCallback, useMemo, useRef, useState } from "react";
import { EDITOR_TAGS_USED } from "@/app/data/editor.ts";
import { lexicalToTokens } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
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
import { ShowNotificationInfo } from "@/app/ui/components/primitives/Notifications.tsx";
import { setEditorContent } from "@/app/ui/hooks/utils/editorUtils.ts";

type CaptureEditorUpdateArgs = {
    editorState: EditorState;
    prevEditorState: EditorState;
    dirtyElements: Map<string, unknown>;
    dirtyLeaves: Set<string>;
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
type SerializedSelectionState = SerializedEditorStateLike["selection"];

const DEFAULT_MAX_ENTRIES = 200;
const DEFAULT_COALESCE_WINDOW_MS = 2500;

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

function cloneSelection(
    selection: SerializedSelectionState,
): SerializedSelectionState {
    if (selection === undefined || selection === null) return selection;
    return structuredClone(selection);
}

/**
 * Read just the current selection without serializing the whole editor state.
 *
 * `editorState.toJSON()` walks every node — on Psalm 119 that's ~300KB per
 * call. Pure selection moves (arrow keys, clicks) fire `captureEditorUpdate`
 * on every keystroke, so the selection-only branch must not pay that cost.
 *
 * Each Lexical selection class (`RangeSelection`, `NodeSelection`,
 * `TableSelection`) implements `toJSON()` returning the same shape that
 * `editorState.toJSON().selection` produces, so callers can drop in this
 * value wherever the legacy code used the toJSON-derived selection.
 */
function readSerializedSelection(
    editorState: EditorState,
): SerializedSelectionState {
    return editorState.read(() => {
        const sel = $getSelection() as { toJSON?: () => unknown } | null;
        if (!sel || typeof sel.toJSON !== "function") return null;
        return sel.toJSON() as SerializedSelectionState;
    });
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
    const baselineByChapterRef = useRef(
        new Map<string, CanonicalChapterSnapshot>(),
    );
    const baselineSelectionByChapterRef = useRef(
        new Map<string, SerializedSelectionState>(),
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

    const readSelectionFromChapter = useCallback(
        (chapterRef: HistoryChapterRef): SerializedSelectionState => {
            const record = findChapterRecord(chapterRef);
            if (!record) return undefined;
            const state = record.chapter
                .lexicalState as SerializedEditorStateLike;
            return cloneSelection(state.selection);
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
        (
            chapterRef: HistoryChapterRef,
            selection: SerializedSelectionState,
        ) => {
            const key = chapterKey(chapterRef);
            if (selection === undefined) {
                baselineSelectionByChapterRef.current.delete(key);
                return;
            }
            baselineSelectionByChapterRef.current.set(
                key,
                cloneSelection(selection),
            );
        },
        [],
    );

    const getBaselineSelection = useCallback(
        (chapterRef: HistoryChapterRef): SerializedSelectionState => {
            const key = chapterKey(chapterRef);
            if (baselineSelectionByChapterRef.current.has(key)) {
                return cloneSelection(
                    baselineSelectionByChapterRef.current.get(key),
                );
            }
            return readSelectionFromChapter(chapterRef);
        },
        [readSelectionFromChapter],
    );

    const markChapterDirty = useCallback(
        (chapter: ScriptureChapterState) => {
            chapter.currentTokens = lexicalToTokens(chapter.lexicalState, {
                bookCode: currentFileBibleIdentifier,
            });
            chapter.dirty =
                chapter.currentTokens.map((token) => token.source).join("") !==
                chapter.sourceTokens.map((token) => token.source).join("");
        },
        [currentFileBibleIdentifier],
    );

    // FUTURE WORK — undo/redo smoothness (NOT done in 0.4; see plan.md):
    //
    // When the user moves the history pointer (undo / redo), all we want
    // to change visually is the *content* of the affected chapter. We do
    // NOT want:
    //   - the editor to scroll up or down to the historical change site,
    //   - the editor to feel "inert" after the replay (no caret, no
    //     keyboard input until the user clicks back in),
    //   - the cursor to snap to wherever the historical edit happened.
    //
    // The user's current scroll position and current selection should
    // survive the replay whenever the underlying nodes still exist. If
    // the change deleted the nodes the cursor was sitting on, fall through
    // to "no selection" rather than re-applying the historical selection
    // (which is the current behavior and causes the scroll/inert feel).
    //
    // Today, `applyEntry` passes `currentChapterSelectionOverride` =
    // `change.selectionBefore | .selectionAfter` (the historical
    // selection). `setEditorContent` spreads that into the parsed state
    // and calls `editor.focus()` — that's what causes the snap. Lexical's
    // `parseEditorState` also regenerates node keys, so any in-flight DOM
    // selection by key is lost during the swap, which is the "inert"
    // symptom.
    //
    // Sketched fix (separate session):
    //   Phase A — preserve scroll:
    //     - capture `editorContainer.scrollTop` before setEditorContent
    //     - pass a sentinel meaning "leave selection alone" (do not call
    //       `editor.focus()` and do not splice a selection into the state)
    //     - restore scrollTop after
    //   Phase B (if A isn't enough) — preserve selection:
    //     - before replay, capture current anchor/focus by `data-id`
    //       (USFMTextNode's stable id, unlike Lexical's regenerated key)
    //       + offset
    //     - after replay, walk new tree for nodes with those data-ids,
    //       construct a `RangeSelection` at the same offsets
    //     - if data-ids are gone (change deleted them), leave selection
    //       cleared rather than snapping to historical
    //
    // The current `selectionOverride` parameter below is the path the
    // future work will refactor; treat it as the seam.
    const refreshVisibleEditorIfTouched = useCallback(
        (
            touched: Set<string>,
            selectionOverride?: SerializedSelectionState,
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
            setEditorContent(
                editor,
                currentRef.bookCode,
                currentRef.chapterNum,
                currentRecord.chapter,
                workingFilesStore,
                selectionOverride,
            );
        },
        [
            currentFileBibleIdentifier,
            currentChapter,
            editorRef,
            findChapterRecord,
            workingFilesStore,
        ],
    );

    const getCurrentEditorSelection =
        useCallback((): SerializedSelectionState => {
            const editor = editorRef.current;
            if (!editor) return undefined;
            const state = editor
                .getEditorState()
                .toJSON() as SerializedEditorStateLike;
            return cloneSelection(state.selection);
        }, [editorRef]);

    const captureEditorSelection = useCallback(
        (editorState: EditorState) => {
            const chapterRef: HistoryChapterRef = {
                bookCode: currentFileBibleIdentifier,
                chapterNum: currentChapter,
            };
            const serializedState =
                editorState.toJSON() as SerializedEditorStateLike;
            setBaselineSelection(chapterRef, serializedState.selection);
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
            let currentChapterSelectionOverride: SerializedSelectionState;

            const draft = structuredClone(workingFilesStore.read());
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
                const targetMode = inferChapterModeFromState(
                    record.chapter.lexicalState,
                );

                record.chapter.lexicalState = canonicalSnapshotToChapterState({
                    snapshot: targetSnapshot,
                    targetMode,
                });
                markChapterDirty(record.chapter);
                setBaselineSnapshot(change.chapter, targetSnapshot);
                setBaselineSelection(
                    change.chapter,
                    targetSelection as SerializedSelectionState,
                );
                touchedChapters.add(chapterKey(change.chapter));
                touchedChapterRefs.push(change.chapter);
                draftMutated = true;
                if (chapterKey(change.chapter) === chapterKey(currentRef)) {
                    currentChapterSelectionOverride =
                        targetSelection as SerializedSelectionState;
                }
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
                    currentChapterSelectionOverride,
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
                    ShowNotificationInfo({
                        notification: {
                            title:
                                labelPrefix === "Undid"
                                    ? t`Undid last edit in ${bookName} ${notificationTarget.chapter.chapterNum}`
                                    : t`Redid last edit in ${bookName} ${notificationTarget.chapter.chapterNum}`,
                            message: "",
                        },
                    });
                } else if (notificationTarget.kind === "multiple") {
                    ShowNotificationInfo({
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
            prevEditorState: _prevEditorState,
            dirtyElements,
            dirtyLeaves,
            tags,
        }: CaptureEditorUpdateArgs) => {
            const chapterRef: HistoryChapterRef = {
                bookCode: currentFileBibleIdentifier,
                chapterNum: currentChapter,
            };

            // Selection-only commit: skip the full toJSON. This branch fires
            // on every cursor move (arrow keys, clicks, focus changes), so
            // the cost has to be O(selection-size), not O(tree-size). See
            // `readSerializedSelection` for the cheap-read rationale.
            if (dirtyElements.size === 0 && dirtyLeaves.size === 0) {
                setBaselineSelection(
                    chapterRef,
                    readSerializedSelection(editorState),
                );
                return;
            }

            // Content-changing commit: full toJSON is needed for the
            // canonical snapshot we compare against the baseline.
            const serializedState =
                editorState.toJSON() as SerializedEditorStateLike;
            const nextSelection = cloneSelection(serializedState.selection);
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
            managerRef.current.recordTypingChange({
                label,
                forceNewEntry: queuedTypingLabel?.forceNewEntry,
                change: {
                    chapter: chapterRef,
                    before: beforeSnapshot,
                    after: nextSnapshot,
                    selectionBefore: nextSelection ?? beforeSelection,
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
            const beforeSelectionByChapter = new Map<
                string,
                SerializedSelectionState
            >();
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
                    const selectionAfter =
                        key === chapterKey(currentRef)
                            ? getCurrentEditorSelection()
                            : undefined;
                    if (key === chapterKey(currentRef)) {
                        setBaselineSelection(chapterRef, selectionAfter);
                    }
                    return {
                        chapter: chapterRef,
                        before,
                        after,
                        selectionBefore: beforeSelectionByChapter.get(key),
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
        const entry = managerRef.current.undo();
        if (!entry) return;
        applyEntry("undo", "before", "Undid", entry.changes, entry.label);
    }, [applyEntry]);

    const redo = useCallback(() => {
        const entry = managerRef.current.redo();
        if (!entry) return;
        applyEntry("redo", "after", "Redid", entry.changes, entry.label);
    }, [applyEntry]);

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
