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
 * Remove all search highlight state from the shared CSS Highlight registry.
 */
export function clearHighlights(): void {
  CSS.highlights.clear();
}

/**
 * Repaint the CSS Highlight registry to match `inputs`. Pure paint — no
 * scroll. The active-match scroll is the user-navigation concern; call
 * `scrollToActiveMatchInEditor` from the navigation site instead.
 *
 * Safe to call repeatedly: idempotent given the same input. `HighlightSink`
 * calls this on every layout tick so highlights stay aligned with the live
 * editor DOM after structure fixes, chapter swaps, or any reflow.
 */
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
      const activeDomEl = editor.getElementByKey(activeMatch.node.getKey());
      if (activeDomEl) {
        const activeFirstChild = activeDomEl.firstChild;
        if (activeFirstChild && activeFirstChild.nodeType === Node.TEXT_NODE) {
          const textContent = activeFirstChild.textContent ?? "";
          if (activeMatch.start >= 0 && activeMatch.end <= textContent.length) {
            // Keep a distinct highlight for the currently selected result.
            const activeRange = new Range();
            activeRange.setStart(activeFirstChild, activeMatch.start);
            activeRange.setEnd(activeFirstChild, activeMatch.end);
            activeMatchHighlight.add(activeRange);
            hasActiveMatchRange = true;
          }
        }
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

/**
 * Scroll the active match into view. Separated from painting so the sink
 * can repaint on every layout tick without re-triggering smooth-scroll —
 * which would fight the user's own scroll position.
 */
export function scrollToActiveMatchInEditor(
  editor: LexicalEditor,
  activeMatch: MatchInNode,
): void {
  const activeDomEl = editor.getElementByKey(activeMatch.node.getKey());
  if (!activeDomEl) return;
  activeDomEl.scrollIntoView({ block: "center", behavior: "smooth" });
}
