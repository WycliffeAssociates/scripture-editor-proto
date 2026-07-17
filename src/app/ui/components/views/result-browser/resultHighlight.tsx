import type React from "react";

import * as styles from "@/app/ui/styles/modules/SearchPanel.css.ts";

import type { ResultHighlight } from "./resultRow.ts";

const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

/**
 * Match-mode highlight: mark a live term in `text`, optionally previewing a
 * replacement on the occurrence the row's stepper sits on. Literal escaping,
 * case, and whole-word behavior match the legacy Find preview exactly.
 */
function renderMatchHighlight(
  text: string,
  highlight: Extract<ResultHighlight, { mode: "match" }>,
  replacement: string,
  previewOccurrenceIndex: number,
  activeOccurrenceIndex: number | null,
): React.ReactNode {
  const { term, matchCase, matchWholeWord } = highlight;
  if (!term) return text;

  const flags = matchCase ? "g" : "gi";
  const escapedTerm = term.replace(REGEX_SPECIAL_CHARS, "\\$&");
  const pattern = matchWholeWord
    ? `\\b(${escapedTerm})\\b`
    : `(${escapedTerm})`;
  const regex = new RegExp(pattern, flags);
  const parts = text.split(regex);
  // Preview the replacement on the occurrence Replace will hit, not always the
  // first — keeps the strikethrough in sync with the row's stepper.
  let matchOrdinal = -1;

  return parts.map((part, index) => {
    const isMatch = matchCase
      ? part === term
      : part.toLowerCase() === term.toLowerCase();

    if (isMatch) {
      matchOrdinal += 1;
      if (replacement.length > 0 && matchOrdinal === previewOccurrenceIndex) {
        return (
          <span
            key={`${index}-${part}`}
            className={styles.searchReplacementPreview}
          >
            <span className={styles.searchReplacementOld}>{part}</span>
            <span className={styles.searchReplacementNew}>{replacement}</span>
          </span>
        );
      }
      const isActiveOccurrence = matchOrdinal === activeOccurrenceIndex;
      return (
        <mark
          key={`${index}-${part}`}
          className={
            isActiveOccurrence
              ? styles.searchHighlightActive
              : styles.searchHighlight
          }
        >
          {part}
        </mark>
      );
    }
    return part;
  });
}

/**
 * Ranges-mode highlight: wrap precomputed `[start, end)` offsets in `<mark>`.
 * No matching, escaping, or regex — the offsets are trusted (validated/clamped
 * upstream). Defensive only so a bad range can never throw in the UI: any range
 * that is out of order, out of bounds, or empty is skipped.
 */
function renderRangesHighlight(
  text: string,
  ranges: Array<[number, number]>,
): React.ReactNode {
  if (ranges.length === 0) return text;

  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  ranges.forEach(([start, end], index) => {
    if (start < cursor || start < 0 || end > text.length || start >= end) {
      return;
    }
    if (start > cursor) nodes.push(text.slice(cursor, start));
    nodes.push(
      <mark key={`range-${index}-${start}`} className={styles.searchHighlight}>
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

/**
 * Render a column's text with its highlight applied. `replacement` and the
 * occurrence indices are only consulted by match-mode; ranges-mode ignores
 * them (STET never previews a replacement).
 */
export function renderHighlightedText(
  text: string,
  highlight: ResultHighlight | undefined,
  opts: {
    replacement?: string;
    previewOccurrenceIndex?: number;
    activeOccurrenceIndex?: number | null;
  } = {},
): React.ReactNode {
  if (!highlight) return text;
  if (highlight.mode === "ranges") {
    return renderRangesHighlight(text, highlight.ranges);
  }
  return renderMatchHighlight(
    text,
    highlight,
    opts.replacement ?? "",
    opts.previewOccurrenceIndex ?? 0,
    opts.activeOccurrenceIndex ?? null,
  );
}
