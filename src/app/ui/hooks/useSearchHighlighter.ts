import type { LexicalEditor, LexicalNode } from "lexical";

export type MatchInNode = {
    node: LexicalNode;
    start: number;
    end: number;
};

type EditorHighlightInput = {
    editor: LexicalEditor;
    matches: MatchInNode[];
    activeMatch?: MatchInNode;
};

/**
 * Clear all CSS highlights from the DOM
 */
export function clearHighlights(): void {
    CSS.highlights.clear();
}

/**
 * Highlight all chapter matches and optionally emphasize one active match.
 * Also scrolls the active match into view when present.
 *
 * @param matches - All matches in the current chapter
 * @param editor - The Lexical editor instance
 * @param activeMatch - The currently selected match to emphasize
 */
export function highlightMatches(
    matches: MatchInNode[],
    editor: LexicalEditor,
    activeMatch?: MatchInNode,
): void {
    highlightMatchesAcrossEditors([{ editor, matches, activeMatch }]);
}

export function highlightMatchesAcrossEditors(
    inputs: EditorHighlightInput[],
): void {
    const allMatchesHighlight = new Highlight();
    const activeMatchHighlight = new Highlight();
    let hasAllMatchRanges = false;
    let hasActiveMatchRange = false;

    for (const { editor, matches, activeMatch } of inputs) {
        for (const match of matches) {
            const domEl = editor.getElementByKey(match.node.getKey());
            if (!domEl) continue;

            const firstChild = domEl.firstChild;
            if (!firstChild || firstChild.nodeType !== Node.TEXT_NODE) {
                continue;
            }

            const textContent = firstChild.textContent ?? "";
            if (match.start < 0 || match.end > textContent.length) continue;

            const range = new Range();
            range.setStart(firstChild, match.start);
            range.setEnd(firstChild, match.end);
            allMatchesHighlight.add(range);
            hasAllMatchRanges = true;
        }

        if (activeMatch) {
            const activeDomEl = editor.getElementByKey(
                activeMatch.node.getKey(),
            );
            if (activeDomEl) {
                const activeFirstChild = activeDomEl.firstChild;
                if (
                    activeFirstChild &&
                    activeFirstChild.nodeType === Node.TEXT_NODE
                ) {
                    const textContent = activeFirstChild.textContent ?? "";
                    if (
                        activeMatch.start >= 0 &&
                        activeMatch.end <= textContent.length
                    ) {
                        // Keep a distinct highlight for the currently selected result.
                        const activeRange = new Range();
                        activeRange.setStart(
                            activeFirstChild,
                            activeMatch.start,
                        );
                        activeRange.setEnd(activeFirstChild, activeMatch.end);
                        activeMatchHighlight.add(activeRange);
                        hasActiveMatchRange = true;
                    }
                }

                // Scroll the active match into view.
                activeDomEl.scrollIntoView({
                    block: "center",
                    behavior: "smooth",
                });
            }
        }
    }

    if (hasAllMatchRanges) {
        CSS.highlights.set("matched-search", allMatchesHighlight);
    } else {
        CSS.highlights.delete("matched-search");
    }

    if (hasActiveMatchRange) {
        CSS.highlights.set("matched-search-current", activeMatchHighlight);
    } else {
        CSS.highlights.delete("matched-search-current");
    }
}
