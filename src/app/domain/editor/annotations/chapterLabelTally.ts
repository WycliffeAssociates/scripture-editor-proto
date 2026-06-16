// chapterLabelTally.ts
//
// Project-wide chapter-label (`\cl`) analysis, in pure TS over token streams.
//
// onion's `inconsistent-chapter-label` rule is per-FILE ("...used elsewhere in
// this file"); the app widens it to a project-scoped "standardize" action. The
// canonicality rule we reproduce here must match onion's, so the app and the
// linter agree on what the dominant label is (see `lint_chapter_rules` /
// `strip_digits` in usfm_onion `src/lint_impl.rs`):
//
//   - a label's STEM is its text up to the first ASCII digit, trimmed
//     ("Marika 14" -> "Marika"); the chapter number is NOT part of the stem.
//   - the canonical/dominant stem is the one used by the most `\cl` markers;
//     ties break to the lexicographically-largest stem.
//
// The scan (`findChapterLabelEntries`) is shared with the Phase-2b apply, which
// needs each off-target label's text + token-id to fabricate the stem swap.

import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * Number-stripped label stem. Mirrors onion's `strip_digits(text.trim()).trim()`:
 * everything before the first ASCII digit, trimmed. `"Marika 14" -> "Marika"`,
 * `"Wase" -> "Wase"`, `"12 foo" -> ""` (starts with a digit).
 */
export function chapterLabelStem(text: string): string {
  const trimmed = text.trim();
  const firstDigit = trimmed.search(/[0-9]/);
  const beforeDigit =
    firstDigit === -1 ? trimmed : trimmed.slice(0, firstDigit);
  return beforeDigit.trim();
}

export type ChapterLabelEntry = {
  /** Number-stripped stem, e.g. `"Wase"`. */
  stem: string;
  /** Raw label text-token source, e.g. `"Wase 14"` — the 2b stem-swap target. */
  text: string;
  /** Id of the *text* token carrying the label (onion anchors the issue here). */
  textTokenId: string | undefined;
};

function nextTextToken(tokens: Token[], from: number): Token | undefined {
  for (let i = from; i < tokens.length; i++) {
    if (tokens[i].kind === "text") return tokens[i];
  }
  return undefined;
}

/**
 * Walk a flat token stream; for each `\cl` marker take the next text token as
 * its label (onion's `next_text_token_index`). Empty-stem labels are dropped,
 * exactly as onion drops them before tallying.
 */
export function findChapterLabelEntries(tokens: Token[]): ChapterLabelEntry[] {
  const entries: ChapterLabelEntry[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind !== "marker" || token.marker !== "cl") continue;
    const textToken = nextTextToken(tokens, i + 1);
    if (!textToken) continue;
    const stem = chapterLabelStem(textToken.source);
    if (!stem) continue;
    entries.push({
      stem,
      text: textToken.source,
      textTokenId: textToken.id,
    });
  }
  return entries;
}

export type ChapterLabelCount = { stem: string; count: number };
export type ChapterLabelTally = {
  /** Counts sorted by frequency desc, then stem asc (display order). */
  counts: ChapterLabelCount[];
  /** The most-used stem (onion's "canonical"); `null` when there are none. */
  dominant: string | null;
};

export function tallyChapterLabels(
  entries: ChapterLabelEntry[],
): ChapterLabelTally {
  const byStem = new Map<string, number>();
  for (const { stem } of entries) {
    byStem.set(stem, (byStem.get(stem) ?? 0) + 1);
  }

  // Dominant mirrors onion: most occurrences wins; ties break to the
  // lexicographically-largest stem. onion iterates a BTreeMap (ascending key)
  // with `max_by_key`, which keeps the LAST maximum — i.e. the largest stem
  // among those tied for the top count. Iterating ascending with `>=`
  // reproduces that.
  let dominant: string | null = null;
  let bestCount = -1;
  for (const stem of [...byStem.keys()].sort()) {
    const count = byStem.get(stem) ?? 0;
    if (count >= bestCount) {
      bestCount = count;
      dominant = stem;
    }
  }

  const counts = [...byStem.entries()]
    .map(([stem, count]) => ({ stem, count }))
    .sort((a, b) => b.count - a.count || a.stem.localeCompare(b.stem));

  return { counts, dominant };
}
