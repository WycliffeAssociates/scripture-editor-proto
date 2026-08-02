// WorkspaceMirror.ts
//
// The mirror state machine: a passive token replica + host coordination logic
// that reads it. This is a PLAIN module — no Worker, no DOM, no postMessage —
// so it is unit-testable directly and runs unchanged whether hosted in a web
// worker (today) or driven inline. The transport (worker message pump) is a
// thin shell that feeds patches/commands in and ships results out; all the
// behavior lives here.
//
// The resident Braid/Galley hosts own the token corpus. This coordinator retains
// only chapter metadata and disk baselines needed for backup policy and transport
// idempotence; it never keeps a second copy of resident tokens.

import type { SousConfig } from "scripture-sous-chef-web";
import type { CorpusScope, FormatOptions, LintSnapshot } from "usfm-onion-web";

import {
  DIRTY_BUFFER_SCHEMA_VERSION,
  type DirtyBufferFile,
  type DiskBaseline,
} from "@/app/state/DirtyBufferStore.ts";
import type {
  GalleyAnalysis,
  GalleyMutationEffect,
} from "@/core/domain/sous/galleyTypes.ts";
import type { Token, TokenFix } from "@/core/domain/usfm/usfmOnionTypes.ts";

import type {
  GalleyCachePolicy,
  BackupResult,
  Generation,
  LintResult,
  MirrorChapter,
  MirrorCommand,
  MirrorPatch,
  MirrorResult,
  GalleyResult,
  ApplyBraidFixResult,
  FormatBraidResult,
  PublishBraidResult,
  RestoreBraidResult,
  BraidPublication,
  RestoreBraidRecord,
} from "./mirrorProtocol.ts";
import { retryBackupWrite } from "./retryBackupWrite.ts";

/**
 * The engine + persistence callbacks the mirror needs to do its work. Injected
 * so the host (worker) wires wasm/OPFS and tests wire fakes. Galley is a
 * resident handle: the mirror seeds it once, applies chapter/book mutations,
 * then calls parameterless analysis. Backup persistence stays behind this
 * resident-host interface.
 */
export interface MirrorEngines {
  /** Complete resident Braid publication; Braid owns scope and ordering. */
  lintFindings(): Promise<LintSnapshot> | LintSnapshot;
  seedGalley(
    books: ResidentBraidBook[],
    config?: SousConfig,
  ): GalleyMutationEffect;
  updateGalleyChapter(
    bookCode: string,
    chapterNum: number,
    tokens: Token[],
  ): GalleyMutationEffect;
  updateGalleyBook(
    bookCode: string,
    tokens: Token[],
    lineEnding: "lf" | "crlf",
  ): GalleyMutationEffect;
  removeGalleyChapter(
    bookCode: string,
    chapterNum: number,
  ): GalleyMutationEffect;
  removeGalleyBook(bookCode: string): GalleyMutationEffect;
  updateGalleyConfig(config: SousConfig): GalleyMutationEffect;
  analyzeGalley(
    config?: SousConfig,
    cachePolicy?: GalleyCachePolicy,
  ): Promise<GalleyAnalysis>;
  /** Optional app-cache load performed after Galley has established identity. */
  loadGalley?(config?: SousConfig): Promise<GalleyAnalysis | null>;
  formatBraid(
    scope: CorpusScope,
    options?: FormatOptions,
  ): { books: Record<string, Token[]>; usfm: Record<string, string> };
  applyBraidFix(
    bookCode: string,
    fix: TokenFix,
  ): { books: Record<string, Token[]>; usfm: Record<string, string> };
  publishBraid(): Promise<BraidPublication> | BraidPublication;
  restoreBraid(
    packed: ArrayBuffer,
    records: RestoreBraidRecord[],
  ):
    | Promise<{ accepted: boolean; error?: string }>
    | { accepted: boolean; error?: string };
  setBraidBaseline(bookCode: string, tokens: Token[], eol: "lf" | "crlf"): void;
  clearBraidBaseline(bookCode: string): void;
  isBraidDirty(bookCode: string): boolean;
  braidUsfm(bookCode: string): string;
  computeMd5(content: string): Promise<string>;
  /** Persist a book's backup envelope through the resident host. */
  persistBackup(bookCode: string, envelopeJson: string): Promise<boolean>;
  /** Clear a book's backup through the resident host. */
  clearBackup(bookCode: string): Promise<boolean>;
  /** Release resident wasm/native handles before the transport is torn down. */
  dispose?(): void;
}

export type ResidentBraidBook = {
  bookCode: string;
  tokens: Token[];
  baselineTokens: Token[];
  lineEnding: "lf" | "crlf";
};

type ResidentChapter = Pick<MirrorChapter, "eol" | "dirty"> & {
  generation: Generation;
};

type ResidentBook = {
  diskBaseline: DiskBaseline;
  baselineGeneration: Generation;
  chapters: Map<number, ResidentChapter>;
};

export class WorkspaceMirror {
  private readonly books = new Map<string, ResidentBook>();
  private galleySeeded = false;
  private galleyDirty = false;
  private lastGalley: GalleyAnalysis | null = null;
  private latestPatchGeneration = -1;

  constructor(
    private readonly engines: MirrorEngines,
    private readonly backgroundResult: (
      result: MirrorResult,
    ) => void = () => {},
  ) {}

  dispose(): void {
    this.engines.dispose?.();
    this.books.clear();
    this.galleySeeded = false;
    this.galleyDirty = false;
    this.lastGalley = null;
  }

  // --- Patch application (idempotent by generation) ------------------------

  applyPatch(patch: MirrorPatch): void {
    this.latestPatchGeneration = Math.max(
      this.latestPatchGeneration,
      patch.generation,
    );
    switch (patch.kind) {
      case "fullSync":
        this.applyFullSync(patch);
        return;
      case "syncMeta":
        this.applySyncMeta(patch);
        return;
      case "pushChapter": {
        const book = this.ensureBook(patch.ref.bookCode);
        const existing = book.chapters.get(patch.ref.chapterNum);
        // Stale patch (an out-of-order/replayed transport) is a no-op.
        const stale = !!existing && existing.generation > patch.generation;
        if (stale) return;
        book.chapters.set(patch.ref.chapterNum, {
          eol: patch.chapter.eol,
          dirty: patch.chapter.dirty,
          generation: patch.generation,
        });
        this.requireResident();
        this.galleyDirty =
          this.engines.updateGalleyChapter(
            patch.ref.bookCode,
            patch.ref.chapterNum,
            patch.chapter.tokens,
          ) === "changed" || this.galleyDirty;
        return;
      }
      case "deleteChapter": {
        const book = this.books.get(patch.ref.bookCode);
        const existing = book?.chapters.get(patch.ref.chapterNum);
        if (!book || !existing) return;
        if (existing.generation > patch.generation) return;
        book.chapters.delete(patch.ref.chapterNum);
        if (book.chapters.size === 0) {
          this.books.delete(patch.ref.bookCode);
          this.requireResident();
          this.galleyDirty =
            this.engines.removeGalleyBook(patch.ref.bookCode) === "changed" ||
            this.galleyDirty;
          this.engines.clearBraidBaseline(patch.ref.bookCode);
        } else {
          this.requireResident();
          this.galleyDirty =
            this.engines.removeGalleyChapter(
              patch.ref.bookCode,
              patch.ref.chapterNum,
            ) === "changed" || this.galleyDirty;
        }
        return;
      }
      case "updateBook": {
        const existing = this.books.get(patch.book.bookCode);
        if (existing && existing.baselineGeneration > patch.generation) {
          return;
        }
        const chapters = new Map<number, ResidentChapter>();
        for (const { chapterNum, chapter } of patch.book.chapters) {
          const prior = existing?.chapters.get(chapterNum);
          if (prior && prior.generation > patch.generation) return;
          chapters.set(chapterNum, {
            eol: chapter.eol,
            dirty: chapter.dirty,
            generation: patch.generation,
          });
        }
        this.requireResident();
        this.galleyDirty =
          this.engines.updateGalleyBook(
            patch.book.bookCode,
            patch.book.chapters.flatMap(({ chapter }) => chapter.tokens),
            patch.book.chapters[0]?.chapter.eol === "\r\n" ? "crlf" : "lf",
          ) === "changed" || this.galleyDirty;
        this.engines.setBraidBaseline(
          patch.book.bookCode,
          patch.book.baselineTokens,
          patch.book.chapters[0]?.chapter.eol === "\r\n" ? "crlf" : "lf",
        );
        this.books.set(patch.book.bookCode, {
          diskBaseline: patch.book.diskBaseline,
          baselineGeneration: patch.generation,
          chapters,
        });
        this.latestPatchGeneration = Math.max(
          this.latestPatchGeneration,
          patch.generation,
        );
        return;
      }
      case "removeBook": {
        const existing = this.books.get(patch.bookCode);
        if (!existing || existing.baselineGeneration > patch.generation) {
          return;
        }
        this.books.delete(patch.bookCode);
        this.requireResident();
        this.galleyDirty =
          this.engines.removeGalleyBook(patch.bookCode) === "changed" ||
          this.galleyDirty;
        this.engines.clearBraidBaseline(patch.bookCode);
        this.latestPatchGeneration = Math.max(
          this.latestPatchGeneration,
          patch.generation,
        );
        return;
      }
      case "pushBaseline": {
        const book = this.ensureBook(patch.bookCode);
        if (book.baselineGeneration > patch.generation) return;
        book.diskBaseline = patch.diskBaseline;
        book.baselineGeneration = patch.generation;
        this.engines.setBraidBaseline(
          patch.bookCode,
          patch.baselineTokens,
          this.lineEnding(book),
        );
        return;
      }
    }
  }

  private applyFullSync(
    patch: Extract<MirrorPatch, { kind: "fullSync" }>,
  ): void {
    this.books.clear();
    this.galleySeeded = false;
    this.galleyDirty = false;
    this.lastGalley = null;
    this.latestPatchGeneration = patch.generation;
    const seedBooks: ResidentBraidBook[] = [];
    for (const book of patch.books) {
      const chapters = new Map<number, ResidentChapter>();
      for (const { chapterNum, chapter } of book.chapters) {
        chapters.set(chapterNum, {
          eol: chapter.eol,
          dirty: chapter.dirty,
          generation: patch.generation,
        });
      }
      this.books.set(book.bookCode, {
        diskBaseline: book.diskBaseline,
        baselineGeneration: patch.generation,
        chapters,
      });
      const firstChapter = book.chapters[0]?.chapter;
      seedBooks.push({
        bookCode: book.bookCode,
        tokens: book.chapters.flatMap(({ chapter }) => chapter.tokens),
        baselineTokens: book.baselineTokens,
        lineEnding: firstChapter?.eol === "\r\n" ? "crlf" : "lf",
      });
    }
    this.engines.seedGalley(seedBooks);
    this.galleySeeded = true;
    this.galleyDirty = true;
  }

  /**
   * Move dirty flags + disk baselines onto the entries we already hold without
   * disturbing tokens. A metadata-only commit cannot add or remove content, so
   * an unmentioned book/chapter is left intact and a mentioned book the mirror
   * doesn't know is ignored (it would arrive via a content patch first). Each
   * chapter's flag advances under the same generation guard tokens use.
   */
  private applySyncMeta(
    patch: Extract<MirrorPatch, { kind: "syncMeta" }>,
  ): void {
    for (const meta of patch.books) {
      const book = this.books.get(meta.bookCode);
      if (!book) continue;
      if (book.baselineGeneration <= patch.generation) {
        book.diskBaseline = meta.diskBaseline;
        book.baselineGeneration = patch.generation;
        this.engines.setBraidBaseline(
          meta.bookCode,
          meta.baselineTokens,
          this.lineEnding(book),
        );
      }
      for (const { chapterNum, dirty } of meta.chapterDirty) {
        const chapter = book.chapters.get(chapterNum);
        if (!chapter || chapter.generation > patch.generation) continue;
        chapter.dirty = dirty;
        chapter.generation = patch.generation;
      }
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
        return this.runLint(command.generation, command.requestId);
      case "analyzeGalley":
        return this.runGalley(
          command.generation,
          command.requestId,
          command.config,
          command.cachePolicy,
        );
      case "formatBraid":
        return this.runFormatBraid(
          command.generation,
          command.requestId,
          command.scope,
          command.options,
        );
      case "applyBraidFix":
        return this.runApplyBraidFix(
          command.generation,
          command.requestId,
          command.bookCode,
          command.fix,
        );
      case "publishBraid":
        return this.runPublishBraid(command.generation, command.requestId);
      case "restoreBraid":
        return this.runRestoreBraid(
          command.generation,
          command.packed,
          command.records,
        );
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

  private runFormatBraid(
    generation: Generation,
    requestId: string,
    scope: CorpusScope,
    options?: FormatOptions,
  ): FormatBraidResult {
    if (generation !== this.latestPatchGeneration) {
      return {
        kind: "formatBraidResult",
        requestId,
        books: {},
        usfm: {},
        ranAtGeneration: generation,
        behind: generation > this.latestPatchGeneration,
        superseded: generation < this.latestPatchGeneration,
      };
    }
    return {
      kind: "formatBraidResult",
      requestId,
      ...this.engines.formatBraid(scope, options),
      ranAtGeneration: generation,
      behind: false,
      superseded: false,
    };
  }

  private runApplyBraidFix(
    generation: Generation,
    requestId: string,
    bookCode: string,
    fix: TokenFix,
  ): ApplyBraidFixResult {
    if (generation !== this.latestPatchGeneration) {
      return {
        kind: "applyBraidFixResult",
        requestId,
        books: {},
        usfm: {},
        ranAtGeneration: generation,
        behind: generation > this.latestPatchGeneration,
        superseded: generation < this.latestPatchGeneration,
      };
    }
    return {
      kind: "applyBraidFixResult",
      requestId,
      ...this.engines.applyBraidFix(bookCode, fix),
      ranAtGeneration: generation,
      behind: false,
      superseded: false,
    };
  }

  private async runPublishBraid(
    generation: Generation,
    requestId: string,
  ): Promise<PublishBraidResult> {
    if (generation !== this.latestPatchGeneration) {
      return {
        kind: "publishBraidResult",
        requestId,
        ranAtGeneration: generation,
        behind: generation > this.latestPatchGeneration,
        superseded: generation < this.latestPatchGeneration,
      };
    }
    this.requireResident();
    return {
      kind: "publishBraidResult",
      requestId,
      publication: await this.engines.publishBraid(),
      ranAtGeneration: generation,
      behind: false,
      superseded: false,
    };
  }

  private async runRestoreBraid(
    generation: Generation,
    packed: ArrayBuffer,
    records: RestoreBraidRecord[],
  ): Promise<RestoreBraidResult> {
    if (generation !== this.latestPatchGeneration) {
      return {
        kind: "restoreBraidResult",
        accepted: false,
        ranAtGeneration: generation,
        error: "restore request was superseded by a newer editor generation",
      };
    }
    this.requireResident();
    try {
      return {
        kind: "restoreBraidResult",
        accepted: (await this.engines.restoreBraid(packed, records)).accepted,
        ranAtGeneration: generation,
      };
    } catch (error) {
      return {
        kind: "restoreBraidResult",
        accepted: false,
        ranAtGeneration: generation,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async runLint(
    generation: Generation,
    requestId: string | undefined,
  ): Promise<LintResult> {
    this.requireResident();
    return {
      kind: "lintResult",
      snapshot: await this.engines.lintFindings(),
      ranAtGeneration: generation,
      requestId,
    };
  }

  private async runGalley(
    generation: Generation,
    requestId: string | undefined,
    config: SousConfig | undefined,
    cachePolicy: GalleyCachePolicy,
  ): Promise<GalleyResult> {
    this.requireResident();
    if (config) {
      this.galleyDirty =
        this.engines.updateGalleyConfig(config) === "changed" ||
        this.galleyDirty;
    }

    if (!this.galleyDirty && cachePolicy === "none" && this.lastGalley) {
      return {
        kind: "galleyResult",
        ...cloneGalleyAnalysis(this.lastGalley),
        ranAtGeneration: generation,
        requestId,
      };
    }

    const cached =
      cachePolicy === "restore" && this.engines.loadGalley
        ? await this.engines.loadGalley(config)
        : null;
    if (cached) {
      // Return the validated-by-main candidate immediately, then let the
      // resident handle publish a fresh result without blocking first paint.
      setTimeout(() => {
        void this.engines
          .analyzeGalley(config, cachePolicy)
          .then((fresh) => {
            this.galleyDirty = false;
            this.rememberGalley(fresh);
            this.backgroundResult({
              kind: "galleyResult",
              ...fresh,
              ranAtGeneration: generation,
            });
          })
          .catch((error: unknown) =>
            console.error("[mirror] background Galley refresh failed", {
              error,
            }),
          );
      }, 0);
      return {
        kind: "galleyResult",
        ...cached,
        ranAtGeneration: generation,
        requestId,
      };
    }

    const fresh = await this.engines.analyzeGalley(config, cachePolicy);
    this.galleyDirty = false;
    this.rememberGalley(fresh);
    return {
      kind: "galleyResult",
      ...fresh,
      ranAtGeneration: generation,
      requestId,
    };
  }

  private rememberGalley(analysis: GalleyAnalysis): void {
    // The worker transfers the result buffer, so retain an owned copy for a
    // later no-op command instead of re-running Galley just to recreate it.
    this.lastGalley = {
      ...analysis,
      packed: analysis.packed.slice(0),
      keys: [...analysis.keys],
      segments: analysis.segments,
    };
  }

  /**
   * Braid is the semantic dirty authority. It compares the resident working
   * book with the saved baseline; the app's chapter flags remain metadata for
   * recovery UI but are no longer the backup decision.
   */
  private async runWriteBackup(
    bookCode: string,
    appVersion: string,
    generation: Generation,
  ): Promise<BackupResult> {
    const book = this.books.get(bookCode);
    if (!book) {
      return this.runClearBackup(bookCode, generation);
    }
    this.requireResident();
    if (!this.engines.isBraidDirty(bookCode)) {
      return this.runClearBackup(bookCode, generation);
    }

    const content = this.engines.braidUsfm(bookCode);
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
    try {
      await retryBackupWrite(() =>
        this.engines.persistBackup(bookCode, envelopeJson),
      );
    } catch (error) {
      // Retries exhausted: log loudly and leave the book dormant until its next
      // commit re-triggers a write.
      console.error(
        "[mirror] backup write failed after retries; book left dormant",
        { bookCode, error },
      );
    }
    return {
      kind: "backupResult",
      bookCode,
      ranAtGeneration: generation,
    };
  }

  private async runClearBackup(
    bookCode: string,
    generation: Generation,
  ): Promise<BackupResult> {
    // A throw is a transient failure: retry, then leave dormant.
    try {
      await retryBackupWrite(() => this.engines.clearBackup(bookCode));
    } catch (error) {
      console.error(
        "[mirror] backup clear failed after retries; book left dormant",
        { bookCode, error },
      );
    }
    return {
      kind: "backupResult",
      bookCode,
      cleared: true,
      ranAtGeneration: generation,
    };
  }

  private requireResident(): void {
    if (!this.galleySeeded) {
      throw new Error(
        "Resident Braid must be seeded before commands or patches",
      );
    }
  }

  private lineEnding(book: ResidentBook): "lf" | "crlf" {
    const first = book.chapters.values().next().value as
      | ResidentChapter
      | undefined;
    return first?.eol === "\r\n" ? "crlf" : "lf";
  }
}

function cloneGalleyAnalysis(analysis: GalleyAnalysis): GalleyAnalysis {
  return {
    ...analysis,
    packed: analysis.packed.slice(0),
    keys: [...analysis.keys],
    segments: analysis.segments,
  };
}
