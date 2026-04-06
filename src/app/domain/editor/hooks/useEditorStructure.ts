import type { EditorState, LexicalEditor } from "lexical";
import { useEffect } from "react";
import { EDITOR_MODES, EDITOR_TAGS_USED } from "@/app/data/editor.ts";
import {
    maintainDocumentStructure,
    maintainDocumentStructureDebounced,
} from "@/app/domain/editor/listeners/maintainDocumentStructure.ts";
import { maintainDocumentMetaData } from "@/app/domain/editor/listeners/maintainMetadata.ts";
import { useDebouncedCallback } from "@/app/ui/hooks/general/useDebouncedCallback.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

const changeListenerDebounceMs = 75;
const structuralUpdateDebounceMs = 200;

/**
 * Register the structural reconciliation passes for one live scripture editor.
 *
 * The editor intentionally allows transient invalid states while the user is
 * typing. This hook wires up the follow-up maintenance passes that normalize
 * structure and metadata after edits, using two different debounce windows so
 * cheap metadata updates can happen sooner than heavier structural rewrites.
 */
export function useEditorStructure(editor: LexicalEditor) {
    const { project } = useWorkspaceContext();
    const { bookCode } = project.pickedFile;
    const editorModeSetting =
        project.appSettings.editorMode ?? EDITOR_MODES.regular;

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
        if (editorModeSetting === EDITOR_MODES.view) {
            return;
        }
        const maintainMetadata = editor.registerUpdateListener(
            ({ editorState, prevEditorState, tags }) => {
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
