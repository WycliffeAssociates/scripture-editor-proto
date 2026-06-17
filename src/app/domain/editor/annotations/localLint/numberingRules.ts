// numberingRules.ts
//
// The pure heart of the `local-lint` producer: interior chapter/verse
// monotonicity, split by the scope each family runs at so the stateful owner
// can recompute the minimum (see `localLintPipeline.ts`):
//
//   - verse monotonicity  → CHAPTER scope: `analyzeChapterVerses(chapterTokens)`
//   - chapter monotonicity → BOOK scope:   `analyzeChapterSequence(markers)`
//
// No IPC, no wasm, no serialization — just passes over already-parsed tokens,
// reading the number off each `\c`/`\v` marker's sid via `parseSid` (the same
// parser the rest of the app uses, so "what number is this" never forks).
//
// Scope is INTERIOR consistency only — gaps, backward jumps, and a non-1 start.
// No counting against an expected total and no trailing-absence check: the END
// of a verse range varies by versification, so judging completeness needs an
// external table and belongs to sous-chef, not here (see the plan §5).
//
// Disjoint from onion by construction: onion owns `Missing*` (a `\v` with no
// number) and `Duplicate*` (uniqueness). We only ever react to a parsed number
// moving the wrong way, so an a/b split (`5`, `5b` → both parse to 5) reads as
// a repeat and is left to onion, never re-emitted here.

import { parseSid } from "@/core/data/bible/bible.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

import type { FindingSeverity } from "../finding.ts";

export type LocalLintCode =
  | "chapter-number-gap"
  | "chapter-number-decrease"
  | "chapter-starts-at-one"
  | "verse-number-gap"
  | "verse-number-decrease"
  | "verse-starts-at-one";

/**
 * Severity by the plan's principle: ambiguous → `warning`, definitively
 * impossible → `error`, definitive-but-WIP-tolerant → `info`. A gap has
 * legitimate causes (unwritten content), a backward number never does, and a
 * non-1 start is real but tolerable mid-progress.
 */
export const LOCAL_LINT_SEVERITY: Record<LocalLintCode, FindingSeverity> = {
  "chapter-number-gap": "warning",
  "chapter-number-decrease": "error",
  "chapter-starts-at-one": "info",
  "verse-number-gap": "warning",
  "verse-number-decrease": "error",
  "verse-starts-at-one": "info",
};

/** One raw monotonicity hit, pre-normalization. Anchored to its marker token. */
export type LocalLintIssue = {
  code: LocalLintCode;
  /** The offending `\c`/`\v` marker token's id — the finding's anchor. */
  tokenId: string;
  /** That marker's sid: buckets the finding by chapter and feeds the message. */
  sid: string;
  /** The number on the offending marker. */
  found: number;
  /** The prior number in the sequence, for gap/decrease (omitted for starts). */
  previous?: number;
};

/** A chapter's `\c` marker, distilled to what chapter-sequence analysis needs. */
export type ChapterMarker = { number: number; tokenId: string; sid: string };

/**
 * The first `\c` marker in a chapter's token stream, or null for front matter
 * (chapter 0 — no `\c`) and any chapter whose `\c` sid won't parse.
 */
export function chapterMarkerOf(chapterTokens: Token[]): ChapterMarker | null {
  for (const token of chapterTokens) {
    if (token.kind !== "marker" || token.marker !== "c" || token.sid == null) {
      continue;
    }
    const number = parseSid(token.sid)?.chapter;
    if (number == null) continue;
    return { number, tokenId: token.id, sid: token.sid };
  }
  return null;
}

/**
 * Chapter monotonicity over a book's ordered `\c` markers (BOOK scope). Fires on
 * a non-1 first chapter, a backward chapter, or an interior skip — each anchored
 * to the offending `\c`.
 */
export function analyzeChapterSequence(
  markers: ChapterMarker[],
): LocalLintIssue[] {
  const issues: LocalLintIssue[] = [];
  let lastChapter: number | null = null;

  for (const marker of markers) {
    const chapter = marker.number;
    if (lastChapter == null) {
      if (chapter !== 1) {
        issues.push({
          code: "chapter-starts-at-one",
          tokenId: marker.tokenId,
          sid: marker.sid,
          found: chapter,
        });
      }
    } else if (chapter < lastChapter) {
      issues.push({
        code: "chapter-number-decrease",
        tokenId: marker.tokenId,
        sid: marker.sid,
        found: chapter,
        previous: lastChapter,
      });
    } else if (chapter > lastChapter + 1) {
      issues.push({
        code: "chapter-number-gap",
        tokenId: marker.tokenId,
        sid: marker.sid,
        found: chapter,
        previous: lastChapter,
      });
    }
    lastChapter = chapter;
  }

  return issues;
}

/**
 * Verse monotonicity within ONE chapter's tokens (CHAPTER scope) — independent
 * of every other chapter, which is why a verse edit invalidates only its own
 * chapter. Bridges ride on `parseSid` for free: `\v 5-6` advances the cursor to
 * 6, so `5-6` then `7` is no gap, and the `b` in `5b` truncates to 5 (a repeat,
 * onion's concern).
 */
export function analyzeChapterVerses(chapterTokens: Token[]): LocalLintIssue[] {
  const issues: LocalLintIssue[] = [];
  // The highest verse covered so far (a bridge's end); null until the first `\v`.
  let lastVerseEnd: number | null = null;

  for (const token of chapterTokens) {
    if (token.kind !== "marker" || token.marker !== "v" || token.sid == null) {
      continue;
    }
    const parsed = parseSid(token.sid);
    if (parsed == null) continue;
    const { verseStart, verseEnd } = parsed;

    if (lastVerseEnd == null) {
      if (verseStart !== 1) {
        issues.push({
          code: "verse-starts-at-one",
          tokenId: token.id,
          sid: token.sid,
          found: verseStart,
        });
      }
    } else if (verseStart < lastVerseEnd) {
      issues.push({
        code: "verse-number-decrease",
        tokenId: token.id,
        sid: token.sid,
        found: verseStart,
        previous: lastVerseEnd,
      });
    } else if (verseStart > lastVerseEnd + 1) {
      issues.push({
        code: "verse-number-gap",
        tokenId: token.id,
        sid: token.sid,
        found: verseStart,
        previous: lastVerseEnd,
      });
    }
    // verseStart === lastVerseEnd is a repeat (e.g. `5`, `5b`) — onion's
    // Duplicate, not ours; advance only forward so a repeat never rewinds.
    lastVerseEnd = Math.max(lastVerseEnd ?? verseEnd, verseEnd);
  }

  return issues;
}
