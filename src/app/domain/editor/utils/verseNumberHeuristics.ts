export type VerseNumberRange = { start: number; end: number };

export type VerseNumberTokenLike = {
  tokenType: string;
  marker?: string;
  text: string;
};

export const SELECTED_VERSE_NUMBER_PATTERN = /^\d+(?:-\d+)?$/;

/**
 * Verse-number parsing helpers used by editor insertion and selection logic.
 *
 * These functions keep the editor's lightweight heuristics for choosing verse
 * numbers separate from the heavier USFM parser.
 */
export function parseVerseNumberRange(raw: string): VerseNumberRange | null {
  const text = raw.trim();
  if (!text) return null;

  const match = text.match(/^(\d+)(?:\s*[-–]\s*(\d+))?/);
  if (!match) return null;

  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

  return { start, end };
}

export function isSelectedVerseNumber(text: string): boolean {
  return SELECTED_VERSE_NUMBER_PATTERN.test(text.trim());
}

export function deriveVerseNumberForInsertionFromTokens(args: {
  tokens: VerseNumberTokenLike[];
  anchorIndex: number;
}): string {
  const { tokens, anchorIndex } = args;
  if (anchorIndex < 0 || anchorIndex >= tokens.length) return "1";

  // A verse arrives either as one numbered-marker tokenlike (regular
  // shape — the number is its text) or as a legacy marker + numberRange
  // pair (flat shapes).
  const verseRangeAt = (i: number): VerseNumberRange | null | "skip" => {
    const t = tokens[i];
    if (t.tokenType === "numberedMarker" && t.marker === "v") {
      return parseVerseNumberRange(t.text);
    }
    if (t.tokenType !== "marker" || t.marker !== "v") return "skip";
    const maybeNum = tokens[i + 1];
    if (!maybeNum) return null;
    if (maybeNum.tokenType !== "numberRange") return "skip";
    return parseVerseNumberRange(maybeNum.text);
  };

  const findPrevVerse = (): VerseNumberRange | null => {
    for (let i = anchorIndex - 1; i >= 0; i--) {
      const result = verseRangeAt(i);
      if (result !== "skip") return result;
    }
    return null;
  };

  const findNextVerse = (): VerseNumberRange | null => {
    for (let i = anchorIndex + 1; i < tokens.length; i++) {
      const result = verseRangeAt(i);
      if (result !== "skip") return result;
    }
    return null;
  };

  const prev = findPrevVerse();
  const next = findNextVerse();

  if (prev && next) return String(prev.end + 1);
  if (prev && !next) return String(prev.end + 1);
  if (!prev && next) return String(Math.max(1, next.start - 1));
  return "1";
}
