import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { $isUSFMNumberedMarkerNode } from "@/app/domain/editor/nodes/USFMNumberedMarkerNode.ts";
import {
  $isUSFMTextNode,
  type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { CHAPTER_VERSE_MARKERS } from "@/core/domain/usfm/onionMarkers.ts";

const LEADING_VERSE_NUMBER_WITH_TEXT_PATTERN = /^(\s*)(\d+(?:-\d+)?)(\s+)(.*)$/;

// Highest verse count in any Protestant chapter is Psalm 119 (176 verses), so a
// leading number above that can't be a verse and shouldn't be suggested.
const MAX_VERSE_NUMBER = 176;

function isMarkerExpectingNumberRange(marker: string | undefined): boolean {
  return !!marker && CHAPTER_VERSE_MARKERS.has(marker);
}

// A plausible verse number (or range like "5-6") is 1..176 on every part.
function isPlausibleVerseNumber(verseNumber: string): boolean {
  const parts = verseNumber.split("-");
  for (const part of parts) {
    const n = Number.parseInt(part, 10);
    if (!Number.isFinite(n) || n < 1 || n > MAX_VERSE_NUMBER) return false;
  }
  return true;
}

/**
 * Heuristics for promoting a plain text prefix into a verse-number token.
 *
 * These are used in editing flows where the user types a verse number into plain
 * text and the editor wants to help turn it into the structured marker+number
 * representation the rest of the pipeline expects.
 */
export function getLeadingVerseNumberFromText(text: string): {
  leadingWhitespace: string;
  verseNumber: string;
  rest: string;
} | null {
  const match = text.match(LEADING_VERSE_NUMBER_WITH_TEXT_PATTERN);
  if (!match) return null;
  return {
    leadingWhitespace: match[1],
    verseNumber: match[2],
    rest: match[4],
  };
}

export function canPromoteLeadingVerseNumber(anchorNode: USFMTextNode): {
  verseNumber: string;
  leadingWhitespace: string;
  rest: string;
} | null {
  if (anchorNode.getTokenType() !== UsfmTokenTypes.text) return null;
  const match = getLeadingVerseNumberFromText(anchorNode.getTextContent());
  if (!match) return null;
  // Out-of-range numbers (e.g. "200 …", years, list items) aren't verses.
  if (!isPlausibleVerseNumber(match.verseNumber)) return null;
  const prevNode = anchorNode.getPreviousSibling();
  // A numbered-marker node just before this text covers both legacy cases
  // at once in the regular shape: the marker expecting a number IS the
  // node, and the parsed number is its content (`\v 5 5 …` duplicates are
  // lint's to flag, not promotion candidates).
  if ($isUSFMNumberedMarkerNode(prevNode)) return null;
  if ($isUSFMTextNode(prevNode)) {
    const prevType = prevNode.getTokenType();
    // Already a marker expecting a number (`\v`/`\c`) right before.
    if (
      prevType === UsfmTokenTypes.marker &&
      isMarkerExpectingNumberRange(prevNode.getMarker())
    ) {
      return null;
    }
    // Already verse content: the parsed verse number sits just before this
    // text (e.g. `\v 5 5 …`), so the leading digit is a duplicate the
    // structure-maintenance pass handles — not something to promote.
    if (prevType === UsfmTokenTypes.numberRange) return null;
  }
  return match;
}
