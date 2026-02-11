import type { RangeSelection } from "lexical";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { $isUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";

/**
 * When a selection starts inside a verse number ("numberRange") node, expand the
 * selection to include the immediately preceding verse marker ("\\v") node.
 *
 * This is primarily used in Regular (WYSIWYG) mode so copy/cut of a verse number
 * preserves the required USFM marker on paste.
 *
 * Returns `true` if the selection was expanded.
 */
export function expandSelectionToIncludePrecedingVerseMarker(
    selection: RangeSelection,
): boolean {
    if (selection.isCollapsed()) return false;

    const startPoint = selection.isBackward()
        ? selection.focus
        : selection.anchor;
    const startNode = startPoint.getNode();

    if (!$isUSFMTextNode(startNode)) return false;
    if (startNode.getTokenType() !== UsfmTokenTypes.numberRange) return false;

    const prevSibling = startNode.getPreviousSibling();
    if (!prevSibling || !$isUSFMTextNode(prevSibling)) return false;
    if (prevSibling.getTokenType() !== UsfmTokenTypes.marker) return false;
    if (prevSibling.getMarker() !== "v") return false;

    startPoint.set(prevSibling.getKey(), 0, "text");
    return true;
}
