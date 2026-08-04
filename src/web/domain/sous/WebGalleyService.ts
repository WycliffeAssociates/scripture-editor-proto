import { Galley } from "scripture-sous-chef-web";
import type {
  BookUpdateIn,
  ChapterUpdateIn,
  SousConfig,
  VrefCorpus,
} from "scripture-sous-chef-web";

import type { GalleyCachePolicy } from "@/app/domain/mirror/mirrorProtocol.ts";
import type { PhaseRecorder } from "@/app/domain/mirror/traceLog.ts";
import type {
  GalleyAnalysis,
  GalleyCacheIdentity,
  GalleyMutationEffect,
} from "@/core/domain/sous/galleyTypes.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { BraidProjection } from "@/web/domain/braid/WebBraidHost.ts";

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
  /** Set by host load so Braid and Galley cache IO can overlap. */
  private prefetchedCache: ArrayBuffer | null | undefined;

  constructor(args?: Partial<CacheOptions>) {
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

  seed(projection: BraidProjection, config?: SousConfig): GalleyMutationEffect {
    const next = withTarget(projection);
    if (this.galley === null) {
      this.galley = new Galley(
        config ? { target: next.target, config } : { target: next.target },
      );
      this.projection = next;
      return "changed";
    }
    const effect = this.galley.replaceCorpus(next.target);
    if (config) this.galley.updateConfig(config);
    this.projection = next;
    return effect;
  }

  updateChapter(
    bookCode: string,
    chapterNum: number,
    projection: BraidProjection,
    /**
     * Widening path only, and a thunk deliberately: the ambiguous-chapter case
     * is rare, while projecting a whole book out of wasm as JS objects is not
     * cheap. Computing it eagerly meant every keystroke paid for a fallback it
     * almost never used.
     */
    fallbackBookProjection: () => BraidProjection | null,
  ): GalleyMutationEffect {
    const galley = this.requireGalley();
    const next = withTarget(projection);
    const block: ChapterUpdateIn = {
      slug: bookCode.toUpperCase(),
      chapter: String(chapterNum),
      keys: next.keys,
      texts: next.texts,
    };
    try {
      const effect = galley.updateChapter(block);
      if (effect === "changed")
        this.replaceChapterProjection(bookCode, chapterNum, next);
      return effect;
    } catch {
      // A chapter address can become ambiguous after a structural edit. The
      // resident Braid already owns the authoritative book, so widen only
      // the Galley projection here; callers do not keep a second token book.
      const fallback = fallbackBookProjection();
      if (!fallback) throw new Error("Missing book projection");
      const bookProjection = withTarget(fallback);
      const effect = galley.updateBook({
        slug: bookCode.toUpperCase(),
        keys: bookProjection.keys,
        texts: bookProjection.texts,
      });
      if (effect === "changed")
        this.replaceBookProjection(bookCode, bookProjection);
      return effect;
    }
  }

  updateBook(
    bookCode: string,
    projection: BraidProjection,
  ): GalleyMutationEffect {
    const galley = this.requireGalley();
    const next = withTarget(projection);
    const block: BookUpdateIn = {
      slug: bookCode.toUpperCase(),
      keys: next.keys,
      texts: next.texts,
    };
    const effect = galley.updateBook(block);
    if (effect === "changed") this.replaceBookProjection(bookCode, next);
    return effect;
  }

  removeChapter(
    bookCode: string,
    nextProjection: BraidProjection | null,
  ): GalleyMutationEffect {
    const galley = this.requireGalley();
    const next = nextProjection ? withTarget(nextProjection) : null;
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
    phases?: PhaseRecorder,
  ): Promise<GalleyAnalysis> {
    const projection = this.projection;
    if (!projection || projection.keys.length === 0) {
      return {
        packed: new ArrayBuffer(0),
        keys: [],
        segments: {},
        cacheState: "fresh",
      };
    }
    if (config) this.requireGalley().updateConfig(config);

    const run = () => this.requireGalley().analyze();
    const bytes = phases
      ? phases.timeSync("worker:galley:analyze", run, (value) => ({
          verses: projection.keys.length,
          bytes: value.byteLength,
        }))
      : run();
    const packed = new Uint8Array(bytes).slice().buffer;
    if (cachePolicy !== "none") {
      // The live finding result is ready now. Cache persistence is a warm-up
      // side effect and must never hold the initial-result gate or reject a
      // valid analysis when OPFS is unavailable.
      void this.writeCache(bytes, cachePolicy).catch((error: unknown) => {
        console.error("[worker:sous] Galley cache write failed", { error });
      });
    }
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
    const prefetched = this.prefetchedCache;
    this.prefetchedCache = undefined;
    try {
      const bytes =
        prefetched === undefined
          ? await this.readCacheBytes()
          : prefetched === null
            ? null
            : new Uint8Array(prefetched);
      if (!bytes) return null;
      return {
        packed: new Uint8Array(bytes).slice().buffer,
        keys: this.projection.keys,
        segments: this.projection.segments,
        cacheState: "persisted",
        expectedIdentity: this.expectedIdentity(),
      };
    } catch {
      console.info("worker:sous:galley:cache", {
        workspace: this.cache.workspaceKey,
        state: "miss",
      });
      return null;
    }
  }

  async prefetchCache(): Promise<void> {
    if (!this.cache) return;
    try {
      const bytes = await this.readCacheBytes();
      this.prefetchedCache = bytes ? bytes.slice().buffer : null;
    } catch {
      this.prefetchedCache = null;
    }
  }

  private requireGalley(): Galley {
    if (!this.galley)
      throw new Error("Galley must be seeded before mutation or analysis");
    return this.galley;
  }

  private async readCacheBytes(): Promise<Uint8Array | null> {
    if (!this.cache) return null;
    const cacheLabel = "worker:sous:galley:cache-read";
    if (import.meta.env.DEV) console.time(cacheLabel);
    try {
      const bytes = await this.cache.fileSystem.readBytes(this.cachePath());
      console.info("worker:sous:galley:cache", {
        workspace: this.cache.workspaceKey,
        state: "hit",
        bytes: bytes.byteLength,
      });
      return new Uint8Array(bytes);
    } catch {
      console.info("worker:sous:galley:cache", {
        workspace: this.cache.workspaceKey,
        state: "miss",
      });
      return null;
    } finally {
      if (import.meta.env.DEV) console.timeEnd(cacheLabel);
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
      const restoreCheckLabel = "worker:sous:galley:cache-restore-check";
      if (import.meta.env.DEV) console.time(restoreCheckLabel);
      try {
        if (await this.cache.fileSystem.exists(path)) return;
      } finally {
        if (import.meta.env.DEV) console.timeEnd(restoreCheckLabel);
      }
    }
    const cacheWriteLabel = "worker:sous:galley:cache-write";
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
