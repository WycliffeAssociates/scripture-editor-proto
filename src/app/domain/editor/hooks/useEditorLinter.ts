import { useDebouncedCallback } from "@mantine/hooks";
import { useRouter } from "@tanstack/react-router";
import type { EditorState, LexicalEditor } from "lexical";
import { useEffect } from "react";
import { EDITOR_TAGS_USED } from "@/app/data/editor.ts";
import { lintAll } from "@/app/domain/editor/listeners/lintChecks.ts";
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
 * Hook to manage linting for a Lexical editor.
 * Registers an update listener that debounces linting and merges errors into the lint state.
 *
 * @param editor - The Lexical editor instance
 */
export function useEditorLinter(editor: LexicalEditor) {
    const { actions, history, lint, project } = useWorkspaceContext();
    const { usfmOnionService } = useRouter().options.context;
    const editorModeSetting = project.appSettings.editorMode ?? "regular";
    const currentBookCode = project.pickedFile.bookCode;
    const currentChapter = project.currentChapter;
    const lintDebounceMs = 300;

    const debouncedLint = useDebouncedCallback(
        (editorState: EditorState, bookCode: string, chapter: number) => {
            void lintAll(
                { editorState, editor },
                usfmOnionService,
                actions.getFlatFileTokens,
                { bookCode, chapter },
            ).then((issues) => {
                lint.replaceErrorsForBook(bookCode, issues);
            });
        },
        lintDebounceMs,
    );

    useEffect(() => {
        if (editorModeSetting === "plain" || editorModeSetting === "view") {
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

                debouncedLint(editorState, currentBookCode, currentChapter);
            },
        );

        return () => {
            debouncedLint.cancel();
            unregister();
        };
    }, [
        editor,
        editorModeSetting,
        debouncedLint,
        currentBookCode,
        currentChapter,
    ]);

    useEffect(() => {
        if (editorModeSetting === "plain" || editorModeSetting === "view") {
            return;
        }

        return history.registerPostUndoRedoAction((event) => {
            void (async () => {
                const touchedCurrentChapter = event.touchedChapters.some(
                    (chapter) =>
                        chapter.bookCode === currentBookCode &&
                        chapter.chapterNum === currentChapter,
                );
                if (!touchedCurrentChapter) return;

                const editorState = editor.getEditorState();
                const errMessages = await lintAll(
                    { editorState, editor },
                    usfmOnionService,
                    actions.getFlatFileTokens,
                    { bookCode: currentBookCode, chapter: currentChapter },
                );
                lint.replaceErrorsForBook(currentBookCode, errMessages);
            })();
        });
    }, [
        actions.getFlatFileTokens,
        currentBookCode,
        currentChapter,
        editor,
        editorModeSetting,
        history,
        lint,
        usfmOnionService,
    ]);
}
