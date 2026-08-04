// vrefProjection.ts
//
// The verse→token segment map, derived on main from the tokens being drawn.
//
// A content finding anchors as `(sid, Utf16Span)`; resolving it to DOM rects
// needs to know which text tokens carry that sid's text and where in each the
// range falls. That is `vrefIndexTokens` — the same function the worker runs
// for Galley, from the same wasm build, over the same tokens.
//
// Derived rather than shipped, for two reasons:
//
//   · Cost. The map is ~31k verses × several segments; structured-cloning it
//     out of the worker on every analysis pass dominated the keystroke path,
//     and main immediately used one book of it.
//   · Correctness. Segments name editor token ids, and they are resolved
//     against the DOM. A map that arrives with an analysis result describes
//     the generation that analysis ran at, which is not necessarily what is
//     rendered now — so a `data-id` lookup could miss, or land on a token the
//     edit had already replaced. Deriving from the tokens being drawn is the
//     only version that cannot be stale.
//
// Memoized per chapter on the `currentTokens` array identity. Commits replace
// that array wholesale for the chapters they touch, so an edit recomputes one
// chapter and every other chapter is a map hit; a `WeakMap` means the entries
// die with the token arrays they describe.

import { vrefIndexTokens } from "usfm-onion-web";

import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";
import type { SegmentsBySid } from "@/core/domain/usfm/vrefTypes.ts";

const byChapterTokens = new WeakMap<readonly Token[], SegmentsBySid>();
const byBook = new WeakMap<ScriptureBookState, SegmentsBySid>();

function chapterSegments(chapter: ScriptureChapterState): SegmentsBySid {
  const cached = byChapterTokens.get(chapter.currentTokens);
  if (cached) return cached;
  const segments: SegmentsBySid = {};
  for (const [sid, verse] of vrefIndexTokens([...chapter.currentTokens])) {
    segments[sid] = verse.segments.map((segment) => ({
      tokenId: segment.tokenId,
      textSpan: segment.textSpan,
    }));
  }
  byChapterTokens.set(chapter.currentTokens, segments);
  return segments;
}

/**
 * The segment map for one book, as its chapters currently stand.
 *
 * Book-grain because the findings panel lists a whole book's findings and any
 * of them can be acted on, not just those in the visible chapter. Keyed by
 * sid, which collapses a duplicated sid to its last occurrence — the same
 * lossiness the shipped map had, and the thing an occurrence-addressed
 * finding would fix.
 */
export function bookSegments(book: ScriptureBookState): SegmentsBySid {
  const cached = byBook.get(book);
  if (cached) return cached;
  const merged: SegmentsBySid = {};
  for (const chapter of book.chapters) {
    Object.assign(merged, chapterSegments(chapter));
  }
  byBook.set(book, merged);
  return merged;
}

/** The segment map for a book by code, or an empty map when it is not loaded. */
export function segmentsForBook(
  books: readonly ScriptureBookState[],
  bookCode: string,
): SegmentsBySid {
  const wanted = bookCode.toUpperCase();
  const book = books.find((candidate) => candidate.bookCode === wanted);
  return book ? bookSegments(book) : EMPTY_SEGMENTS;
}

const EMPTY_SEGMENTS: SegmentsBySid = {};
