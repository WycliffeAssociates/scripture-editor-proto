import { Braid } from "usfm-onion-web";
import type {
  BookInput,
  CorpusScope,
  FormatOptions,
  LintSnapshot,
  Patch,
  PublishedBookInfo,
  Token,
} from "usfm-onion-web";

import type { TokenFix } from "@/core/domain/usfm/usfmOnionTypes.ts";

/** What Galley is constructed and updated from. Segments are not Galley's. */
export type BraidProjection = {
  keys: string[];
  texts: string[];
};

export type BraidMutation<T = BraidProjection | null> = {
  effect: "changed" | "unchanged";
  projection: T;
};

export type WebBraidPublication = {
  packed: ArrayBuffer;
  snapshotId: string;
  books: PublishedBookInfo[];
  sources: Array<{ bookCode: string; sourceKey: string; source: string }>;
  serializedBooks: Array<{ bookCode: string; contents: string }>;
};

export type WebProjectBookSource = {
  bookCode: string;
  sourceKey: string;
  source: string;
};

/** The same book addressed by its exact bytes rather than a decoded string. */
export type WebProjectBookBytes = {
  bookCode: string;
  sourceKey: string;
  source: Uint8Array;
};

const decoder = new TextDecoder();

type BraidResult<T> =
  | { status: "ok"; value: T }
  | { status: "error"; error: unknown };

function unwrapBraid<T>(result: BraidResult<T>, operation: string): T {
  if (result.status === "error") {
    throw new Error(
      `Braid ${operation} failed: ${JSON.stringify(result.error)}`,
    );
  }
  return result.value;
}

/** Web-worker resident Braid arm. Galley consumes its projections separately. */
export class WebBraidHost {
  private braid: Braid | null = null;
  private nextTokenId = 0;

  /**
   * Cold-seed the corpus from each book's exact disk bytes.
   *
   * The source form of `BookInput` is what binds Braid's recorded source — and
   * therefore every hash it publishes — to the file that is actually on disk. A
   * token-form seed would bind them to Braid's own re-serialization instead, so
   * the sidecar it later publishes could never be validated against disk, and
   * the crash-recovery baseline would hash text no file contains.
   */
  loadSources(sources: readonly WebProjectBookSource[]): void {
    const books = sources.map((book) => sourceInput(book));
    unwrapBraid(this.ensureBraid().replaceCorpus({ books }), "cold seed");
    for (const book of books) {
      unwrapBraid(this.ensureBraid().setBaseline(book), "cold baseline");
    }
  }

  seed(
    books: ReadonlyArray<{
      bookCode: string;
      tokens: readonly Token[];
      lineEnding: "lf" | "crlf";
    }>,
  ): BraidMutation<BraidProjection> {
    const braid = this.ensureBraid();
    const mutation = braid.replaceCorpus({
      books: books.map((book) =>
        bookInput(book.bookCode, book.tokens, book.lineEnding),
      ),
    });
    const changed = unwrapBraid(mutation, "corpus seed");
    return {
      effect: changed.changed.length === 0 ? "unchanged" : "changed",
      projection: this.projection({ kind: "all" }),
    };
  }

  setBaseline(
    bookCode: string,
    tokens: readonly Token[],
    lineEnding: "lf" | "crlf",
  ): void {
    unwrapBraid(
      this.ensureBraid().setBaseline(bookInput(bookCode, tokens, lineEnding)),
      "baseline update",
    );
  }

  clearBaseline(bookCode: string): void {
    this.ensureBraid().clearBaseline(bookCode.toUpperCase());
  }

  lineEnding(bookCode: string): "lf" | "crlf" {
    return this.ensureBraid()
      .books()
      .find((book) => book.book === bookCode.toUpperCase())?.lineEnding ===
      "crlf"
      ? "crlf"
      : "lf";
  }

  isDirty(bookCode: string): boolean {
    return unwrapBraid(
      this.ensureBraid().isDirty({
        kind: "book",
        book: bookCode.toUpperCase(),
      }),
      "dirty check",
    );
  }

  toUsfm(bookCode: string): string {
    const result = unwrapBraid(
      this.ensureBraid().toUsfm({
        kind: "book",
        book: bookCode.toUpperCase(),
      }),
      "USFM serialization",
    );
    return result.kind === "single"
      ? result.value
      : (result.books.find((book) => book.book === bookCode.toUpperCase())
          ?.value ?? "");
  }

  toUsfmAll(): Array<{ bookCode: string; contents: string }> {
    const result = unwrapBraid(
      this.ensureBraid().toUsfm({ kind: "all" }),
      "corpus USFM serialization",
    );
    if (result.kind === "single") {
      throw new Error(
        "Braid returned a single-book result for all-scope output",
      );
    }
    return result.books.map((book) => ({
      bookCode: book.book,
      contents: book.value,
    }));
  }

  publish(): WebBraidPublication {
    const outcome = unwrapBraid(this.ensureBraid().publish(), "publication");
    const serializedBooks = this.toUsfmAll();
    const sourceKeyByBook = new Map(
      this.ensureBraid()
        .books()
        .map((book) => [book.book, book.sourceKey] as const),
    );
    const packed = Uint8Array.from(outcome.bytes).slice().buffer;
    return {
      packed,
      snapshotId: outcome.snapshotId,
      books: outcome.books,
      serializedBooks,
      sources: serializedBooks.map((book) => ({
        bookCode: book.bookCode,
        sourceKey: sourceKeyByBook.get(book.bookCode) ?? book.bookCode,
        source: book.contents,
      })),
    };
  }

  /**
   * Warm-seed from the opaque sidecar plus the exact disk bytes it must be
   * bound to. Braid performs the whole trust boundary — structure, checksums,
   * stamps, per-book source length and hash — so a rejection here IS the
   * cache-validity answer and the caller simply falls back to a cold load.
   */
  restorePublishedCorpus(
    packed: Uint8Array,
    records: readonly WebProjectBookBytes[],
  ): { accepted: boolean; error?: string } {
    // `PublishedCorpusSource.source` is declared `number[]`, so every book's
    // bytes become a JS number array on the way into wasm — the dominant cost
    // of a warm open on a full Bible. See the `Uint8Array` item in the Braid
    // RFC; there is no way around it from this side.
    const outcome = this.ensureBraid().restorePublishedCorpus(
      packed,
      records.map((record) => ({
        book: record.bookCode.toUpperCase(),
        sourceKey: record.sourceKey,
        source: Array.from(record.source),
      })),
    );
    if (outcome.status === "error") {
      return { accepted: false, error: JSON.stringify(outcome.error) };
    }
    return { accepted: true };
  }

  /**
   * Record the restored corpus as its own baseline.
   *
   * A warm restore installs exactly the bytes the container was bound to — the
   * files on disk — so current IS the saved state. Braid has no verb saying
   * that, and no way to read a baseline out, so the app has to hand the same
   * source back and let Braid re-parse all of it. That second whole-corpus
   * parse is pure waste on the one path that exists to avoid parsing; see
   * `setBaselineToCurrent` in the Braid RFC.
   */
  adoptRestoredBaseline(records: readonly WebProjectBookBytes[]): {
    accepted: boolean;
    error?: string;
  } {
    for (const record of records) {
      try {
        unwrapBraid(
          this.ensureBraid().setBaseline({
            kind: "usfm",
            sourceKey: record.sourceKey,
            book: record.bookCode.toUpperCase(),
            source: decoder.decode(record.source),
          }),
          "warm restore baseline",
        );
      } catch (error) {
        return { accepted: false, error: String(error) };
      }
    }
    return { accepted: true };
  }

  /**
   * Pack the resident corpus for the sidecar. Unlike {@link publish} this skips
   * the whole-corpus `toUsfm` pass: a load only needs the container's bytes, and
   * the ordered source manifest a save receipt needs is exactly the disk bytes
   * the caller already holds.
   */
  publishPacked(): { packed: ArrayBuffer; snapshotId: string } {
    const outcome = unwrapBraid(this.ensureBraid().publish(), "publication");
    return {
      packed: Uint8Array.from(outcome.bytes).buffer,
      snapshotId: outcome.snapshotId,
    };
  }

  format(
    scope: CorpusScope,
    options: FormatOptions = { insertStructuralLinebreaks: false },
  ): { books: Record<string, Token[]>; usfm: Record<string, string> } {
    const braid = this.ensureBraid();
    const prepared = unwrapBraid(
      braid.prepareFormatPatch(scope, options),
      "format preparation",
    );
    if (prepared.kind === "unchanged") return { books: {}, usfm: {} };
    const applied = unwrapBraid(
      braid.applyFormatPatch(prepared.id),
      "format apply",
    );
    const books: Record<string, Token[]> = {};
    const usfm: Record<string, string> = {};
    for (const bookCode of new Set(applied.changed.map((item) => item.book))) {
      const hydrated = unwrapBraid(
        braid.toTokens([{ book: bookCode }]),
        "format hydration",
      );
      const tokens = hydrated.find(
        (scopeTokens) => !scopeTokens.chapter,
      )?.tokens;
      if (!tokens) continue;
      books[bookCode] = [...tokens];
      usfm[bookCode] = this.toUsfm(bookCode);
    }
    return { books, usfm };
  }

  applyFix(
    bookCode: string,
    fix: TokenFix,
  ): { books: Record<string, Token[]>; usfm: Record<string, string> } {
    const braid = this.ensureBraid();
    const normalizedBook = bookCode.toUpperCase();
    const hydrated = unwrapBraid(
      braid.toTokens([{ book: normalizedBook }]),
      "fix hydration",
    );
    const currentTokens = hydrated.flatMap((scope) => scope.tokens);
    const patch = braid
      .patches()
      .find((candidate) =>
        matchesBraidFix(candidate, normalizedBook, fix, currentTokens),
      );
    if (!patch) {
      throw new Error(
        `Braid fix is stale or unavailable for ${normalizedBook}:${fix.code}`,
      );
    }
    const applied = unwrapBraid(braid.applyPatch(patch.id), "fix apply");
    if (applied.changed.length === 0) return { books: {}, usfm: {} };
    const next = unwrapBraid(
      braid.toTokens([{ book: normalizedBook }]),
      "fix result hydration",
    );
    return {
      books: { [normalizedBook]: next.flatMap((scope) => scope.tokens) },
      usfm: { [normalizedBook]: this.toUsfm(normalizedBook) },
    };
  }

  updateChapter(
    bookCode: string,
    chapterNum: number,
    tokens: readonly Token[],
  ): BraidMutation {
    const target = {
      book: bookCode.toUpperCase(),
      label: { kind: "number", label: String(chapterNum) } as const,
    };
    const mutation = unwrapBraid(
      this.ensureBraid().updateChapter(target, {
        kind: "tokens",
        tokens: [...tokens],
      }),
      "chapter update",
    );
    return {
      effect: mutation.changed.length === 0 ? "unchanged" : "changed",
      projection:
        mutation.changed.length === 0
          ? null
          : this.projection({ kind: "chapter", target }),
    };
  }

  updateBook(
    bookCode: string,
    tokens: readonly Token[],
    lineEnding: "lf" | "crlf",
  ): BraidMutation {
    const mutation = unwrapBraid(
      this.ensureBraid().updateBook(bookInput(bookCode, tokens, lineEnding)),
      "book update",
    );
    return {
      effect: mutation.changed.length === 0 ? "unchanged" : "changed",
      projection:
        mutation.changed.length === 0
          ? null
          : this.projection({ kind: "book", book: bookCode.toUpperCase() }),
    };
  }

  removeChapter(bookCode: string, chapterNum: number): BraidMutation {
    const target = {
      book: bookCode.toUpperCase(),
      label: { kind: "number", label: String(chapterNum) } as const,
    };
    const mutation = unwrapBraid(
      this.ensureBraid().removeChapter(target),
      "chapter removal",
    );
    return {
      effect: mutation.changed.length === 0 ? "unchanged" : "changed",
      projection:
        mutation.changed.length === 0
          ? null
          : this.tryProjection({ kind: "book", book: bookCode.toUpperCase() }),
    };
  }

  removeBook(bookCode: string): void {
    unwrapBraid(
      this.ensureBraid().removeBook(bookCode.toUpperCase()),
      "book removal",
    );
  }

  lintFindings(): LintSnapshot {
    return this.ensureBraid().lint();
  }

  projection(scope: CorpusScope): BraidProjection {
    const result = unwrapBraid(
      this.ensureBraid().vrefIndex(scope),
      "vref index",
    );
    const indexes =
      result.kind === "single"
        ? [result.value]
        : result.books.map((book) => book.value);
    const entries = indexes.flatMap((index) => index);
    return {
      keys: entries.map(([sid]) => sid),
      texts: entries.map(([, verse]) => verse.text),
    };
  }

  dispose(): void {
    this.braid?.free();
    this.braid = null;
  }

  private tryProjection(scope: CorpusScope): BraidProjection | null {
    try {
      return this.projection(scope);
    } catch {
      return null;
    }
  }

  private ensureBraid(): Braid {
    if (this.braid) return this.braid;
    this.braid = new Braid(
      { lint: { scope: "book" } },
      () => `braid-${++this.nextTokenId}`,
    );
    return this.braid;
  }
}

function sourceInput(book: WebProjectBookSource): BookInput {
  return {
    kind: "usfm",
    sourceKey: book.sourceKey,
    book: book.bookCode.toUpperCase(),
    source: book.source,
  };
}

function bookInput(
  bookCode: string,
  tokens: readonly Token[],
  lineEnding: "lf" | "crlf" = "lf",
  sourceKey = bookCode,
): BookInput {
  return {
    kind: "tokens",
    sourceKey,
    book: bookCode.toUpperCase(),
    tokens: [...tokens],
    lineEnding,
  };
}

function matchesBraidFix(
  patch: Patch,
  bookCode: string,
  fix: TokenFix,
  tokens: readonly Token[],
): boolean {
  if (
    patch.book !== bookCode ||
    patch.code !== fix.code ||
    patch.label !== fix.label ||
    !sameLabelParams(patch.labelParams, fix.labelParams)
  ) {
    return false;
  }
  return patch.rows.some(
    (row) => tokens[row.position]?.id === fix.targetTokenId,
  );
}

function sameLabelParams(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && left[key] === right[key],
    )
  );
}
