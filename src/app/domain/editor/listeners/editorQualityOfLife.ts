import { $getSelection, $isRangeSelection, type LexicalEditor } from "lexical";
import { UsfmTokenTypes } from "@/app/data/editor";
import { $isUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode"; // Adjust your import path

/**
 * A command helper that moves the selection to an adjacent node when it's contextually
 * appropriate, such as when typing a space in a marker or at the end of a number range.
 *
 * This function should be called from a KEY_DOWN_COMMAND listener when the space key is pressed.
 *
 * @param editor The Lexical editor instance.
 * @returns `true` if the selection was moved and the event should be stopped, `false` otherwise.
 */
export function moveToAdjacentNodesWhenSeemsAppropriate(
    editor: LexicalEditor,
    event: KeyboardEvent,
): boolean {
    // We will return this value. It's set to true inside the update if we handle the event.
    let isHandled = false;
    const key = event.key;
    // todo: make trigger configurable
    if (key !== " ") return false;
    const selection = $getSelection();
    // This logic only applies to a collapsed cursor (a caret), not a range selection.
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
        return false;
    }
    const anchorNode = selection.anchor.getNode();
    const anchorOffset = selection.anchor.offset;
    // Ensure we are inside a USFMTextNode before doing anything.
    if (!$isUSFMTextNode(anchorNode)) {
        return false;
    }
    const isAtEndBoundary =
        anchorOffset >= anchorNode.getTextContent().trim().length;
    if (!isAtEndBoundary) return false;

    // --- Scenario 1: Inside a 'marker' node ---
    if (
        anchorNode.getTokenType() === UsfmTokenTypes.marker ||
        anchorNode.getTokenType() === UsfmTokenTypes.endMarker
    ) {
        const nextSibling = anchorNode.getNextSibling();
        if (nextSibling && $isUSFMTextNode(nextSibling)) {
            // Move the caret to the very beginning of the next node.
            isHandled = true;
            event.preventDefault();
            event.stopPropagation();
            editor.update(() => {
                console.log("selecting next sibling");
                if (nextSibling.getTokenType() === UsfmTokenTypes.numberRange) {
                    nextSibling.selectEnd();
                } else {
                    if (!nextSibling.getTextContent().startsWith(" ")) {
                        nextSibling.setTextContent(
                            ` ${nextSibling.getTextContent()}`,
                        );
                    }
                    nextSibling.select(1, 1);
                }
            });
        }
    }
    // --- Scenario 2: Inside a 'numberRange' node ---
    else if (anchorNode.getTokenType() === UsfmTokenTypes.numberRange) {
        const nextSibling = anchorNode.getNextSibling();

        // Check if the next sibling is the specific type we want to jump to.
        if (
            $isUSFMTextNode(nextSibling) &&
            nextSibling.getTokenType() === UsfmTokenTypes.text
        ) {
            // Move the caret to the beginning of that text node.
            isHandled = true;
            event.preventDefault();
            event.stopPropagation();
            editor.update(() => {
                // if for some reason next text node doens't start with space, make sure if does.
                const nextTextContent = nextSibling.getTextContent();
                if (!nextTextContent.startsWith(" ")) {
                    nextSibling.setTextContent(` ${nextTextContent}`);
                }
                nextSibling.select(1, 1);
            });
        }
    }

    return isHandled;
}
