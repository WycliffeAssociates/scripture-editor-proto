import { useDebouncedCallback } from "@mantine/hooks";
import type { EditorState, LexicalEditor } from "lexical";
import { useEffect } from "react";
import { lintAll } from "@/app/domain/editor/listeners/lintChecks.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

/**
 * Hook to manage linting for a Lexical editor.
 * Registers an update listener that debounces linting and merges errors into the lint state.
 *
 * @param editor - The Lexical editor instance
 */
export function useEditorLinter(editor: LexicalEditor) {
    const { actions, lint, project } = useWorkspaceContext();
    const editorModeSetting = project.appSettings.editorMode ?? "regular";
    const lintDebounceMs = 300;

    const debouncedLint = useDebouncedCallback((editorState: EditorState) => {
        const errMessages = lintAll(
            { editorState, editor },
            actions.getFlatFileTokens,
        );

        lint.mergeInNewErrorsFromChapter(errMessages);
    }, lintDebounceMs);

    useEffect(() => {
        if (editorModeSetting === "plain") {
            return;
        }

        const unregister = editor.registerUpdateListener(({ editorState }) => {
            debouncedLint(editorState);
        });

        return () => {
            unregister();
        };
    }, [editor, editorModeSetting, debouncedLint]);
}
