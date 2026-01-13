import { useDebouncedCallback, useThrottledCallback } from "@mantine/hooks";
import type { EditorState, LexicalEditor } from "lexical";
import { useEffect } from "react";
import { EDITOR_TAGS_USED, EditorModes } from "@/app/data/editor.ts";
import {
    maintainDocumentStructure,
    maintainDocumentStructureDebounced,
} from "@/app/domain/editor/listeners/maintainDocumentStructure.ts";
import { maintainDocumentMetaData } from "@/app/domain/editor/listeners/maintainMetadata.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

const sixtyFPS = 16;
const structuralUpdateDebounceMs = 1000;

/**
 * Hook to manage document structure maintenance for a Lexical editor.
 * Handles throttled (60fps) and debounced (1000ms) updates to maintain
 * document structure and metadata.
 *
 * @param editor - The Lexical editor instance
 */
export function useEditorStructure(editor: LexicalEditor) {
    const { project } = useWorkspaceContext();
    const { mode } = project.appSettings;
    const { bookCode } = project.pickedFile;

    const debouncedStructuralUpdates = useDebouncedCallback(
        (editorState: EditorState) => {
            return editorState.read(() => {
                console.time("debouncedStructuralUpdates");
                maintainDocumentStructureDebounced(editorState, editor);
                console.timeEnd("debouncedStructuralUpdates");
            });
        },
        structuralUpdateDebounceMs,
    );

    const throttledEditorChangeListener = useThrottledCallback(
        (editorState: EditorState) => {
            return editorState.read(() => {
                console.time("throttledEditorChangeListener");
                maintainDocumentStructure(editorState, editor);
                maintainDocumentMetaData(editorState, editor, bookCode);
                console.timeEnd("throttledEditorChangeListener");
            });
        },
        sixtyFPS,
    );

    useEffect(() => {
        if (mode === EditorModes.SOURCE) {
            console.log("mode === EditorModes.SOURCE");
            // NOOOP NO EFFECTS IN THIS MODE
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
                return throttledEditorChangeListener(editorState);
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
        mode,
        editor,
        throttledEditorChangeListener,
        debouncedStructuralUpdates,
    ]);
}
