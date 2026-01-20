import type { LexicalEditor, NodeKey } from "lexical";
import { useEffect, useRef } from "react";
import {
    EDITOR_TAGS_USED,
    EditorMarkersMutableStates,
    EditorMarkersViewStates,
    EditorModes,
} from "@/app/data/editor.ts";
import { toggleShowOnToggleableNodes } from "@/app/domain/editor/listeners/livePreviewToggleableNodes.ts";
import { syncReferencePaneSid } from "@/app/domain/editor/listeners/syncReferencePaneSid.ts";
import { correctCursorIfNeeded } from "@/app/domain/editor/utils/cursorCorrection.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

/**
 * Hook to manage visual-only updates in the editor.
 * Handles marker preview toggling, reference pane synchronization, and cursor correction.
 *
 * @param editor - The Lexical editor instance
 */
export function useEditorView(editor: LexicalEditor) {
    const { project, referenceProject } = useWorkspaceContext();
    const { appSettings } = project;
    const { markersViewState, mode, markersMutableState } = appSettings;

    // Internal ref to track which markers are currently being previewed
    const markersInPreview = useRef(new Set<NodeKey>());

    useEffect(() => {
        // Register wysiPreview listener for toggleable node visibility
        const wysiPreview = editor.registerUpdateListener(({ editorState }) => {
            if (markersViewState !== EditorMarkersViewStates.WHEN_EDITING) {
                return;
            }
            toggleShowOnToggleableNodes({
                editor,
                editorState,
                markersViewState,
                currentActive: markersInPreview.current,
                markersMutableState,
                setCurrentActive: (activeNodes) => {
                    markersInPreview.current = activeNodes;
                },
            });
        });

        // Register syncReferencePaneSid to synchronize reference pane scrolling
        const syncRefScrollUnregister = syncReferencePaneSid(
            editor,
            referenceProject?.referenceProjectId,
        );

        // Register update listener for cursor correction
        const cursorCorrectionUnregister = editor.registerUpdateListener(
            ({ editorState, tags }) => {
                // Early exit if not in Regular mode (WYSIWYG + Immutable markers)
                if (
                    mode !== EditorModes.WYSIWYG ||
                    markersMutableState !== EditorMarkersMutableStates.IMMUTABLE
                ) {
                    return;
                }

                // Skip if this was triggered programmatically
                if (tags.has(EDITOR_TAGS_USED.programmaticDoRunChanges)) return;

                // Skip if editor is empty
                if (editorState.isEmpty()) return;

                // Check and correct cursor if needed
                correctCursorIfNeeded(editor);
            },
        );

        // Cleanup function to unregister all listeners
        const cleanup = () => {
            wysiPreview();
            syncRefScrollUnregister();
            cursorCorrectionUnregister();
        };

        return cleanup;
    }, [
        editor,
        markersViewState,
        mode,
        markersMutableState,
        referenceProject?.referenceProjectId,
    ]);
}
