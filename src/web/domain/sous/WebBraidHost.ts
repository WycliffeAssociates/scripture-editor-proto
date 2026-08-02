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
import type { SegmentsBySid } from "@/core/domain/usfm/vrefTypes.ts";

export type BraidProjection = {
  keys: string[];
  texts: string[];
  segments: SegmentsBySid;
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

/** Web-worker resident Braid arm. Galley consumes its projections separately. */
export class WebBraidHost {
  private braid: Braid | null = null;
  private nextTokenId = 0;

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
    if (mutation.status === "error") {
      throw new Error(
        `Braid corpus seed failed: ${JSON.stringify(mutation.error)}`,
      );
    }
    return {
      effect: mutation.value.changed.length === 0 ? "unchanged" : "changed",
      projection: this.projection({ kind: "all" }),
    };
  }

  setBaseline(
    bookCode: string,
    tokens: readonly Token[],
    lineEnding: "lf" | "crlf",
  ): void {
    const result = this.ensureBraid().setBaseline(
      bookInput(bookCode, tokens, lineEnding),
    );
    if (result.status === "error") {
      throw new Error(
        `Braid baseline rejected: ${JSON.stringify(result.error)}`,
      );
    }
  }

  clearBaseline(bookCode: string): void {
    this.ensureBraid().clearBaseline(bookCode.toUpperCase());
  }

  isDirty(bookCode: string): boolean {
    const result = this.ensureBraid().isDirty({
      kind: "book",
      book: bookCode.toUpperCase(),
    });
    if (result.status === "error") {
      throw new Error(
        `Braid dirty check failed: ${JSON.stringify(result.error)}`,
      );
    }
    return result.value;
  }

  toUsfm(bookCode: string): string {
    const result = this.ensureBraid().toUsfm({
      kind: "book",
      book: bookCode.toUpperCase(),
    });
    if (result.status === "error") {
      throw new Error(
        `Braid USFM serialization failed: ${JSON.stringify(result.error)}`,
      );
    }
    return result.value.kind === "single"
      ? result.value.value
      : (result.value.books.find((book) => book.book === bookCode.toUpperCase())
          ?.value ?? "");
  }

  toUsfmAll(): Array<{ bookCode: string; contents: string }> {
    const result = this.ensureBraid().toUsfm({ kind: "all" });
    if (result.status === "error") {
      throw new Error(
        `Braid corpus USFM serialization failed: ${JSON.stringify(result.error)}`,
      );
    }
    if (result.value.kind === "single") {
      throw new Error(
        "Braid returned a single-book result for all-scope output",
      );
    }
    return result.value.books.map((book) => ({
      bookCode: book.book,
      contents: book.value,
    }));
  }

  publish(): WebBraidPublication {
    const outcome = this.ensureBraid().publish();
    if (outcome.status === "error") {
      throw new Error(
        `Braid publication failed: ${JSON.stringify(outcome.error)}`,
      );
    }
    const serializedBooks = this.toUsfmAll();
    const packed = Uint8Array.from(outcome.value.bytes).slice().buffer;
    return {
      packed,
      snapshotId: outcome.value.snapshotId,
      books: outcome.value.books,
      serializedBooks,
      sources: serializedBooks.map((book) => ({
        bookCode: book.bookCode,
        sourceKey: book.bookCode,
        source: book.contents,
      })),
    };
  }

  restorePublishedCorpus(
    packed: ArrayBuffer,
    records: Array<{ bookCode: string; sourceKey: string; source: string }>,
  ): { accepted: boolean; error?: string } {
    const outcome = this.ensureBraid().restorePublishedCorpus(
      new Uint8Array(packed),
      records.map((record) => ({
        book: record.bookCode,
        sourceKey: record.sourceKey,
        source: Array.from(new TextEncoder().encode(record.source)),
      })),
    );
    if (outcome.status === "error") {
      return { accepted: false, error: JSON.stringify(outcome.error) };
    }
    for (const record of records) {
      const hydrated = this.ensureBraid().toTokens([{ book: record.bookCode }]);
      if (hydrated.status === "error") {
        return { accepted: false, error: JSON.stringify(hydrated.error) };
      }
      const tokens = hydrated.value.flatMap((scope) => scope.tokens);
      const baseline = this.ensureBraid().setBaseline(
        bookInput(
          record.bookCode,
          tokens,
          record.source.includes("\r\n") ? "crlf" : "lf",
        ),
      );
      if (baseline.status === "error") {
        return { accepted: false, error: JSON.stringify(baseline.error) };
      }
    }
    return { accepted: true };
  }

  format(
    scope: CorpusScope,
    options: FormatOptions = { insertStructuralLinebreaks: false },
  ): { books: Record<string, Token[]>; usfm: Record<string, string> } {
    const braid = this.ensureBraid();
    const prepared = braid.prepareFormatPatch(scope, options);
    if (prepared.status === "error") {
      throw new Error(
        `Braid format preparation failed: ${JSON.stringify(prepared.error)}`,
      );
    }
    if (prepared.value.kind === "unchanged") return { books: {}, usfm: {} };
    const applied = braid.applyFormatPatch(prepared.value.id);
    if (applied.status === "error") {
      throw new Error(
        `Braid format apply failed: ${JSON.stringify(applied.error)}`,
      );
    }
    const books: Record<string, Token[]> = {};
    const usfm: Record<string, string> = {};
    for (const bookCode of new Set(
      applied.value.changed.map((item) => item.book),
    )) {
      const hydrated = braid.toTokens([{ book: bookCode }]);
      if (hydrated.status === "error") {
        throw new Error(
          `Braid format hydration failed: ${JSON.stringify(hydrated.error)}`,
        );
      }
      const tokens = hydrated.value.find(
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
    const hydrated = braid.toTokens([{ book: normalizedBook }]);
    if (hydrated.status === "error") {
      throw new Error(
        `Braid fix hydration failed: ${JSON.stringify(hydrated.error)}`,
      );
    }
    const currentTokens = hydrated.value.flatMap((scope) => scope.tokens);
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
    const applied = braid.applyPatch(patch.id);
    if (applied.status === "error") {
      throw new Error(
        `Braid fix apply failed: ${JSON.stringify(applied.error)}`,
      );
    }
    if (applied.value.changed.length === 0) return { books: {}, usfm: {} };
    const next = braid.toTokens([{ book: normalizedBook }]);
    if (next.status === "error") {
      throw new Error(
        `Braid fix result hydration failed: ${JSON.stringify(next.error)}`,
      );
    }
    return {
      books: { [normalizedBook]: next.value.flatMap((scope) => scope.tokens) },
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
    const mutation = this.ensureBraid().updateChapter(target, {
      kind: "tokens",
      tokens: [...tokens],
    });
    if (mutation.status === "error") {
      throw new Error(
        `Braid chapter update failed: ${JSON.stringify(mutation.error)}`,
      );
    }
    return {
      effect: mutation.value.changed.length === 0 ? "unchanged" : "changed",
      projection:
        mutation.value.changed.length === 0
          ? null
          : this.projection({ kind: "chapter", target }),
    };
  }

  updateBook(
    bookCode: string,
    tokens: readonly Token[],
    lineEnding: "lf" | "crlf",
  ): BraidMutation {
    const mutation = this.ensureBraid().updateBook(
      bookInput(bookCode, tokens, lineEnding),
    );
    if (mutation.status === "error") {
      throw new Error(
        `Braid book update failed: ${JSON.stringify(mutation.error)}`,
      );
    }
    return {
      effect: mutation.value.changed.length === 0 ? "unchanged" : "changed",
      projection:
        mutation.value.changed.length === 0
          ? null
          : this.projection({ kind: "book", book: bookCode.toUpperCase() }),
    };
  }

  removeChapter(bookCode: string, chapterNum: number): BraidMutation {
    const target = {
      book: bookCode.toUpperCase(),
      label: { kind: "number", label: String(chapterNum) } as const,
    };
    const mutation = this.ensureBraid().removeChapter(target);
    if (mutation.status === "error") {
      throw new Error(
        `Braid chapter removal failed: ${JSON.stringify(mutation.error)}`,
      );
    }
    return {
      effect: mutation.value.changed.length === 0 ? "unchanged" : "changed",
      projection:
        mutation.value.changed.length === 0
          ? null
          : this.tryProjection({ kind: "book", book: bookCode.toUpperCase() }),
    };
  }

  removeBook(bookCode: string): void {
    const mutation = this.ensureBraid().removeBook(bookCode.toUpperCase());
    if (mutation.status === "error") {
      throw new Error(
        `Braid book removal failed: ${JSON.stringify(mutation.error)}`,
      );
    }
  }

  lintFindings(): LintSnapshot {
    return this.ensureBraid().lint();
  }

  projection(scope: CorpusScope): BraidProjection {
    const result = this.ensureBraid().vrefIndex(scope);
    if (result.status === "error") {
      throw new Error(
        `Braid vref index failed: ${JSON.stringify(result.error)}`,
      );
    }
    const indexes =
      result.value.kind === "single"
        ? [result.value.value]
        : result.value.books.map((book) => book.value);
    const entries = indexes.flatMap((index) => index);
    const keys = entries.map(([sid]) => sid);
    const texts = entries.map(([, verse]) => verse.text);
    const segments: SegmentsBySid = {};
    for (const [sid, verse] of entries) {
      segments[sid] = verse.segments.map((segment) => ({
        tokenId: segment.tokenId,
        textSpan: segment.textSpan,
      }));
    }
    return { keys, texts, segments };
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

function bookInput(
  bookCode: string,
  tokens: readonly Token[],
  lineEnding: "lf" | "crlf" = "lf",
): BookInput {
  return {
    kind: "tokens",
    sourceKey: bookCode.toUpperCase(),
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
