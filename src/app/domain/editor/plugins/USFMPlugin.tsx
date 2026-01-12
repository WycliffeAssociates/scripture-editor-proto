import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
    COMMAND_PRIORITY_HIGH,
    COMMAND_PRIORITY_NORMAL,
    KEY_DOWN_COMMAND,
    type NodeKey,
} from "lexical";
import { useEffect, useRef } from "react";
import {
    EDITOR_TAGS_USED,
    EditorMarkersViewStates,
    EditorModes,
} from "@/app/data/editor.ts";
import { useEditorLinter } from "@/app/domain/editor/hooks/useEditorLinter.ts";
import { useEditorStructure } from "@/app/domain/editor/hooks/useEditorStructure.ts";
import { moveToAdjacentNodesWhenSeemsAppropriate } from "@/app/domain/editor/listeners/editorQualityOfLife.ts";
import { toggleShowOnToggleableNodes } from "@/app/domain/editor/listeners/livePreviewToggleableNodes.ts";
import {
    lockImmutableMarkersOnCut,
    lockImmutableMarkersOnPaste,
    lockImutableMarkersOnType,
} from "@/app/domain/editor/listeners/lockImmutableMarkers.ts";
import {
    inverseTextNodeTransform,
    textNodeTransform,
} from "@/app/domain/editor/listeners/manageUsfmMarkers.ts";
import { syncReferencePaneSid } from "@/app/domain/editor/listeners/syncReferencePaneSid.ts";
import { redirectParaInsertionToLineBreak } from "@/app/domain/editor/listeners/useLineBreaksNotParas.ts";
import { USFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { correctCursorIfNeeded } from "@/app/domain/editor/utils/cursorCorrection.ts";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext.tsx";

export function USFMPlugin() {
    const [editor] = useLexicalComposerContext();
    const { project, referenceProject, projectLanguageDirection } =
        useWorkspaceContext();
    const { appSettings } = project;
    const { markersMutableState, markersViewState, mode } = appSettings;
    const markersInPreview = useRef(new Set<NodeKey>());

    // Use the editor linter hook
    useEditorLinter(editor);

    // Use the editor structure hook
    useEditorStructure(editor);

    useEffect(() => {
        // update listeners, not a transform due to needing to run on selection changes
        // Get notified when Lexical commits an update to the DOM.
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
        // todo: I think we might just want to try to do these as debounced change Listeners. I know there is potential for waterfall, but like, I kinda think we need to dfs the whole tree to ensure accurate sids on nodes positionally. Cause having accurate sids affects diffs
        // const maintainMetadata = editor.registerNodeTransform(
        //     USFMTextNode,
        //     (node) => {
        //         maintainDocumentStructure(node, editor);
        //         maintainDocumentMetaData(node, editor);
        //     },
        // );
        const unregisterTransformWhileTyping = editor.registerNodeTransform(
            USFMTextNode,
            (node) => {
                const arg = {
                    node,
                    editor,
                    editorMode: mode,
                    markersMutableState,
                    markersViewState,
                    languageDirection: projectLanguageDirection,
                };
                textNodeTransform(arg);
                inverseTextNodeTransform(arg);
            },
        );

        // keep the editor one flat list of tokens under one para parent
        const redirectParaInsertionToLineBreakUnregister =
            redirectParaInsertionToLineBreak(editor);

        // commands:
        const keyDownUnregister = editor.registerCommand(
            KEY_DOWN_COMMAND,
            (event: KeyboardEvent) => {
                return lockImutableMarkersOnType({
                    editor,
                    event,
                    markersMutableState,
                });
            },
            COMMAND_PRIORITY_NORMAL,
        );
        const moveToAdjacentNodesWhenSeemsAppropriateUnregister =
            editor.registerCommand(
                KEY_DOWN_COMMAND,
                (event: KeyboardEvent) => {
                    return moveToAdjacentNodesWhenSeemsAppropriate(
                        editor,
                        event,
                    );
                },
                COMMAND_PRIORITY_HIGH,
            );
        const pasteCommand = lockImmutableMarkersOnPaste(editor);
        const lockImmutablesOnCut = lockImmutableMarkersOnCut(editor);

        const syncRefScrollUnregister = syncReferencePaneSid(
            editor,
            referenceProject?.referenceProjectId,
        );

        // Register update listener for cursor correction
        const cursorCorrectionUnregister = editor.registerUpdateListener(
            ({ editorState, tags }) => {
                // Early exit if not in Regular mode (WYSIWYG)
                if (mode !== EditorModes.WYSIWYG) return;

                // Skip if this was triggered programmatically
                if (tags.has(EDITOR_TAGS_USED.programmaticDoRunChanges)) return;

                // Skip if editor is empty
                if (editorState.isEmpty()) return;

                // Check and correct cursor if needed
                correctCursorIfNeeded(editor);
            },
        );

        const cleanup = () => {
            wysiPreview();
            unregisterTransformWhileTyping();
            redirectParaInsertionToLineBreakUnregister();
            keyDownUnregister();
            moveToAdjacentNodesWhenSeemsAppropriateUnregister();
            pasteCommand();
            lockImmutablesOnCut();
            syncRefScrollUnregister();
            cursorCorrectionUnregister();
        };

        return cleanup;
    }, [
        mode,
        markersViewState,
        editor,
        markersMutableState,
        referenceProject?.referenceProjectId,
        projectLanguageDirection,
    ]);

    return null;
}

/* 
FIND + go to
chapter (in addition to verse)
See Source (and sync a highlight)
*/
