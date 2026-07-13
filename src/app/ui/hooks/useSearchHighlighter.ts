import type { LexicalEditor } from "lexical";

import {
  locateUtf16Offset,
  tokenElement,
} from "@/app/domain/editor/annotations/resolveContentRange.ts";
import type { SearchMatch } from "@/app/ui/hooks/search/searchTypes.ts";

type EditorHighlightInput = {
  editor: LexicalEditor;
  matches: SearchMatch[];
  activeMatch?: SearchMatch;
};

/**
 * Build DOM Ranges for a match's text-like sub-ranges. One match may span
 * several tokens (a multi-token USFM-mode match) → several Ranges. Tokens whose
 * element is missing (offscreen/virtualized) are skipped.
 */
function rangesForMatch(root: HTMLElement, match: SearchMatch): Range[] {
  const ranges: Range[] = [];
  for (const paintRange of match.ranges) {
    const el = tokenElement(root, paintRange.tokenId);
    if (!el) continue;
    const start = locateUtf16Offset(el, paintRange.start);
    const end = locateUtf16Offset(el, paintRange.end);
    if (!start || !end) continue;
    const range = el.ownerDocument.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    ranges.push(range);
  }
  return ranges;
}

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
    const root = editor.getRootElement();
    if (!root) continue;

    for (const match of matches) {
      for (const range of rangesForMatch(root, match)) {
        allMatchesHighlight.add(range);
        hasAllMatchRanges = true;
      }
    }

    if (activeMatch) {
      for (const range of rangesForMatch(root, activeMatch)) {
        // Keep a distinct highlight for the currently selected result.
        activeMatchHighlight.add(range);
        hasActiveMatchRange = true;
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
  activeMatch: SearchMatch,
): void {
  const root = editor.getRootElement();
  const firstRange = activeMatch.ranges[0];
  if (!root || !firstRange) return;
  const el = tokenElement(root, firstRange.tokenId);
  el?.scrollIntoView({ block: "center", behavior: "smooth" });
}

/**
 * Scroll to a verse by sid, via the `data-sid` attribute every rendered token
 * carries. For navigation that has no match to anchor on — e.g. landing on a
 * verse after a mode toggle re-runs search and the original term no longer
 * matches the new projection.
 */
export function scrollToSidInEditor(editor: LexicalEditor, sid: string): void {
  const root = editor.getRootElement();
  if (!root) return;
  const escaped =
    typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(sid)
      : sid.replace(/["\\]/gu, "\\$&");
  const el = root.querySelector(`[data-sid="${escaped}"]`);
  el?.scrollIntoView({ block: "center", behavior: "smooth" });
}
