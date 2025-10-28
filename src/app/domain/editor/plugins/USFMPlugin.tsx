import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useDebouncedCallback } from "@mantine/hooks";
import {
    $addUpdateTag,
    COMMAND_PRIORITY_HIGH,
    COMMAND_PRIORITY_NORMAL,
    type EditorState,
    KEY_DOWN_COMMAND,
    type NodeKey,
} from "lexical";
import { useEffect, useRef } from "react";
import { EditorMarkersViewStates, EditorModes } from "@/app/data/editor";
import {
    ensurePlainTextNodeAlwaysFollowsVerseRange,
    ensureVerseRangeAlwaysFollowsVerseMarker,
    lintAll,
} from "@/app/domain/editor/listeners/lintChecks";
import { toggleShowOnToggleableNodes } from "@/app/domain/editor/listeners/livePreviewToggleableNodes";
import {
    lockImmutableMarkersOnCut,
    lockImmutableMarkersOnPaste,
    lockImutableMarkersOnType,
} from "@/app/domain/editor/listeners/lockImmutableMarkers";
import {
    adjustSidsAsNeededOnTextTokens,
    mergeAdjacentTextNodesOfSameType,
    trySplitOutMarkersFromError,
} from "@/app/domain/editor/listeners/maintainMetadata";
import {
    inverseTextNodeTransform,
    textNodeTransform,
} from "@/app/domain/editor/listeners/manageUsfmMarkers";
import { redirectParaInsertionToLineBreak } from "@/app/domain/editor/listeners/useLineBreaksNotParas";
import { USFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext";
export function USFMPlugin() {
    const [editor] = useLexicalComposerContext();
    const { project, actions, lint } = useWorkspaceContext();
    const { appSettings } = project;
    const { markersMutableState, markersViewState, mode } = appSettings;
    const markersInPreview = useRef(new Set<NodeKey>());
    const lintDebounceMs = 100;

    const debouncedLint = useDebouncedCallback((editorState: EditorState) => {
        console.count(`debouncedLint`);
        // console.time("lint");
        // const messages = lintVerseRangeReferences({editorState, editor});
        ensureVerseRangeAlwaysFollowsVerseMarker({ editorState, editor });
        ensurePlainTextNodeAlwaysFollowsVerseRange({ editorState, editor });
        const errMessages = lintAll(
            { editorState, editor },
            actions.getFlatFileTokens,
        );

        // console.log(messages);
        const merged = lint.mergeInNewErrorsFromChapter(errMessages);
        if (!merged.length) {
            // sett if we actually need to clear the messages:
            const allMessagesInDom = document.querySelectorAll(".lint-error");
            if (allMessagesInDom.length === 0) {
                lint.setMessage([]);
            }
        } else {
            lint.setMessage(merged);
        }
        // console.timeEnd("lint");
    }, lintDebounceMs);

    useEffect(() => {
        if (mode === EditorModes.SOURCE) {
            console.log("mode === EditorModes.SOURCE");
            // NOOOP NO EFFECTS IN THIS MODE
            return;
        }
        // update listeners, not a transform due to needing to run on selection changes
        // Get notified when Lexical commits an update to the DOM.
        const wysiPreview = editor.registerUpdateListener(({ editorState }) => {
            if (markersViewState !== EditorMarkersViewStates.WHEN_EDITING) {
                return;
            }
            console.count("wysiPreview");

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
        const unregisterTransformWhileTyping = editor.registerNodeTransform(
            USFMTextNode,
            (node) => {
                const arg = {
                    node,
                    editor,
                    editorMode: mode,
                    markersMutableState,
                    markersViewState,
                };
                textNodeTransform(arg);
                inverseTextNodeTransform(arg);
            },
        );
        const maintainMetadata = editor.registerNodeTransform(
            USFMTextNode,
            (node) => {
                mergeAdjacentTextNodesOfSameType(node);
                trySplitOutMarkersFromError(node);
                adjustSidsAsNeededOnTextTokens(node);
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
        const pasteCommand = lockImmutableMarkersOnPaste(editor);
        const lockImmutablesOnCut = lockImmutableMarkersOnCut(editor);

        return () => {
            wysiPreview();
            unregisterTransformWhileTyping();
            maintainMetadata();
            redirectParaInsertionToLineBreakUnregister();
            lints();
            keyDownUnregister();
            pasteCommand();
            lockImmutablesOnCut();
        };
    }, [mode, markersViewState, editor, markersMutableState, debouncedLint]);

    return null;
}

/* 
FIND + go to
chapter (in addition to verse)
See Source (and sync a highlight)
*/
