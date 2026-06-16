// usfmBytes.ts
//
// The pure token→USFM byte serialization waist. Lives in core with zero
// editor/DOM imports so non-DOM hosts (the mirror workers) can serialize a
// book's bytes without dragging the Lexical adapter graph into their bundle.

import type { Token } from "./usfmOnionTypes.ts";

/**
 * The EOL convention of a loaded file. We never store CRLF in the editor model;
 * instead each chapter remembers its file's line ending and we re-apply it at
 * the `tokensToUsfm` waist (below) so an untouched CRLF file round-trips
 * byte-identically — no phantom whole-file line-ending diff.
 */
export type LineEnding = "\n" | "\r\n";

/**
 * Recover a file's EOL style from onion's parse: the lexer captures `\r\n`
 * verbatim as a newline token's `source`, so the first newline tells us the
 * file's convention. Defaults to LF for a stream with no newline.
 */
export function detectLineEnding(tokens: readonly Token[]): LineEnding {
  const firstNewline = tokens.find((token) => token.kind === "newline");
  return firstNewline?.source.includes("\r") ? "\r\n" : "\n";
}

/**
 * The line ending of a loaded book — taken from its first chapter, since a book
 * is one file and its chapters share one convention. A new or empty book has no
 * chapters (and so no content), so LF. Book-scope serialize paths (lint/prettify
 * rebuilds) call this instead of an inline `?? "\n"` so the empty-book default
 * is a documented contract rather than a silent normalization.
 */
export function bookLineEnding(book: {
  chapters: ReadonlyArray<{ eol: LineEnding }>;
}): LineEnding {
  return book.chapters[0]?.eol ?? "\n";
}

/**
 * Serialize a token stream back to USFM. Each token carries its own `.source`
 * text, so concatenation IS the serialization — this is the one canonical home
 * for the `tokens.map((t) => t.source).join("")` idiom that the save payload,
 * dirty-buffer backups, and recovery baseline all depend on agreeing byte-for
 * -byte (the `TODO(usfm-onion)` callers and the "tokensToUsfm upstream" comments
 * referred to this operation before it had a name).
 *
 * Newline tokens emit the file's `eol` rather than their stored `source`: the
 * editor model is LF-internal (e.g. `lexicalToTokens` stamps `"\n"`), so this
 * waist is the single point that restores the original line ending. `eol` is
 * required on purpose — every caller must pass the chapter's convention so no
 * path silently normalizes to LF.
 */
export function tokensToUsfm(tokens: Token[], eol: LineEnding): string {
  return tokens
    .map((token) => (token.kind === "newline" ? eol : token.source))
    .join("");
}

/**
 * Serialize a book's chapters to the exact bytes a save would persist:
 * chapters in DISK ORDER (the order they were loaded — invariant I1: the
 * system never reorders disk bytes; a file that arrives with out-of-order
 * chapters is represented and saved out of order; flagging it is lint's
 * job). `selectTokens` picks the field — `currentTokens` for the
 * working/save bytes, `sourceTokens` for the on-disk baseline. Shared so the
 * save path, the backup pipeline, and the reopen baseline can't drift in
 * ordering/joining (a drift would turn every clean restore into a false
 * "disk moved" forced review).
 */
export function serializeChaptersToUsfm<
  C extends { chapterNumber: number; eol: LineEnding },
>(chapters: readonly C[], selectTokens: (chapter: C) => Token[]): string {
  return chapters
    .map((chapter) => tokensToUsfm(selectTokens(chapter), chapter.eol))
    .join("");
}
