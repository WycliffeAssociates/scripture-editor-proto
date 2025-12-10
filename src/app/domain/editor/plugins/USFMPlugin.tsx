import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useDebouncedCallback, useThrottledCallback } from "@mantine/hooks";
import {
    COMMAND_PRIORITY_HIGH,
    COMMAND_PRIORITY_NORMAL,
    type EditorState,
    KEY_DOWN_COMMAND,
    type NodeKey,
} from "lexical";
import { useEffect, useRef } from "react";
import {
    EDITOR_TAGS_USED,
    EditorMarkersViewStates,
    EditorModes,
} from "@/app/data/editor.ts";
import { moveToAdjacentNodesWhenSeemsAppropriate } from "@/app/domain/editor/listeners/editorQualityOfLife.ts";
import { lintAll } from "@/app/domain/editor/listeners/lintChecks.ts";
import { toggleShowOnToggleableNodes } from "@/app/domain/editor/listeners/livePreviewToggleableNodes.ts";
import {
    lockImmutableMarkersOnCut,
    lockImmutableMarkersOnPaste,
    lockImutableMarkersOnType,
} from "@/app/domain/editor/listeners/lockImmutableMarkers.ts";
import {
    maintainDocumentStructure,
    maintainDocumentStructureDebounced,
} from "@/app/domain/editor/listeners/maintainDocumentStructure.ts";
import { maintainDocumentMetaData } from "@/app/domain/editor/listeners/maintainMetadata.ts";
import {
    inverseTextNodeTransform,
    textNodeTransform,
} from "@/app/domain/editor/listeners/manageUsfmMarkers.ts";

import { syncReferencePaneSid } from "@/app/domain/editor/listeners/syncReferencePaneSid.ts";
import { redirectParaInsertionToLineBreak } from "@/app/domain/editor/listeners/useLineBreaksNotParas.ts";
import { USFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext.tsx";
export function USFMPlugin() {
    const [editor] = useLexicalComposerContext();
    const {
        project,
        actions,
        lint,
        referenceProject,
        projectLanguageDirection,
    } = useWorkspaceContext();
    const { appSettings } = project;
    const { markersMutableState, markersViewState, mode } = appSettings;
    const markersInPreview = useRef(new Set<NodeKey>());
    const lintDebounceMs = 300;
    const sixtyFPS = 16;
    const structuralUpdateDebounceMs = 1000;

    const debouncedLint = useDebouncedCallback((editorState: EditorState) => {
        const errMessages = lintAll(
            { editorState, editor },
            actions.getFlatFileTokens,
        );

        lint.mergeInNewErrorsFromChapter(errMessages);
    }, lintDebounceMs);

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
                maintainDocumentMetaData(
                    editorState,
                    editor,
                    project.pickedFile.bookCode,
                );
                console.timeEnd("throttledEditorChangeListener");
                // for (const dfsNode of $dfs()) {
                // }
                // console.timeEnd("throttledEditorChangeListener");
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

        const lints = editor.registerUpdateListener(
            ({ editorState, tags: _tags }) => {
                if (mode !== EditorModes.WYSIWYG) {
                    return;
                }
                //   console.log({tags});
                debouncedLint(editorState);
            },
        );

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

        const cleanup = () => {
            wysiPreview();
            unregisterTransformWhileTyping();
            maintainMetadata();
            debouncedMaintainMetadata();
            redirectParaInsertionToLineBreakUnregister();
            lints();
            keyDownUnregister();
            moveToAdjacentNodesWhenSeemsAppropriateUnregister();
            pasteCommand();
            lockImmutablesOnCut();
            syncRefScrollUnregister();
        };

        return cleanup;
    }, [
        mode,
        markersViewState,
        editor,
        markersMutableState,
        debouncedLint,
        throttledEditorChangeListener,
        referenceProject?.referenceProjectId,
        debouncedStructuralUpdates,
        projectLanguageDirection,
    ]);

    return null;
}

/* 
FIND + go to
chapter (in addition to verse)
See Source (and sync a highlight)
*/
