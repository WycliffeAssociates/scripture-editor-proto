import type { LexicalEditor, LexicalNode } from "lexical";
import { escapeRegex } from "@/app/domain/search/search.utils.ts";

export type MatchInNode = {
    node: LexicalNode;
    start: number;
    end: number;
};

/**
 * Clear all CSS highlights from the DOM
 */
export function clearHighlights(): void {
    CSS.highlights.clear();
}

/**
 * Highlight a match in the DOM and scroll to it
 *
 * @param match - The match object containing node, start, and end positions
 * @param editor - The Lexical editor instance
 * @param activeSearchTerm - The search term to highlight
 * @param matchWholeWord - Whether to match whole words only
 * @param matchCase - Whether to match case-sensitively
 */
export function highlightMatch(
    match: MatchInNode,
    editor: LexicalEditor,
    activeSearchTerm: string,
    matchWholeWord: boolean,
    matchCase: boolean,
): void {
    const domEl = editor.getElementByKey(match.node.getKey());
    if (!domEl) return;

    const domTextContent = domEl.textContent;
    if (!domTextContent) return;

    // Scroll to the element
    domEl.scrollIntoView({ block: "center", behavior: "smooth" });

    const matchHighlight = new Highlight();

    if (matchWholeWord) {
        // --- Whole Word Highlight ---
        const escapedTerm = escapeRegex(activeSearchTerm);
        const regex = new RegExp(
            `\\b${escapedTerm}\\b`,
            matchCase ? "g" : "gi",
        );

        let regexMatch: RegExpExecArray | null;
        // biome-ignore lint/suspicious/noAssignInExpressions: <intentional>
        while ((regexMatch = regex.exec(domTextContent)) !== null) {
            const range = new Range();
            const firstChild = domEl.firstChild || domEl;

            // Safety check for range boundaries
            if (regexMatch.index < domTextContent.length) {
                range.setStart(firstChild, regexMatch.index);
                range.setEnd(
                    firstChild,
                    regexMatch.index + regexMatch[0].length,
                );
                matchHighlight.add(range);
            }
        }
    } else {
        // --- Substring Highlight ---
        let startIndex = 0;
        const textToSearch = matchCase
            ? domTextContent
            : domTextContent.toLowerCase();
        const termToSearch = matchCase
            ? activeSearchTerm
            : activeSearchTerm.toLowerCase();

        while (true) {
            const index = textToSearch.indexOf(termToSearch, startIndex);
            if (index === -1) break;

            const range = new Range();
            const firstChild = domEl.firstChild || domEl;
            range.setStart(firstChild, index);
            range.setEnd(firstChild, index + activeSearchTerm.length);
            matchHighlight.add(range);

            startIndex = index + activeSearchTerm.length;
        }
    }

    CSS.highlights.set("matched-search", matchHighlight);
}
