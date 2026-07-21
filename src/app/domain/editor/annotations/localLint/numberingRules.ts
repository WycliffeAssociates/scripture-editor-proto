// numberingRules.ts
//
// The pure heart of the `local-lint` producer: interior chapter/verse
// monotonicity, split by the scope each family runs at so the stateful owner
// can recompute the minimum (see `localLintPipeline.ts`):
//
//   - verse monotonicity  → CHAPTER scope: `analyzeChapterVerses(chapterTokens)`
//   - chapter monotonicity → BOOK scope:   `analyzeChapterSequence(markers)`
//
// Number source — the CANONICAL token stream, not the Lexical/sid path. A
// `\c`/`\v` is two tokens: the `marker` then a following `number` token. We read
// that number token's SOURCE (the literal text), not `token.sid` and not
// `numberInfo`. sid and numberInfo are DERIVED — the editor stamps sids on the
// Lexical nodes a maintenance cycle AFTER a `userEdit` (and local-lint skips the
// `structuralFixup` that carries them), so both lag the just-typed number. The
// number token's source is fresh on the very commit the edit lands on.
//
// Scope is INTERIOR consistency only — gaps, backward jumps, and a non-1 start.
// No counting against an expected total and no trailing-absence check (those are
// external-norm checks → sous-chef; see the plan §5).
//
// Disjoint from onion by construction: onion owns `Missing*` (a `\v` with no
// number) and `Duplicate*` (uniqueness). We only react to a parsed number moving
// the wrong way, so an a/b split (`5`, `5b` → both read 5) is a repeat, left to
// onion, never re-emitted here.

import { parseNumberInfoFromSource } from "@/core/domain/usfm/parseUtils.ts";
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

/** One raw monotonicity hit, pre-normalization. */
export type LocalLintIssue = {
  code: LocalLintCode;
  /**
   * The `number` token's id — the finding's anchor. NOT the `\c`/`\v` marker
   * token: the editor renders the marker+number as one element keyed by the
   * NUMBER token's id, so that's the id the overlay can resolve to a DOM node.
   */
  tokenId: string;
  /** The number on the offending marker. */
  found: number;
  /** The prior number in the sequence, for gap/decrease (omitted for starts). */
  previous?: number;
};

/** A chapter's `\c`, distilled to what chapter-sequence analysis needs. */
export type ChapterMarker = { number: number; tokenId: string };

/** A `\c`/`\v` number parsed from its `number` token (id + bridge-aware value). */
type ParsedNumber = { start: number; end: number; tokenId: string };

/**
 * The number for the `\c`/`\v` marker at `markerIndex`: parsed from the SOURCE
 * of the following `number` token (skipping trivia), and carrying that token's
 * id (the anchor). `null` when no number follows (onion's `Missing*`, not ours).
 */
function numberAfterMarker(
  tokens: Token[],
  markerIndex: number,
): ParsedNumber | null {
  for (let i = markerIndex + 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind === "number") {
      const numberInfo = parseNumberInfoFromSource(token.source);
      if (!numberInfo) return null;
      return {
        start: numberInfo.start,
        end: numberInfo.end ?? numberInfo.start,
        tokenId: token.id,
      };
    }
    // Another marker before any number → this marker has no number.
    if (token.kind === "marker" || token.kind === "endMarker") return null;
  }
  return null;
}

/**
 * The first `\c` in a chapter's token stream, or null for front matter
 * (chapter 0 — no `\c`) and any `\c` with no parseable number.
 */
export function chapterMarkerOf(chapterTokens: Token[]): ChapterMarker | null {
  for (let i = 0; i < chapterTokens.length; i++) {
    const token = chapterTokens[i];
    if (token.kind !== "marker" || token.marker !== "c") continue;
    const parsed = numberAfterMarker(chapterTokens, i);
    if (parsed == null) continue;
    return { number: parsed.start, tokenId: parsed.tokenId };
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
          found: chapter,
        });
      }
    } else if (chapter < lastChapter) {
      issues.push({
        code: "chapter-number-decrease",
        tokenId: marker.tokenId,
        found: chapter,
        previous: lastChapter,
      });
    } else if (chapter > lastChapter + 1) {
      issues.push({
        code: "chapter-number-gap",
        tokenId: marker.tokenId,
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
 * chapter. Bridges ride on the number token's range for free: `\v 5-6` advances
 * the cursor to 6, so `5-6` then `7` is no gap, and `5b` reads 5 (a repeat,
 * onion's concern).
 */
export function analyzeChapterVerses(chapterTokens: Token[]): LocalLintIssue[] {
  const issues: LocalLintIssue[] = [];
  // The end of the verse just seen (a bridge's end); null until the first `\v`.
  let lastVerseEnd: number | null = null;

  for (let i = 0; i < chapterTokens.length; i++) {
    const token = chapterTokens[i];
    if (token.kind !== "marker" || token.marker !== "v") continue;
    const parsed = numberAfterMarker(chapterTokens, i);
    if (parsed == null) continue;
    const { start: verseStart, end: verseEnd, tokenId } = parsed;

    if (lastVerseEnd == null) {
      if (verseStart !== 1) {
        issues.push({
          code: "verse-starts-at-one",
          tokenId,
          found: verseStart,
        });
      }
    } else if (verseStart < lastVerseEnd) {
      issues.push({
        code: "verse-number-decrease",
        tokenId,
        found: verseStart,
        previous: lastVerseEnd,
      });
    } else if (verseStart > lastVerseEnd + 1) {
      issues.push({
        code: "verse-number-gap",
        tokenId,
        found: verseStart,
        previous: lastVerseEnd,
      });
    }
    // Resync to THIS verse — track the local progression, not the max — so one
    // out-of-order number (e.g. a typo'd `\v 3333`) flags once, not a cascade of
    // decreases on every following verse. `verseStart === lastVerseEnd + 1` and
    // `=== lastVerseEnd` (a/b repeat) both fall through as fine.
    lastVerseEnd = verseEnd;
  }

  return issues;
}
