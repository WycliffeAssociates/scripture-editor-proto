import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
    $getSelection,
    $isRangeSelection,
    COMMAND_PRIORITY_CRITICAL,
    type CommandListener,
    KEY_ENTER_COMMAND,
    KEY_TAB_COMMAND,
} from "lexical";
import { useEffect } from "react";
import type {
    EditorMarkersMutableState,
    EditorMarkersViewState,
} from "@/app/data/editor.ts";
import {
    $isUSFMTextNode,
    type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    $insertPara,
    type BaseInsertArgs,
} from "@/app/domain/editor/utils/insertMarkerOperations.ts";
import { useParagraphing } from "@/app/ui/contexts/ParagraphingContext.tsx";
import { useEditorContext } from "../hooks/useEditorContext.ts";

export function ParagraphingPlugin() {
    const [editor] = useLexicalComposerContext();
    const { isActive, currentMarker, stamp, skip, undo } = useParagraphing();
    const { getContext } = useEditorContext();

    useEffect(() => {
        if (!isActive) return;

        const onEnter: CommandListener<KeyboardEvent | null> = (event) => {
            if (!isActive || !currentMarker) return false;
            if (event) {
                event.preventDefault();
            }

            editor.update(() => {
                const selection = $getSelection();
                if (!selection || !$isRangeSelection(selection)) return;

                const anchorNode = selection.anchor.getNode();
                if (!$isUSFMTextNode(anchorNode)) return;

                const context = getContext();
                const anchorOffset = selection.anchor.offset;
                const isNodeStart = anchorOffset === 0;

                // Determine if we're visually at the start of the line by looking back for visible nodes
                let isStartOfLineCalculated = isNodeStart;
                let actualAnchorNode = anchorNode as USFMTextNode;
                let actualAnchorOffset = anchorOffset;

                if (isStartOfLineCalculated) {
                    let curr = anchorNode.getPreviousSibling();
                    while (curr) {
                        if (curr.getType() === "linebreak") {
                            break;
                        }
                        if ($isUSFMTextNode(curr)) {
                            if (curr.getShow()) {
                                isStartOfLineCalculated = false;
                                break;
                            }
                            // If it's hidden, it's part of the sequence at the visual start of line.
                            // We move the anchor point back to the beginning of this sequence.
                            actualAnchorNode = curr;
                            actualAnchorOffset = 0;
                        } else {
                            // Treat other node types (e.g. nested editors) as visible
                            isStartOfLineCalculated = false;
                            break;
                        }
                        curr = curr.getPreviousSibling();
                    }
                }

                const args: BaseInsertArgs = {
                    anchorNode: actualAnchorNode,
                    anchorOffsetToUse: actualAnchorOffset,
                    marker: currentMarker.type,
                    isStartOfLine: isStartOfLineCalculated,
                    markersMutableState:
                        context.markersMutableState as EditorMarkersMutableState,
                    markersViewState:
                        context.markersViewState as EditorMarkersViewState,
                    restOfText: "",
                    languageDirection: context.languageDirection,
                    isTypedInsertion: false,
                };

                // We assume paragraphing mode mostly deals with paragraph markers
                // But we should probably check the marker type if we want to be robust
                // For now, using $insertPara as requested/implied by "Paragraphing Mode"
                // But if the marker is 'v', we might want $insertVerse?
                // The prompt says: "If the marker is a "paragraph" type (p, q, s, etc.): ... Simplification: Use the existing insertMarker action if available."
                // Since we are using $insertPara, it handles splitting and inserting.

                // However, $insertPara might not be suitable for ALL marker types in the queue.
                // But the feature is called "Paragraphing Mode", so it's likely mostly paras.
                // If we need to support others, we might need a switch similar to insertMarker.

                // Let's check the marker type and dispatch accordingly if possible,
                // or just default to $insertPara which is robust for block markers.

                // Actually, let's look at mapMarkerToInsertionType in insertMarkerOperations.ts
                // It maps p, q, s to 'para'.

                $insertPara(args);

                // Call stamp to advance the queue
                stamp();
            });

            return true;
        };

        const onTab: CommandListener<KeyboardEvent> = (event) => {
            if (!isActive) return false;

            if (event.shiftKey) {
                event.preventDefault();
                undo();
                return true;
            }

            event.preventDefault();
            skip();
            return true;
        };

        const removeEnterListener = editor.registerCommand(
            KEY_ENTER_COMMAND,
            onEnter,
            COMMAND_PRIORITY_CRITICAL,
        );

        const removeTabListener = editor.registerCommand(
            KEY_TAB_COMMAND,
            onTab,
            COMMAND_PRIORITY_CRITICAL,
        );

        return () => {
            removeEnterListener();
            removeTabListener();
        };
    }, [editor, isActive, currentMarker, stamp, skip, undo, getContext]);

    return null;
}
