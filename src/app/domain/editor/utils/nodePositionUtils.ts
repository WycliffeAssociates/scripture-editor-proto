import {
    $isUSFMTextNode,
    type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";

/**
 * Calculates if the current position is visually at the start of a line,
 * accounting for hidden nodes and linebreaks.
 *
 * @param anchorNode - The USFMTextNode where the selection is anchored
 * @param anchorOffset - The offset within the anchorNode
 * @returns An object containing the calculated start-of-line status and the adjusted anchor node/offset
 */
export function calculateIsStartOfLine(
    anchorNode: USFMTextNode,
    anchorOffset: number,
): {
    isStartOfLine: boolean;
    actualAnchorNode: USFMTextNode;
    actualAnchorOffset: number;
} {
    const isNodeStart = anchorOffset === 0;

    // Determine if we're visually at the start of the line by looking back for visible nodes
    let isStartOfLineCalculated = isNodeStart;
    let actualAnchorNode = anchorNode;
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

    return {
        isStartOfLine: isStartOfLineCalculated,
        actualAnchorNode,
        actualAnchorOffset,
    };
}
