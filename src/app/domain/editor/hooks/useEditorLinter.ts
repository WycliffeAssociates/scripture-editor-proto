/**
 * Editor-side lint coordinator.
 *
 * The editor decides when lint work should start, but the workspace lint store
 * decides which result is current. That split keeps editor churn and async lint
 * timing from becoming the source of truth for diagnostics.
 */
import { useRouter } from "@tanstack/react-router";
import type { EditorState, LexicalEditor } from "lexical";
import { useCallback, useEffect, useRef } from "react";
import { EDITOR_MODES, EDITOR_TAGS_USED } from "@/app/data/editor.ts";
import { collectLintIssues } from "@/app/domain/editor/listeners/lintChecks.ts";
import type { LintRequestReason } from "@/app/ui/hooks/useLint.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

type ShouldRunLintForEditorUpdateArgs = {
    prevEditorStateIsEmpty: boolean;
    dirtyElementsSize: number;
    dirtyLeavesSize: number;
    tags: Set<string>;
};

export function shouldRunLintForEditorUpdate({
    prevEditorStateIsEmpty,
    dirtyElementsSize,
    dirtyLeavesSize,
    tags,
}: ShouldRunLintForEditorUpdateArgs): boolean {
    const hasProgrammaticIgnore = tags.has(EDITOR_TAGS_USED.programaticIgnore);
    const hasForcedRunTag = tags.has(EDITOR_TAGS_USED.programmaticDoRunChanges);

    // Initial hydration is already seeded with loader lint state. Skip the first
    // forced no-op update after setEditorContent() so we do not replace source-
    // based lint with a second token-based pass during mount.
    if (prevEditorStateIsEmpty) return false;

    if (hasProgrammaticIgnore && !hasForcedRunTag) return false;

    const wasOnlySelectionChange =
        dirtyElementsSize === 0 && dirtyLeavesSize === 0;
    if (wasOnlySelectionChange && !hasForcedRunTag) {
        return false;
    }

    return true;
}

/**
 * Register the lint pass for one live scripture editor.
 *
 * This hook is the bridge from Lexical mutations back into the external USFM
 * linter. It deliberately skips hydration-only and selection-only updates,
 * debounces real content changes, and also re-runs lint after undo/redo so the
 * lint pane stays aligned with whichever chapter snapshot the user restored.
 */
export function useEditorLinter(editor: LexicalEditor) {
    const { actions, history, lint, project } = useWorkspaceContext();
    const { usfmOnionService } = useRouter().options.context;
    const editorModeSetting =
        project.appSettings.editorMode ?? EDITOR_MODES.regular;
    const currentBookCode = project.pickedFile.bookCode;
    const currentChapter = project.currentChapter;
    const lintDebounceMs = 100;
    const beginLintRequest = lint.beginLintRequest;
    const commitLintResult = lint.commitLintResult;
    const visibleSnapshot = lint.visibleSnapshot;
    const getFlatFileTokensRef = useRef(actions.getFlatFileTokens);
    const beginLintRequestRef = useRef(beginLintRequest);
    const commitLintResultRef = useRef(commitLintResult);
    const usfmOnionServiceRef = useRef(usfmOnionService);
    const pendingTimerRef = useRef<number | null>(null);
    const pendingAbortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        getFlatFileTokensRef.current = actions.getFlatFileTokens;
        beginLintRequestRef.current = beginLintRequest;
        commitLintResultRef.current = commitLintResult;
        usfmOnionServiceRef.current = usfmOnionService;
    }, [
        actions.getFlatFileTokens,
        beginLintRequest,
        commitLintResult,
        usfmOnionService,
    ]);

    const clearPendingLint = useCallback(() => {
        if (pendingTimerRef.current !== null) {
            window.clearTimeout(pendingTimerRef.current);
            pendingTimerRef.current = null;
        }
        pendingAbortRef.current?.abort();
        pendingAbortRef.current = null;
    }, []);

    /**
     * Route every editor-side lint trigger through one scheduler so the timing
     * policy stays in one place. The snapshot store owns which request wins;
     * this hook only decides when to dispatch work.
     */
    const scheduleLint = useCallback(
        ({
            editorState,
            bookCode,
            chapter,
            reason,
        }: {
            editorState: EditorState;
            bookCode: string;
            chapter: number;
            reason: LintRequestReason;
        }) => {
            clearPendingLint();

            const requestId = beginLintRequestRef.current({
                reason,
                bookCode,
                chapter,
            });
            const abortController = new AbortController();
            pendingAbortRef.current = abortController;
            const delay = reason === "typing" ? lintDebounceMs : 0;

            const dispatchLint = () => {
                pendingTimerRef.current = null;
                void collectLintIssues(
                    editorState,
                    usfmOnionServiceRef.current,
                    getFlatFileTokensRef.current,
                    {
                        bookCode,
                        chapter,
                    },
                ).then((issues) => {
                    if (abortController.signal.aborted) return;
                    const didCommit = commitLintResultRef.current({
                        bookCode,
                        chapter,
                        requestId,
                        issues,
                    });
                    if (!didCommit) return;
                });
            };

            if (delay > 0) {
                pendingTimerRef.current = window.setTimeout(
                    dispatchLint,
                    delay,
                );
                return;
            }

            dispatchLint();
        },
        [clearPendingLint],
    );

    useEffect(() => {
        if (
            editorModeSetting === EDITOR_MODES.plain ||
            editorModeSetting === EDITOR_MODES.view
        ) {
            return;
        }

        const unregister = editor.registerUpdateListener(
            ({
                editorState,
                dirtyElements,
                dirtyLeaves,
                prevEditorState,
                tags,
            }) => {
                const shouldRunLint = shouldRunLintForEditorUpdate({
                    prevEditorStateIsEmpty: prevEditorState.isEmpty(),
                    dirtyElementsSize: dirtyElements.size,
                    dirtyLeavesSize: dirtyLeaves.size,
                    tags,
                });
                if (!shouldRunLint) {
                    return;
                }

                scheduleLint({
                    editorState,
                    bookCode: currentBookCode,
                    chapter: currentChapter,
                    reason: tags.has(EDITOR_TAGS_USED.programmaticDoRunChanges)
                        ? "programmatic"
                        : "typing",
                });
            },
        );

        return () => {
            clearPendingLint();
            unregister();
        };
    }, [
        editor,
        editorModeSetting,
        currentBookCode,
        currentChapter,
        scheduleLint,
        clearPendingLint,
    ]);

    useEffect(() => {
        if (
            editorModeSetting === EDITOR_MODES.plain ||
            editorModeSetting === EDITOR_MODES.view
        ) {
            return;
        }

        if (
            visibleSnapshot?.bookCode === currentBookCode &&
            visibleSnapshot.chapter === currentChapter
        ) {
            return;
        }

        scheduleLint({
            editorState: editor.getEditorState(),
            bookCode: currentBookCode,
            chapter: currentChapter,
            reason: "chapter-load",
        });
    }, [
        currentBookCode,
        currentChapter,
        editor,
        editorModeSetting,
        scheduleLint,
        visibleSnapshot,
    ]);

    useEffect(() => {
        if (
            editorModeSetting === EDITOR_MODES.plain ||
            editorModeSetting === EDITOR_MODES.view
        ) {
            return;
        }

        return history.registerPostUndoRedoAction((event) => {
            const touchedCurrentChapter = event.touchedChapters.some(
                (chapter) =>
                    chapter.bookCode === currentBookCode &&
                    chapter.chapterNum === currentChapter,
            );
            if (!touchedCurrentChapter) return;

            scheduleLint({
                editorState: editor.getEditorState(),
                bookCode: currentBookCode,
                chapter: currentChapter,
                reason: event.action,
            });
        });
    }, [
        currentBookCode,
        currentChapter,
        editor,
        editorModeSetting,
        history,
        scheduleLint,
    ]);
}
