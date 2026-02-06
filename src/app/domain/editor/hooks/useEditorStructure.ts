import { useDebouncedCallback } from "@mantine/hooks";
import type { EditorState, LexicalEditor } from "lexical";
import { useEffect } from "react";
import { EDITOR_TAGS_USED } from "@/app/data/editor.ts";
import {
    maintainDocumentStructure,
    maintainDocumentStructureDebounced,
} from "@/app/domain/editor/listeners/maintainDocumentStructure.ts";
import { maintainDocumentMetaData } from "@/app/domain/editor/listeners/maintainMetadata.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

const changeListenerDebounceMs = 300;
const structuralUpdateDebounceMs = 500;

/**
 * Hook to manage document structure maintenance for a Lexical editor.
 * Handles throttled (60fps) and debounced (1000ms) updates to maintain
 * document structure and metadata.
 *
 * @param editor - The Lexical editor instance
 */
export function useEditorStructure(editor: LexicalEditor) {
    const { project } = useWorkspaceContext();
    const { bookCode } = project.pickedFile;
    const editorModeSetting = project.appSettings.editorMode ?? "regular";

    const debouncedStructuralUpdates = useDebouncedCallback(
        (editorState: EditorState) => {
            return editorState.read(() => {
                console.time("debouncedStructuralUpdates");
                maintainDocumentStructureDebounced(
                    editorState,
                    editor,
                    project.appSettings,
                );
                console.timeEnd("debouncedStructuralUpdates");
            });
        },
        structuralUpdateDebounceMs,
    );

    const debouncedEditorChangeListener = useDebouncedCallback(
        (editorState: EditorState) => {
            return editorState.read(() => {
                console.time("throttledEditorChangeListener");
                maintainDocumentStructure(
                    editorState,
                    editor,
                    project.appSettings,
                );
                maintainDocumentMetaData(
                    editorState,
                    editor,
                    bookCode,
                    project.appSettings,
                );
                console.timeEnd("throttledEditorChangeListener");
            });
        },
        changeListenerDebounceMs,
    );

    useEffect(() => {
        if (editorModeSetting === "view") {
            return;
        }
        const maintainMetadata = editor.registerUpdateListener(
            ({
                editorState,
                dirtyElements,
                dirtyLeaves,
                prevEditorState,
                tags,
            }) => {
                // const wasOnlySelChange =
                //   dirtyElements.size === 0 && dirtyLeaves.size === 0;
                // if (
                //   !tags.has(EDITOR_TAGS_USED.programmaticDoRunChanges)
                // ) {
                //   return;
                // }
                if (prevEditorState.isEmpty()) {
                    return;
                }
                if (tags.has(EDITOR_TAGS_USED.programaticIgnore)) {
                    return;
                }
                return debouncedEditorChangeListener(editorState);
            },
        );

        const debouncedMaintainMetadata = editor.registerUpdateListener(
            ({
                editorState,
                dirtyElements,
                dirtyLeaves,
                prevEditorState,
                tags,
            }) => {
                const wasOnlySelChange =
                    dirtyElements.size === 0 && dirtyLeaves.size === 0;
                if (
                    wasOnlySelChange &&
                    !tags.has(EDITOR_TAGS_USED.programmaticDoRunChanges)
                ) {
                    return;
                }
                if (prevEditorState.isEmpty()) {
                    return;
                }
                if (tags.has(EDITOR_TAGS_USED.programaticIgnore)) {
                    return;
                }
                return debouncedStructuralUpdates(editorState);
            },
        );

        const cleanup = () => {
            maintainMetadata();
            debouncedMaintainMetadata();
        };

        return cleanup;
    }, [
        editor,
        debouncedEditorChangeListener,
        debouncedStructuralUpdates,
        editorModeSetting,
    ]);
}
