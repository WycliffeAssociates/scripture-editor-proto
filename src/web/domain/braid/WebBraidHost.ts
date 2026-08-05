import { Braid } from "usfm-onion-web";
import type {
  BookInput,
  ChapterTarget,
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

/**
 * The same book addressed as an extent into one concatenated `sources` buffer.
 *
 * Bytes cross into wasm as buffers, never as per-book payloads: one book's
 * source and one book's container are both a range in a buffer the caller
 * already holds, so a whole-corpus restore is two `Uint8Array`s plus this
 * table — not 66 of anything.
 */
export type WebProjectBookExtent = {
  bookCode: string;
  sourceKey: string;
  byteOffset: number;
  byteLength: number;
};

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
    // A cold seed IS the disk state, so declaring it as the baseline is a
    // statement about what is already resident — not content to hand back.
    unwrapBraid(
      this.ensureBraid().setBaselineToCurrent({ kind: "all" }),
      "cold baseline",
    );
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

  /** Whether Braid currently holds this book at all. */
  hasBook(bookCode: string): boolean {
    const wanted = bookCode.toUpperCase();
    return this.ensureBraid()
      .books()
      .some((book) => book.book === wanted);
  }

  /**
   * Layer a whole book's USFM over the resident copy WITHOUT touching its
   * baseline — the crash-recovery shape: baseline stays disk, current becomes
   * the backup, and Braid answers "is this dirty" for free afterwards.
   *
   * Ingest failure is returned, not thrown: one unparseable backup must not
   * abort a reopen.
   */
  layerBookFromUsfm(
    bookCode: string,
    sourceKey: string,
    source: string,
  ): { accepted: boolean; error?: string } {
    const outcome = this.ensureBraid().updateBook({
      kind: "usfm",
      sourceKey,
      book: bookCode.toUpperCase(),
      source,
    });
    if (outcome.status === "error") {
      return { accepted: false, error: JSON.stringify(outcome.error) };
    }
    return { accepted: true };
  }

  /**
   * Which of a book's chapters differ from its baseline, by chapter number.
   *
   * Front matter has no number and cannot be addressed as a chapter in the
   * editor's per-chapter model, so it is reported as chapter 0 — the same
   * front-matter bucket findings already use.
   */
  dirtyChapters(bookCode: string): number[] {
    const book = bookCode.toUpperCase();
    const labels = unwrapBraid(
      this.ensureBraid().chapterLabels(book),
      "chapter labels",
    );
    const dirty: number[] = [];
    for (const label of labels) {
      const isDirty = unwrapBraid(
        this.ensureBraid().isDirty({
          kind: "chapter",
          target: { book, label },
        }),
        "chapter dirty check",
      );
      if (!isDirty) continue;
      // The label is the chapter run's label EXACTLY as the source spells it,
      // so `\c 1 \p` yields "1 " — trailing space and all.
      dirty.push(label.kind === "number" ? Number(label.label.trim()) : 0);
    }
    return dirty;
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
    return {
      packed: ownedBuffer(outcome.bytes),
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
    sources: Uint8Array,
    records: readonly WebProjectBookExtent[],
  ): { accepted: boolean; error?: string } {
    const outcome = this.ensureBraid().restorePublishedCorpus(
      packed,
      sources,
      records.map((record) => ({
        book: record.bookCode.toUpperCase(),
        sourceKey: record.sourceKey,
        byteOffset: record.byteOffset,
        byteLength: record.byteLength,
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
   * files on disk — so current IS the saved state, and that is the whole fact
   * being recorded. Nothing is handed back across the boundary to say it.
   */
  adoptRestoredBaseline(): { accepted: boolean; error?: string } {
    const outcome = this.ensureBraid().setBaselineToCurrent({ kind: "all" });
    if (outcome.status === "error") {
      return { accepted: false, error: JSON.stringify(outcome.error) };
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
      packed: ownedBuffer(outcome.bytes),
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

  /**
   * Reset whole books to their declared baseline and hand back what changed.
   *
   * Atomic across the scope: Braid validates every named book is resident AND
   * baselined before it mutates anything, so a missing baseline leaves resident
   * state byte-identical rather than reverting some books and refusing others.
   * A book already equal to its baseline is a no-op and is simply absent from
   * the result.
   *
   * Books are reverted one scope at a time rather than as `all`, because
   * Discard names the books it means; reverting the corpus would also throw
   * away edits the user made in books they never touched with a backup.
   */
  revertToBaseline(bookCodes: readonly string[]): {
    books: Record<string, Token[]>;
    usfm: Record<string, string>;
  } {
    const braid = this.ensureBraid();
    const books: Record<string, Token[]> = {};
    const usfm: Record<string, string> = {};
    for (const bookCode of bookCodes) {
      const book = bookCode.toUpperCase();
      const effect = unwrapBraid(
        braid.revertToBaseline({ kind: "book", book }),
        "revert to baseline",
      );
      if (effect.changed.length === 0) continue;
      const hydrated = unwrapBraid(
        braid.toTokens([{ book }]),
        "revert hydration",
      );
      books[book] = hydrated.flatMap((scope) => scope.tokens);
      usfm[book] = this.toUsfm(book);
    }
    return { books, usfm };
  }

  updateChapter(
    bookCode: string,
    chapterNum: number,
    tokens: readonly Token[],
  ): BraidMutation {
    const target = chapterTarget(bookCode, chapterNum);
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
    const target = chapterTarget(bookCode, chapterNum);
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

/**
 * A container's bytes as a buffer this host can hand over.
 *
 * Braid returns a fresh `Uint8Array` per publication, so its buffer is already
 * ours to transfer; the copy is only for the case where the view does not span
 * its whole buffer, which would otherwise transfer more than the container.
 */
function ownedBuffer(view: Uint8Array): ArrayBuffer {
  return view.byteOffset === 0 && view.byteLength === view.buffer.byteLength
    ? (view.buffer as ArrayBuffer)
    : (view.buffer.slice(
        view.byteOffset,
        view.byteOffset + view.byteLength,
      ) as ArrayBuffer);
}

/**
 * Address one chapter run the way Braid names it.
 *
 * Chapter 0 is the editor's address for front matter — everything before
 * `\\c 1` — which Braid does not label with a number at all. Sending it as
 * `{kind:"number", label:"0"}` names a run that cannot exist, so the mutation
 * fails with `chapterNotFound`; this is the inverse of the mapping
 * `dirtyChapters` already applies when it reports front matter as 0.
 */
function chapterTarget(bookCode: string, chapterNum: number): ChapterTarget {
  return {
    book: bookCode.toUpperCase(),
    label:
      chapterNum === 0
        ? { kind: "frontMatter" }
        : { kind: "number", label: String(chapterNum) },
  };
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
