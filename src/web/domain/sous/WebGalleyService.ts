import { Galley } from "scripture-sous-chef-web";
import type {
  BookUpdateIn,
  ChapterUpdateIn,
  SousConfig,
  VrefCorpus,
} from "scripture-sous-chef-web";
import type { CorpusScope, FormatOptions } from "usfm-onion-web";

import type { GalleyCachePolicy } from "@/app/domain/mirror/mirrorProtocol.ts";
import type { ResidentBraidBook } from "@/app/domain/mirror/WorkspaceMirror.ts";
import { devTimer } from "@/app/ui/hooks/utils/domUtils.ts";
import type {
  GalleyAnalysis,
  GalleyCacheIdentity,
  GalleyMutationEffect,
} from "@/core/domain/sous/galleyTypes.ts";
import type { Token, TokenFix } from "@/core/domain/usfm/usfmOnionTypes.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";

import {
  type BraidProjection,
  type WebBraidPublication,
  WebBraidHost,
} from "./WebBraidHost.ts";

type CacheOptions = {
  fileSystem: FileSystem;
  root: string;
  workspaceKey: string;
};

type Projection = BraidProjection & { target: VrefCorpus };

/**
 * Owns the resident web Galley and its editor-facing projection sidecar.
 * Corpus construction happens only at seed/structural replacement time;
 * ordinary chapter edits use Galley's chapter mutation API and update the
 * matching sidecar range without rebuilding the whole VREF index.
 */
export class WebGalleyService {
  private galley: Galley | null = null;
  private projection: Projection | null = null;
  private readonly braid: WebBraidHost;

  constructor(args?: Partial<CacheOptions> & { braid?: WebBraidHost }) {
    this.braid = args?.braid ?? new WebBraidHost();
    this.cache =
      args?.fileSystem && args.root && args.workspaceKey
        ? {
            fileSystem: args.fileSystem,
            root: args.root,
            workspaceKey: args.workspaceKey,
          }
        : undefined;
  }

  private readonly cache?: {
    fileSystem: FileSystem;
    root: string;
    workspaceKey: string;
  };

  seed(books: ResidentBraidBook[], config?: SousConfig): GalleyMutationEffect {
    const next = withTarget(this.braid.seed(books).projection);
    if (this.galley === null) {
      this.galley = new Galley(
        config ? { target: next.target, config } : { target: next.target },
      );
      this.projection = next;
      this.installBaselines(books);
      return "changed";
    }
    const effect = this.galley.replaceCorpus(next.target);
    if (config) this.galley.updateConfig(config);
    this.projection = next;
    this.installBaselines(books);
    return effect;
  }

  setBraidBaseline(
    bookCode: string,
    tokens: Token[],
    lineEnding: "lf" | "crlf",
  ): void {
    this.braid.setBaseline(bookCode, tokens, lineEnding);
  }

  clearBraidBaseline(bookCode: string): void {
    this.braid.clearBaseline(bookCode);
  }

  isBraidDirty(bookCode: string): boolean {
    return this.braid.isDirty(bookCode);
  }

  braidUsfm(bookCode: string): string {
    return this.braid.toUsfm(bookCode);
  }

  publishBraid(): WebBraidPublication {
    return this.braid.publish();
  }

  restoreBraid(
    packed: ArrayBuffer,
    records: Array<{ bookCode: string; sourceKey: string; source: string }>,
  ): { accepted: boolean; error?: string } {
    return this.braid.restorePublishedCorpus(packed, records);
  }

  formatBraid(
    scope: CorpusScope,
    options: FormatOptions = { insertStructuralLinebreaks: false },
  ): { books: Record<string, Token[]>; usfm: Record<string, string> } {
    const formatted = this.braid.format(scope, options);
    for (const bookCode of Object.keys(formatted.books)) {
      const next = withTarget(
        this.braid.projection({ kind: "book", book: bookCode }),
      );
      this.replaceBookProjection(bookCode, next);
      this.requireGalley().updateBook({
        slug: bookCode,
        keys: next.keys,
        texts: next.texts,
      });
    }
    return formatted;
  }

  applyBraidFix(
    bookCode: string,
    fix: TokenFix,
  ): { books: Record<string, Token[]>; usfm: Record<string, string> } {
    const normalizedBook = bookCode.toUpperCase();
    const result = this.braid.applyFix(normalizedBook, fix);
    if (!result.books[normalizedBook]) return result;
    const projection = withTarget(
      this.braid.projection({ kind: "book", book: normalizedBook }),
    );
    this.replaceBookProjection(normalizedBook, projection);
    this.requireGalley().updateBook({
      slug: normalizedBook,
      keys: projection.keys,
      texts: projection.texts,
    });
    return result;
  }

  updateChapter(
    bookCode: string,
    chapterNum: number,
    tokens: Token[],
  ): GalleyMutationEffect {
    const galley = this.requireGalley();
    const mutation = this.braid.updateChapter(bookCode, chapterNum, tokens);
    if (mutation.effect === "unchanged" || !mutation.projection)
      return "unchanged";
    const next = withTarget(mutation.projection);
    const block: ChapterUpdateIn = {
      slug: bookCode.toUpperCase(),
      chapter: String(chapterNum),
      keys: next.keys,
      texts: next.texts,
    };
    const label = `sous:galley.updateChapter:${bookCode}:${chapterNum}`;
    if (import.meta.env.DEV) console.time(label);
    try {
      try {
        const effect = galley.updateChapter(block);
        if (effect === "changed")
          this.replaceChapterProjection(bookCode, chapterNum, next);
        return effect;
      } catch {
        // A chapter address can become ambiguous after a structural edit. The
        // resident Braid already owns the authoritative book, so widen only
        // the Galley projection here; callers do not keep a second token book.
        const bookProjection = withTarget(
          this.braid.projection({
            kind: "book",
            book: bookCode.toUpperCase(),
          }),
        );
        const effect = galley.updateBook({
          slug: bookCode.toUpperCase(),
          keys: bookProjection.keys,
          texts: bookProjection.texts,
        });
        if (effect === "changed")
          this.replaceBookProjection(bookCode, bookProjection);
        return effect;
      }
    } finally {
      if (import.meta.env.DEV) console.timeEnd(label);
    }
  }

  updateBook(
    bookCode: string,
    tokens: Token[],
    lineEnding: "lf" | "crlf" = "lf",
  ): GalleyMutationEffect {
    const galley = this.requireGalley();
    const mutation = this.braid.updateBook(bookCode, tokens, lineEnding);
    if (mutation.effect === "unchanged" || !mutation.projection)
      return "unchanged";
    const next = withTarget(mutation.projection);
    const block: BookUpdateIn = {
      slug: bookCode.toUpperCase(),
      keys: next.keys,
      texts: next.texts,
    };
    const label = `sous:galley.updateBook:${bookCode}`;
    if (import.meta.env.DEV) console.time(label);
    try {
      const effect = galley.updateBook(block);
      if (effect === "changed") this.replaceBookProjection(bookCode, next);
      return effect;
    } finally {
      if (import.meta.env.DEV) console.timeEnd(label);
    }
  }

  removeChapter(bookCode: string, chapterNum: number): GalleyMutationEffect {
    const galley = this.requireGalley();
    const mutation = this.braid.removeChapter(bookCode, chapterNum);
    if (mutation.effect === "unchanged") return "unchanged";
    const next = mutation.projection ? withTarget(mutation.projection) : null;
    if (!next || next.keys.length === 0) {
      const effect =
        galley.removeBooks([bookCode.toUpperCase()]) > 0
          ? "changed"
          : "unchanged";
      if (effect === "changed") this.removeBookProjection(bookCode);
      return effect;
    }
    const effect = galley.updateBook({
      slug: bookCode.toUpperCase(),
      keys: next.keys,
      texts: next.texts,
    });
    if (effect === "changed") this.replaceBookProjection(bookCode, next);
    return effect;
  }

  removeBook(bookCode: string): GalleyMutationEffect {
    const galley = this.requireGalley();
    this.braid.removeBook(bookCode);
    const effect =
      galley.removeBooks([bookCode.toUpperCase()]) > 0
        ? "changed"
        : "unchanged";
    if (effect === "changed") this.removeBookProjection(bookCode);
    return effect;
  }

  updateConfig(config: SousConfig): GalleyMutationEffect {
    return this.requireGalley().updateConfig(config);
  }

  async analyzePacked(
    config?: SousConfig,
    cachePolicy: GalleyCachePolicy = "none",
  ): Promise<GalleyAnalysis> {
    const endTimer = devTimer("web:galleyAnalyze workspace");
    const projection = this.projection;
    if (!projection || projection.keys.length === 0) {
      endTimer();
      return {
        packed: new ArrayBuffer(0),
        keys: [],
        segments: {},
        cacheState: "fresh",
      };
    }
    if (config) this.requireGalley().updateConfig(config);

    const analyzeLabel = "sous:galley.analyze";
    if (import.meta.env.DEV) console.time(analyzeLabel);
    let bytes: Uint8Array;
    try {
      bytes = this.requireGalley().analyze();
    } finally {
      if (import.meta.env.DEV) console.timeEnd(analyzeLabel);
    }
    const packed = new Uint8Array(bytes).slice().buffer;
    if (cachePolicy !== "none") {
      try {
        await this.writeCache(bytes, cachePolicy);
      } catch (error: unknown) {
        // Findings are still valid when the optional app cache is unavailable.
        console.error("[mirror] Galley cache write failed", { error });
      }
    }
    endTimer();
    return {
      packed,
      keys: projection.keys,
      segments: projection.segments,
      cacheState: "fresh",
    };
  }

  async loadCachedPacked(config?: SousConfig): Promise<GalleyAnalysis | null> {
    if (!this.cache || !this.projection || this.projection.keys.length === 0)
      return null;
    if (config) this.requireGalley().updateConfig(config);
    try {
      const cacheLabel = "sous:galley.cacheRead";
      if (import.meta.env.DEV) console.time(cacheLabel);
      const bytes = await this.cache.fileSystem.readBytes(this.cachePath());
      if (import.meta.env.DEV) console.timeEnd(cacheLabel);
      return {
        packed: new Uint8Array(bytes).slice().buffer,
        keys: this.projection.keys,
        segments: this.projection.segments,
        cacheState: "persisted",
        expectedIdentity: this.expectedIdentity(),
      };
    } catch {
      if (import.meta.env.DEV) console.timeEnd("sous:galley.cacheRead");
      return null;
    }
  }

  private requireGalley(): Galley {
    if (!this.galley)
      throw new Error("Galley must be seeded before mutation or analysis");
    return this.galley;
  }

  private installBaselines(books: ResidentBraidBook[]): void {
    for (const book of books) {
      this.setBraidBaseline(
        book.bookCode,
        book.baselineTokens,
        book.lineEnding,
      );
    }
  }

  private replaceChapterProjection(
    bookCode: string,
    chapterNum: number,
    next: Projection,
  ): void {
    const projection = this.projection;
    if (!projection) return;
    const prefix = `${bookCode.toUpperCase()} ${chapterNum}:`;
    const oldIndices = projection.keys
      .map((sid, index) => ({ sid, index }))
      .filter(({ sid }) => sid.startsWith(prefix));
    const oldChapter = new Set(oldIndices.map(({ sid }) => sid));
    const keep = projection.keys
      .map((sid, index) => ({ sid, text: projection.texts[index] }))
      .filter(({ sid }) => !oldChapter.has(sid));
    const firstOldIndex = oldIndices[0]?.index;
    const insertAt =
      firstOldIndex === undefined
        ? keep.length
        : projection.keys
            .slice(0, firstOldIndex)
            .filter((sid) => !oldChapter.has(sid)).length;
    keep.splice(
      insertAt,
      0,
      ...next.keys.map((sid, index) => ({ sid, text: next.texts[index] })),
    );
    const segments = { ...projection.segments };
    for (const sid of oldChapter) delete segments[sid];
    Object.assign(segments, next.segments);
    this.projection = withTarget({
      keys: keep.map(({ sid }) => sid),
      texts: keep.map(({ text }) => text),
      segments,
    });
  }

  private replaceBookProjection(bookCode: string, next: Projection): void {
    const projection = this.projection;
    if (!projection) return;
    const prefix = `${bookCode.toUpperCase()} `;
    const oldIndices = projection.keys
      .map((sid, index) => ({ sid, index }))
      .filter(({ sid }) => sid.startsWith(prefix));
    const oldBook = new Set(oldIndices.map(({ sid }) => sid));
    const keep = projection.keys
      .map((sid, index) => ({ sid, text: projection.texts[index] }))
      .filter(({ sid }) => !oldBook.has(sid));
    const firstOldIndex = oldIndices[0]?.index;
    const insertAt =
      firstOldIndex === undefined
        ? keep.length
        : projection.keys
            .slice(0, firstOldIndex)
            .filter((sid) => !oldBook.has(sid)).length;
    keep.splice(
      insertAt,
      0,
      ...next.keys.map((sid, index) => ({ sid, text: next.texts[index] })),
    );
    const segments = { ...projection.segments };
    for (const sid of oldBook) delete segments[sid];
    Object.assign(segments, next.segments);
    this.projection = withTarget({
      keys: keep.map(({ sid }) => sid),
      texts: keep.map(({ text }) => text),
      segments,
    });
  }

  private removeBookProjection(bookCode: string): void {
    const projection = this.projection;
    if (!projection) return;
    const prefix = `${bookCode.toUpperCase()} `;
    const keep = projection.keys
      .map((sid, index) => ({ sid, index }))
      .filter(({ sid }) => !sid.startsWith(prefix));
    this.projection = withTarget({
      keys: keep.map(({ sid }) => sid),
      texts: keep.map(({ index }) => projection.texts[index]),
      segments: Object.fromEntries(
        keep.flatMap(({ sid }) => {
          const segment = projection.segments[sid];
          return segment ? [[sid, segment] as const] : [];
        }),
      ),
    });
  }

  private expectedIdentity(): GalleyCacheIdentity {
    const galley = this.requireGalley();
    return {
      analysisId: galley.expectedAnalysisId().toString(),
      targetContextId: galley.expectedTargetContextId().toString(),
      hasReference: galley.hasReference(),
    };
  }

  private cachePath(): string {
    const key = encodeURIComponent(this.cache?.workspaceKey ?? "workspace");
    return `${this.cache?.root}/sous-chef-findings/${key}/corpus.bin`;
  }

  private async writeCache(
    bytes: Uint8Array,
    cachePolicy: GalleyCachePolicy,
  ): Promise<void> {
    if (!this.cache) return;
    const path = this.cachePath();
    if (cachePolicy === "restore") {
      const restoreCheckLabel = "sous:galley.cacheRestoreCheck";
      if (import.meta.env.DEV) console.time(restoreCheckLabel);
      try {
        if (await this.cache.fileSystem.exists(path)) return;
      } finally {
        if (import.meta.env.DEV) console.timeEnd(restoreCheckLabel);
      }
    }
    const cacheWriteLabel = "sous:galley.cacheWrite";
    if (import.meta.env.DEV) console.time(cacheWriteLabel);
    try {
      await this.cache.fileSystem.mkdir(path.slice(0, path.lastIndexOf("/")), {
        recursive: true,
      });
      await this.cache.fileSystem.atomicWriteBytes(path, bytes);
    } finally {
      if (import.meta.env.DEV) console.timeEnd(cacheWriteLabel);
    }
  }

  dispose(): void {
    this.galley?.free();
    this.braid.dispose();
    this.galley = null;
    this.projection = null;
  }
}

function withTarget(projection: BraidProjection): Projection {
  return {
    ...projection,
    target: { keys: projection.keys, texts: projection.texts },
  };
}
