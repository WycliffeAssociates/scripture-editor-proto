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
    const actualAnchorNode = anchorNode;
    const actualAnchorOffset = anchorOffset;

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

    let prev = anchorNode.getPreviousSibling();
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
