import { $isElementNode, type LexicalNode } from "lexical";
import {
    $isUSFMTextNode,
    type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";

export function resolveTextInsertionAnchor(
    anchorNode: LexicalNode,
    anchorOffset: number,
): { anchorNode: USFMTextNode; anchorOffset: number } | null {
    if ($isUSFMTextNode(anchorNode)) {
        return { anchorNode, anchorOffset };
    }

    if ($isElementNode(anchorNode)) {
        const childCount = anchorNode.getChildrenSize();
        const boundedOffset = Math.max(0, Math.min(anchorOffset, childCount));

        // Prefer a text sibling before the caret so insertion happens at the visual cursor position.
        let before =
            boundedOffset > 0
                ? anchorNode.getChildAtIndex(boundedOffset - 1)
                : null;
        while (before) {
            if ($isUSFMTextNode(before)) {
                return {
                    anchorNode: before,
                    anchorOffset: before.getTextContent().length,
                };
            }
            before = before.getPreviousSibling();
        }

        // Fallback to first text sibling after the caret.
        let after =
            boundedOffset < childCount
                ? anchorNode.getChildAtIndex(boundedOffset)
                : null;
        while (after) {
            if ($isUSFMTextNode(after)) {
                return {
                    anchorNode: after,
                    anchorOffset: 0,
                };
            }
            after = after.getNextSibling();
        }
    }

    return null;
}
