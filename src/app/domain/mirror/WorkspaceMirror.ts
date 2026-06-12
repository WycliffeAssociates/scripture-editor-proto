// WorkspaceMirror.ts
//
// The mirror state machine: a passive token replica + the engine/backup logic
// that reads it. This is a PLAIN module — no Worker, no DOM, no postMessage —
// so it is unit-testable directly and runs unchanged whether hosted in a web
// worker (today) or driven inline. The transport (worker message pump) is a
// thin shell that feeds patches/commands in and ships results out; all the
// behavior lives here.
//
// Resident state is per-chapter tokens/eol/dirty keyed `(book, chapter)`, plus
// per-book disk baselines for the backup envelope. Patches mutate it
// idempotently by generation (a patch older than what a chapter already holds
// is a no-op — covers an unordered or replayed transport). Commands assemble
// scope from resident state and call the injected engines.

import {
  type LineEnding,
  serializeChaptersToUsfm,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import {
  DIRTY_BUFFER_SCHEMA_VERSION,
  type DirtyBufferFile,
  type DiskBaseline,
} from "@/app/state/DirtyBufferStore.ts";
import type { SousAnalyzeResult } from "@/core/domain/sous/sousTypes.ts";
import type { LintIssue, Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

import type {
  AnalyzeScope,
  BackupResult,
  Generation,
  LintResult,
  MirrorChapter,
  MirrorCommand,
  MirrorPatch,
  MirrorResult,
  SousResult,
} from "./mirrorProtocol.ts";

/**
 * The engine + persistence callbacks the mirror needs to do its work. Injected
 * so the host (worker) wires wasm/OPFS and tests wire fakes. `lintBook` /
 * `analyzeSousBook` take a flat token stream — the same input the single-thread
 * services took — so the wasm glue is reused verbatim. `persistBackup` returns
 * `true` if it wrote (web/OPFS) or `false` if it can't persist here (desktop
 * worker), in which case the envelope is shipped back for main to write.
 */
export interface MirrorEngines {
  lintBook(tokens: Token[]): Promise<LintIssue[]>;
  analyzeSousBook(tokens: Token[]): Promise<SousAnalyzeResult>;
  computeMd5(content: string): Promise<string>;
  /** Persist a book's backup envelope. Returns false if persistence is not
   *  available in this host (desktop worker → main does the write). */
  persistBackup(bookCode: string, envelopeJson: string): Promise<boolean>;
  /** Clear a book's backup. */
  clearBackup(bookCode: string): Promise<void>;
}

type ResidentChapter = MirrorChapter & { generation: Generation };

type ResidentBook = {
  diskBaseline: DiskBaseline;
  baselineGeneration: Generation;
  chapters: Map<number, ResidentChapter>;
};

/**
 * Same shape `serializeChaptersToUsfm` expects (`chapterNumber`, `eol`,
 * `currentTokens`). Reusing that one serializer is the HARD invariant: backup
 * bytes must equal what a real save persists, so the mirror cannot reimplement
 * the join.
 */
type SerializableChapter = {
  chapterNumber: number;
  eol: LineEnding;
  currentTokens: Token[];
};

export class WorkspaceMirror {
  private readonly books = new Map<string, ResidentBook>();

  constructor(private readonly engines: MirrorEngines) {}

  // --- Patch application (idempotent by generation) ------------------------

  applyPatch(patch: MirrorPatch): void {
    switch (patch.kind) {
      case "fullSync":
        return this.applyFullSync(patch);
      case "pushChapter": {
        const book = this.ensureBook(patch.ref.bookCode);
        const existing = book.chapters.get(patch.ref.chapterNum);
        // Stale patch (an out-of-order/replayed transport) is a no-op.
        if (existing && existing.generation > patch.generation) return;
        book.chapters.set(patch.ref.chapterNum, {
          ...patch.chapter,
          generation: patch.generation,
        });
        return;
      }
      case "deleteChapter": {
        const book = this.books.get(patch.ref.bookCode);
        const existing = book?.chapters.get(patch.ref.chapterNum);
        if (!book || !existing) return;
        if (existing.generation > patch.generation) return;
        book.chapters.delete(patch.ref.chapterNum);
        if (book.chapters.size === 0) this.books.delete(patch.ref.bookCode);
        return;
      }
      case "pushBaseline": {
        const book = this.ensureBook(patch.bookCode);
        if (book.baselineGeneration > patch.generation) return;
        book.diskBaseline = patch.diskBaseline;
        book.baselineGeneration = patch.generation;
        return;
      }
    }
  }

  private applyFullSync(
    patch: Extract<MirrorPatch, { kind: "fullSync" }>,
  ): void {
    this.books.clear();
    for (const book of patch.books) {
      const chapters = new Map<number, ResidentChapter>();
      for (const { chapterNum, chapter } of book.chapters) {
        chapters.set(chapterNum, { ...chapter, generation: patch.generation });
      }
      this.books.set(book.bookCode, {
        diskBaseline: book.diskBaseline,
        baselineGeneration: patch.generation,
        chapters,
      });
    }
  }

  private ensureBook(bookCode: string): ResidentBook {
    let book = this.books.get(bookCode);
    if (!book) {
      book = {
        diskBaseline: { kind: "absent" },
        baselineGeneration: -1,
        chapters: new Map(),
      };
      this.books.set(bookCode, book);
    }
    return book;
  }

  // --- Commands (read resident state, produce a result) --------------------

  async runCommand(command: MirrorCommand): Promise<MirrorResult> {
    switch (command.kind) {
      case "analyzeLint":
        return this.runLint(command.scope, command.generation);
      case "analyzeSous":
        return this.runSous(command.scope, command.generation);
      case "writeBackup":
        return this.runWriteBackup(
          command.bookCode,
          command.appVersion,
          command.generation,
        );
      case "clearBackup":
        return this.runClearBackup(command.bookCode, command.generation);
    }
  }

  private booksInScope(scope: AnalyzeScope): string[] {
    if (scope === "all") return Array.from(this.books.keys());
    return scope.books.filter((bookCode) => this.books.has(bookCode));
  }

  /**
   * A book's tokens in disk-chapter order. Resident chapters carry no explicit
   * order, so we sort by chapter number — the load/sync produced them in disk
   * order and chapter number is monotonic with it (invariant I1).
   */
  private bookTokens(bookCode: string): Token[] {
    const book = this.books.get(bookCode);
    if (!book) return [];
    const tokens: Token[] = [];
    for (const [, chapter] of this.chaptersInOrder(book)) {
      tokens.push(...chapter.tokens);
    }
    return tokens;
  }

  private async runLint(
    scope: AnalyzeScope,
    generation: Generation,
  ): Promise<LintResult> {
    const byBook: Record<string, LintIssue[]> = {};
    for (const bookCode of this.booksInScope(scope)) {
      const tokens = this.bookTokens(bookCode);
      byBook[bookCode] = tokens.length
        ? await this.engines.lintBook(tokens)
        : [];
    }
    return { kind: "lintResult", byBook, ranAtGeneration: generation };
  }

  private async runSous(
    scope: AnalyzeScope,
    generation: Generation,
  ): Promise<SousResult> {
    const byBook: Record<string, SousAnalyzeResult> = {};
    for (const bookCode of this.booksInScope(scope)) {
      const tokens = this.bookTokens(bookCode);
      byBook[bookCode] = tokens.length
        ? await this.engines.analyzeSousBook(tokens)
        : { segments: {}, findings: [] };
    }
    return { kind: "sousResult", byBook, ranAtGeneration: generation };
  }

  /**
   * The dirty/clean decision is made HERE against resident state (it moved off
   * main with the serialization). Any dirty chapter → serialize the whole book
   * and persist; all clean → clear. Byte-identity with a real save is held by
   * reusing `serializeChaptersToUsfm` over `currentTokens` + per-chapter eol.
   */
  private async runWriteBackup(
    bookCode: string,
    appVersion: string,
    generation: Generation,
  ): Promise<BackupResult> {
    const book = this.books.get(bookCode);
    if (!book || ![...book.chapters.values()].some((c) => c.dirty)) {
      await this.engines.clearBackup(bookCode);
      return {
        kind: "backupResult",
        bookCode,
        cleared: true,
        ranAtGeneration: generation,
      };
    }

    const content = this.serializeBook(book);
    const bodyMd5 = await this.engines.computeMd5(content);
    const entry: DirtyBufferFile = {
      schemaVersion: DIRTY_BUFFER_SCHEMA_VERSION,
      diskBaseline: book.diskBaseline,
      bodyMd5,
      writtenAt: Date.now(),
      appVersion,
      content,
    };
    const envelopeJson = JSON.stringify(entry);
    const wrote = await this.engines.persistBackup(bookCode, envelopeJson);
    return {
      kind: "backupResult",
      bookCode,
      // Ship the bytes back only when the host couldn't persist them.
      envelopeJson: wrote ? undefined : envelopeJson,
      ranAtGeneration: generation,
    };
  }

  private async runClearBackup(
    bookCode: string,
    generation: Generation,
  ): Promise<BackupResult> {
    await this.engines.clearBackup(bookCode);
    return {
      kind: "backupResult",
      bookCode,
      cleared: true,
      ranAtGeneration: generation,
    };
  }

  /** Resident chapters in disk order (chapter number ascending — invariant I1). */
  private chaptersInOrder(
    book: ResidentBook,
  ): Array<[number, ResidentChapter]> {
    return [...book.chapters.entries()].sort((a, b) => a[0] - b[0]);
  }

  private serializeBook(book: ResidentBook): string {
    const chapters: SerializableChapter[] = this.chaptersInOrder(book).map(
      ([chapterNum, chapter]) => ({
        chapterNumber: chapterNum,
        eol: chapter.eol,
        currentTokens: chapter.tokens,
      }),
    );
    return serializeChaptersToUsfm(chapters, (c) => c.currentTokens);
  }
}
