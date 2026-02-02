import type { USFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";

/**
 * Calculates if the current position is visually at the start of a line,
 * accounting for the first preceding node and linebreaks.
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

    let isStartOfLineCalculated = isNodeStart;
    const actualAnchorNode = anchorNode;
    const actualAnchorOffset = anchorOffset;

    if (isStartOfLineCalculated) {
        const prev = anchorNode.getPreviousSibling();
        if (prev && prev.getType() !== "linebreak") {
            isStartOfLineCalculated = false;
        }
    }

    return {
        isStartOfLine: isStartOfLineCalculated,
        actualAnchorNode,
        actualAnchorOffset,
    };
}
