// chapterLabelRewrite.ts
//
// The Phase-2b apply: turn a chosen target stem into concrete edits over a
// book's token stream, in pure TS. onion has NO upstream fix for
// `inconsistent-chapter-label` (it's a project-wide judgement call), so we
// fabricate the rewrites ourselves — replacing each off-target `\cl` label's
// STEM while preserving its chapter number ("Marika 14" -> "Wase 14"), then
// re-serialize. No onion `applyTokenFix` IPC: a `\cl` swap is a find-by-id +
// source replace (see the plan's "IPC trap").

import {
  type ChapterLabelEntry,
  findChapterLabelEntries,
} from "@/app/domain/editor/annotations/chapterLabelTally.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * Replace a label's stem with `targetStem`, preserving everything from the
 * first ASCII digit onward (the chapter number) and the original whitespace
 * around the stem. Mirrors `chapterLabelStem`'s "stem = text up to first digit"
 * rule. `("Marika 14", "Wase") -> "Wase 14"`; `("Mazmur", "Salmo") -> "Salmo"`.
 *
 * If the label number lives in a separate `number` token (so this text token is
 * just `"Marika "`), the digit-aware split is a no-op and the trailing space is
 * preserved — the number token is untouched by `applyChapterLabelRewrites`.
 */
export function swapChapterLabelStem(text: string, targetStem: string): string {
  const firstDigit = text.search(/[0-9]/);
  const head = firstDigit === -1 ? text : text.slice(0, firstDigit);
  const tail = firstDigit === -1 ? "" : text.slice(firstDigit);
  const leadingWs = head.slice(0, head.length - head.trimStart().length);
  const trailingWs = head.slice(head.trimEnd().length);
  return `${leadingWs}${targetStem}${trailingWs}${tail}`;
}

export type ChapterLabelRewrite = {
  /** Id of the text token to rewrite. */
  tokenId: string;
  /** Original label text (for logging / dry-run inspection). */
  from: string;
  /** Rewritten label text. */
  to: string;
};

/**
 * One rewrite per off-target `\cl` label that actually changes. Skips labels
 * already on the target, labels with no addressable text token, and no-op
 * swaps.
 */
export function fabricateChapterLabelRewrites(
  tokens: Token[],
  targetStem: string,
): ChapterLabelRewrite[] {
  const rewrites: ChapterLabelRewrite[] = [];
  for (const entry of findChapterLabelEntries(tokens)) {
    if (entry.stem === targetStem) continue;
    if (entry.textTokenId === undefined) continue;
    const to = swapChapterLabelStem(entry.text, targetStem);
    if (to === entry.text) continue;
    rewrites.push({ tokenId: entry.textTokenId, from: entry.text, to });
  }
  return rewrites;
}

/**
 * Apply rewrites by replacing the matching tokens' `source`. Returns a new
 * array (untouched tokens are shared by reference); `tokensToUsfm` then
 * re-serializes the book.
 */
export function applyChapterLabelRewrites(
  tokens: Token[],
  rewrites: ChapterLabelRewrite[],
): Token[] {
  if (rewrites.length === 0) return tokens;
  const byId = new Map(rewrites.map((r) => [r.tokenId, r.to]));
  return tokens.map((token) => {
    const next = token.id ? byId.get(token.id) : undefined;
    return next === undefined ? token : { ...token, source: next };
  });
}

// Re-exported for callers that want the raw scan (e.g. counting affected books).
export type { ChapterLabelEntry };
