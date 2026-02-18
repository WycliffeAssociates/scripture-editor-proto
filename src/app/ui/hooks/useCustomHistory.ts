import { useLingui } from "@lingui/react/macro";
import type {
    EditorState,
    LexicalEditor,
    SerializedEditorState,
    SerializedLexicalNode,
} from "lexical";
import { useCallback, useMemo, useRef, useState } from "react";
import { EDITOR_TAGS_USED } from "@/app/data/editor.ts";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { serializeToUsfmString } from "@/app/domain/editor/serialization/lexicalToUsfm.ts";
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
    mutWorkingFilesRef: ParsedFile[];
    editorRef: React.RefObject<LexicalEditor | null>;
    currentFileBibleIdentifier: string;
    currentChapter: number;
    maxEntries?: number;
    coalesceWindowMs?: number;
};

type HistoryChapterRecord = {
    file: ParsedFile;
    chapter: ParsedChapter;
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

export type CustomHistoryHook = ReturnType<typeof useCustomHistory>;

export function useCustomHistory({
    mutWorkingFilesRef,
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
    const nextTypingLabelRef = useRef<string | null>(null);
    const undoRedoListenersRef = useRef(
        new Set<(event: UndoRedoEvent) => void>(),
    );
    const [version, setVersion] = useState(0);

    const bumpVersion = useCallback(() => {
        setVersion((prev) => prev + 1);
    }, []);

    const findChapterRecord = useCallback(
        (chapterRef: HistoryChapterRef): HistoryChapterRecord | null => {
            const file = mutWorkingFilesRef.find(
                (candidate) => candidate.bookCode === chapterRef.bookCode,
            );
            if (!file) return null;
            const chapter = file.chapters.find(
                (candidate) => candidate.chapNumber === chapterRef.chapterNum,
            );
            if (!chapter) return null;
            return { file, chapter };
        },
        [mutWorkingFilesRef],
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

    const markChapterDirty = useCallback((chapter: ParsedChapter) => {
        chapter.dirty =
            serializeToUsfmString(chapter.lexicalState.root.children) !==
            serializeToUsfmString(chapter.loadedLexicalState.root.children);
    }, []);

    const refreshVisibleEditorIfTouched = useCallback(
        (
            touched: Set<string>,
            selectionOverride?: SerializedSelectionState,
            editorStateOverride?: SerializedEditorStateLike,
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
                mutWorkingFilesRef,
                selectionOverride,
                editorStateOverride,
            );
        },
        [
            currentFileBibleIdentifier,
            currentChapter,
            editorRef,
            findChapterRecord,
            mutWorkingFilesRef,
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

    const getCurrentEditorState =
        useCallback((): SerializedEditorStateLike | null => {
            const editor = editorRef.current;
            if (!editor) return null;
            return editor
                .getEditorState()
                .toJSON() as SerializedEditorStateLike;
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
                editorStateBefore?: unknown;
                editorStateAfter?: unknown;
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
            let currentChapterEditorStateOverride:
                | SerializedEditorStateLike
                | undefined;

            for (const change of chapterChanges) {
                const record = findChapterRecord(change.chapter);
                if (!record) continue;
                const targetSnapshot =
                    direction === "before" ? change.before : change.after;
                const targetSelection =
                    direction === "before"
                        ? change.selectionBefore
                        : change.selectionAfter;
                const targetEditorState =
                    direction === "before"
                        ? change.editorStateBefore
                        : change.editorStateAfter;
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
                if (chapterKey(change.chapter) === chapterKey(currentRef)) {
                    const typedEditorState = targetEditorState as
                        | SerializedEditorStateLike
                        | undefined;
                    currentChapterEditorStateOverride = typedEditorState;
                    currentChapterSelectionOverride =
                        typedEditorState === undefined
                            ? (targetSelection as SerializedSelectionState)
                            : undefined;
                }
            }

            if (touchedChapters.size) {
                refreshVisibleEditorIfTouched(
                    touchedChapters,
                    currentChapterSelectionOverride,
                    currentChapterEditorStateOverride,
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
            const serializedState =
                editorState.toJSON() as SerializedEditorStateLike;
            const prevSerializedState =
                prevEditorState.toJSON() as SerializedEditorStateLike;
            const nextSelection = cloneSelection(serializedState.selection);
            if (dirtyElements.size === 0 && dirtyLeaves.size === 0) {
                setBaselineSelection(chapterRef, nextSelection);
                return;
            }
            const nextSnapshot =
                chapterStateToCanonicalSnapshot(serializedState);

            const beforeSnapshot = getBaselineSnapshot(chapterRef);
            const beforeSelection = getBaselineSelection(chapterRef);
            const beforeEditorState = {
                ...prevSerializedState,
                selection: nextSelection,
            };
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
                    serializedState,
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

            const label = nextTypingLabelRef.current ?? t`Edit`;
            nextTypingLabelRef.current = null;
            managerRef.current.recordTypingChange({
                label,
                change: {
                    chapter: chapterRef,
                    before: beforeSnapshot,
                    after: nextSnapshot,
                    selectionBefore: nextSelection ?? beforeSelection,
                    selectionAfter: nextSelection,
                    editorStateBefore: beforeEditorState,
                    editorStateAfter: serializedState,
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
            const beforeEditorStateByChapter = new Map<
                string,
                SerializedEditorStateLike
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
                    const currentState = getCurrentEditorState();
                    if (currentState) {
                        beforeEditorStateByChapter.set(key, currentState);
                    }
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
                    const editorStateAfter =
                        key === chapterKey(currentRef)
                            ? getCurrentEditorState()
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
                        editorStateBefore: beforeEditorStateByChapter.get(key),
                        editorStateAfter,
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
            getCurrentEditorState,
            getBaselineSelection,
            bumpVersion,
        ],
    );

    const setNextTypingLabel = useCallback((label: string) => {
        nextTypingLabelRef.current = label;
    }, []);

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
        ],
    );
}
