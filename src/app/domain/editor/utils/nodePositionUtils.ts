import type { LexicalEditor, LexicalNode } from "lexical";
import type { EditorModeSetting } from "@/app/data/editor.ts";
import {
    $isUSFMTextNode,
    type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";

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
    opts?: {
        editor?: LexicalEditor;
        editorMode?: EditorModeSetting;
    },
): {
    isStartOfLine: boolean;
    actualAnchorNode: USFMTextNode;
    actualAnchorOffset: number;
} {
    let actualAnchorNode = anchorNode;
    let actualAnchorOffset = anchorOffset;

    const isDomHidden = (node: LexicalNode) => {
        const editor = opts?.editor;
        if (!editor) return false;
        const el = editor.getElementByKey(node.getKey());
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display === "none" || style.visibility === "hidden";
    };

    // In regular mode, marker tokens are hidden via CSS, so the caret can be "visually"
    // at the start of a line while still being inside a hidden marker node (e.g. inside `\\v `).
    const anchorIsHidden =
        isDomHidden(anchorNode) ||
        (opts?.editorMode === "regular" &&
            (anchorNode.getTokenType() === "marker" ||
                anchorNode.getTokenType() === "endMarker"));

    const isStartCandidate =
        anchorOffset === 0 ||
        (anchorIsHidden && anchorOffset >= anchorNode.getTextContent().length);

    if (!isStartCandidate) {
        return {
            isStartOfLine: false,
            actualAnchorNode,
            actualAnchorOffset,
        };
    }

    // If the caret is sitting at the end of a hidden structural marker (e.g. `\v `)
    // in regular mode, treat that as the start of the line for insertion purposes.
    if (
        opts?.editorMode === "regular" &&
        anchorIsHidden &&
        (anchorNode.getTokenType() === "marker" ||
            anchorNode.getTokenType() === "endMarker")
    ) {
        const m = anchorNode.getMarker();
        if (
            (m === "v" || m === "c") &&
            anchorOffset >= anchorNode.getTextContent().length
        ) {
            actualAnchorOffset = 0;
        }
    }

    // In regular mode, the caret can be visually at the start of a line while the
    // selection is anchored on the first visible token (e.g. verse number), with one
    // or more hidden marker nodes immediately before it (e.g. `\v `). If we insert
    // at the visible token, we can end up splitting `\v` from its number.
    //
    // When we're at a start-of-line candidate, shift the anchor backward to the
    // earliest contiguous hidden marker immediately preceding the anchor.
    if (
        opts?.editorMode === "regular" &&
        anchorOffset === 0 &&
        !anchorIsHidden
    ) {
        let prev = anchorNode.getPreviousSibling();
        let targetStructuralMarker: USFMTextNode | null = null;

        while (prev) {
            if (prev.getType() === "linebreak") {
                break;
            }

            if (!$isUSFMTextNode(prev)) {
                break;
            }

            const tt = prev.getTokenType();
            if (tt !== "marker" && tt !== "endMarker") {
                break;
            }

            if (tt === "marker") {
                const m = prev.getMarker();
                if (m === "v" || m === "c") {
                    targetStructuralMarker = prev;
                }
            }

            prev = prev.getPreviousSibling();
        }

        if (targetStructuralMarker) {
            actualAnchorNode = targetStructuralMarker;
            actualAnchorOffset = 0;
        }
    }

    let prev = actualAnchorNode.getPreviousSibling();
    while (prev) {
        // A visible linebreak is a hard start-of-line boundary.
        if (prev.getType() === "linebreak") {
            if (!isDomHidden(prev)) {
                return {
                    isStartOfLine: true,
                    actualAnchorNode,
                    actualAnchorOffset,
                };
            }
            // If the linebreak is hidden (regular mode hides marker+br), ignore it.
            prev = prev.getPreviousSibling();
            continue;
        }

        // If we have DOM access, trust computed visibility.
        if (isDomHidden(prev)) {
            prev = prev.getPreviousSibling();
            continue;
        }

        // Heuristic fallback when DOM is unavailable: in regular mode, marker tokens are hidden.
        if (opts?.editorMode === "regular" && $isUSFMTextNode(prev)) {
            const tt = prev.getTokenType();
            if (tt === "marker" || tt === "endMarker") {
                prev = prev.getPreviousSibling();
                continue;
            }
        }

        // Any remaining preceding sibling counts as content before caret.
        return {
            isStartOfLine: false,
            actualAnchorNode,
            actualAnchorOffset,
        };
    }

    return {
        isStartOfLine: true,
        actualAnchorNode,
        actualAnchorOffset,
    };
}
