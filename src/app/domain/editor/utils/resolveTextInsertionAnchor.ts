import { $isElementNode, type LexicalNode } from "lexical";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { $isUSFMParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    $createUSFMTextNode,
    $isUSFMTextNode,
    type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";

/**
 * Resolve a real USFM text node near a selection anchor.
 *
 * Paste/insert flows can land on element boundaries instead of directly inside a
 * text node. This helper snaps that location to the nearest concrete USFM text
 * node so downstream insertion code can mutate the editor tree safely.
 */
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
        const immediateBefore =
            boundedOffset > 0
                ? anchorNode.getChildAtIndex(boundedOffset - 1)
                : null;
        const immediateAfter =
            boundedOffset < childCount
                ? anchorNode.getChildAtIndex(boundedOffset)
                : null;

        // Preserve line-boundary intent. If the caret sits just after a line break,
        // anchoring to an earlier text sibling jumps insertion back onto the
        // previous visual line.
        if (immediateBefore?.getType() === "linebreak") {
            let after = immediateAfter;
            while (after) {
                if ($isUSFMTextNode(after)) {
                    return {
                        anchorNode: after,
                        anchorOffset: 0,
                    };
                }
                after = after.getNextSibling();
            }

            // A plain Enter can leave the caret on an element boundary after a
            // trailing linebreak with no text node yet materialized on the new
            // visual line. Create the smallest placeholder anchor so toolbar
            // insertions target the current line rather than the previous one.
            if ($isUSFMParagraphNode(anchorNode)) {
                const placeholder = $createUSFMTextNode(" ", {
                    id: guidGenerator(),
                    tokenType: UsfmTokenTypes.text,
                    sid: anchorNode.getSid(),
                    inPara: anchorNode.getMarker() ?? anchorNode.getInPara(),
                });
                immediateBefore.insertAfter(placeholder);
                return {
                    anchorNode: placeholder,
                    anchorOffset: 0,
                };
            }
        }

        // Prefer a text sibling before the caret so insertion happens at the visual cursor position.
        let before = immediateBefore;
        while (before) {
            if (before.getType() === "linebreak") {
                break;
            }
            if ($isUSFMTextNode(before)) {
                return {
                    anchorNode: before,
                    anchorOffset: before.getTextContent().length,
                };
            }
            before = before.getPreviousSibling();
        }

        // Fallback to first text sibling after the caret.
        let after = immediateAfter;
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
