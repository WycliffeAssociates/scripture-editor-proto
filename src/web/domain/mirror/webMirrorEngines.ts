// webMirrorEngines.ts
//
// The web resident host: the two arms composed behind one command surface.
// Braid (`@/web/domain/braid`) owns the token corpus; Galley
// (`@/web/domain/sous`) owns its projection and cache. The worker is only a
// transport shell around this object.

import type { Token } from "usfm-onion-web";

import {
  putBraidWarmCache,
  readBraidWarmCache,
} from "@/app/domain/mirror/braidWarmCache.ts";
import type {
  ApplyBraidFixResult,
  FormatBraidResult,
  Generation,
  GalleyResult,
  HostCommand,
  LoadedProjectBook,
  LoadedProjectGalley,
  LoadProjectResult,
  MirrorCommand,
  MirrorPatch,
  MirrorResult,
} from "@/app/domain/mirror/mirrorProtocol.ts";
import { retryBackupWrite } from "@/app/domain/mirror/retryBackupWrite.ts";
import {
  createPhaseRecorder,
  type PhaseRecorder,
} from "@/app/domain/mirror/traceLog.ts";
import type { DirtyBufferFile } from "@/app/state/DirtyBufferStore.ts";
import {
  DIRTY_BUFFER_SCHEMA_VERSION,
  DirtyBufferStore,
} from "@/app/state/DirtyBufferStore.ts";
import { webMd5Service } from "@/core/domain/md5/webMd5.ts";
import type { GalleyAnalysis } from "@/core/domain/sous/galleyTypes.ts";
import { WebBraidHost } from "@/web/domain/braid/WebBraidHost.ts";
import { WebGalleyService } from "@/web/domain/sous/WebGalleyService.ts";
import { OpfsFileSystem } from "@/web/persistence/OpfsFileSystem.ts";
import { OpfsStorageRoots } from "@/web/persistence/OpfsStorageRoots.ts";

type ResidentBraidBook = {
  bookCode: string;
  tokens: Token[];
  baselineTokens: Token[];
  lineEnding: "lf" | "crlf";
};

/** Everything one load hands back; the worker only stamps transport fields. */
export type LoadedProject = Required<
  Pick<LoadProjectResult, "packed" | "sources" | "books" | "hostPhases">
> & {
  state: "warm" | "cold";
  galley?: LoadedProjectGalley;
};

export type WebMirrorEngines = {
  applyPatch(patch: MirrorPatch): void;
  runCommand(
    command: MirrorCommand,
    phases?: PhaseRecorder,
  ): Promise<MirrorResult>;
  loadProject(
    command: Extract<HostCommand, { kind: "loadProject" }>,
  ): Promise<LoadedProject>;
  dispose(): void;
};

type HostOptions = {
  workspaceKey: string;
  dirtyBufferRoot: string;
  backgroundResult?: (result: MirrorResult) => void;
};

export function makeWebMirrorEngines(args: HostOptions): WebMirrorEngines {
  const roots = new OpfsStorageRoots();
  const fileSystem = new OpfsFileSystem(roots);
  const braid = new WebBraidHost();
  const galley = new WebGalleyService({
    fileSystem,
    root: roots.cacheRoot,
    workspaceKey: args.workspaceKey,
  });
  const dirtyBufferStore = new DirtyBufferStore(
    fileSystem,
    webMd5Service,
    args.dirtyBufferRoot,
  );
  let latestGeneration = -1;
  let galleySeeded = false;
  let galleyDirty = false;
  let lastGalley: GalleyAnalysis | null = null;

  const rememberGalley = (analysis: GalleyAnalysis): void => {
    lastGalley = {
      ...analysis,
      packed: analysis.packed.slice(0),
      keys: [...analysis.keys],
      segments: analysis.segments,
    };
  };

  const applyPatch = (patch: MirrorPatch): void => {
    latestGeneration = Math.max(latestGeneration, patch.generation);
    switch (patch.kind) {
      case "fullSync": {
        const books: ResidentBraidBook[] = patch.books.map((book) => ({
          bookCode: book.bookCode,
          tokens: book.chapters.flatMap(({ chapter }) => chapter.tokens),
          baselineTokens: book.baselineTokens,
          lineEnding: book.chapters[0]?.chapter.eol === "\r\n" ? "crlf" : "lf",
        }));
        braid.seed(books);
        galley.seed(braid.projection({ kind: "all" }));
        galleySeeded = true;
        galleyDirty = true;
        lastGalley = null;
        return;
      }
      case "residentSeed":
        if (!galleySeeded) {
          galley.seed(braid.projection({ kind: "all" }));
          galleySeeded = true;
        }
        galleyDirty = true;
        lastGalley = null;
        return;
      case "syncMeta":
        for (const book of patch.books) {
          braid.setBaseline(
            book.bookCode,
            book.baselineTokens,
            braid.lineEnding(book.bookCode),
          );
        }
        return;
      case "pushBaseline":
        braid.setBaseline(
          patch.bookCode,
          patch.baselineTokens,
          braid.lineEnding(patch.bookCode),
        );
        return;
      case "pushChapter": {
        const mutation = braid.updateChapter(
          patch.ref.bookCode,
          patch.ref.chapterNum,
          patch.chapter.tokens,
        );
        if (mutation.effect === "changed" && mutation.projection) {
          galleyDirty =
            galley.updateChapter(
              patch.ref.bookCode,
              patch.ref.chapterNum,
              mutation.projection,
              () =>
                braid.projection({ kind: "book", book: patch.ref.bookCode }),
            ) === "changed" || galleyDirty;
        }
        return;
      }
      case "deleteChapter": {
        const mutation = braid.removeChapter(
          patch.ref.bookCode,
          patch.ref.chapterNum,
        );
        if (mutation.effect === "changed") {
          galleyDirty =
            galley.removeChapter(patch.ref.bookCode, mutation.projection) ===
              "changed" || galleyDirty;
        }
        return;
      }
      case "updateBook": {
        const book = patch.book;
        const mutation = braid.updateBook(
          book.bookCode,
          book.chapters.flatMap(({ chapter }) => chapter.tokens),
          book.chapters[0]?.chapter.eol === "\r\n" ? "crlf" : "lf",
        );
        braid.setBaseline(
          book.bookCode,
          book.baselineTokens,
          book.chapters[0]?.chapter.eol === "\r\n" ? "crlf" : "lf",
        );
        if (mutation.effect === "changed" && mutation.projection) {
          galleyDirty =
            galley.updateBook(book.bookCode, mutation.projection) ===
              "changed" || galleyDirty;
        }
        return;
      }
      case "removeBook":
        braid.removeBook(patch.bookCode);
        galleyDirty =
          galley.removeBook(patch.bookCode) === "changed" || galleyDirty;
        return;
    }
  };

  const behind = (generation: Generation): boolean =>
    generation > latestGeneration;

  async function runCommand(
    command: MirrorCommand,
    phases?: PhaseRecorder,
  ): Promise<MirrorResult> {
    switch (command.kind) {
      case "analyzeLint": {
        const snapshot = phases
          ? phases.timeSync(
              "worker:braid:lint",
              () => braid.lintFindings(),
              (value) => ({
                books: value.books.length,
                findings: value.summary.totalCount,
              }),
            )
          : braid.lintFindings();
        return {
          kind: "lintResult",
          snapshot,
          ranAtGeneration: command.generation,
          requestId: command.requestId,
        };
      }
      case "analyzeGalley":
        return runGalley(command, phases);
      case "formatBraid":
        return resultOrBehind(
          command,
          behind(command.generation),
          () => braid.format(command.scope, command.options),
          (value) => ({ kind: "formatBraidResult", ...value }),
        );
      case "applyBraidFix":
        return resultOrBehind(
          command,
          behind(command.generation),
          () => braid.applyFix(command.bookCode, command.fix),
          (value) => ({ kind: "applyBraidFixResult", ...value }),
        );
      case "publishBraid": {
        if (behind(command.generation)) {
          return {
            kind: "publishBraidResult",
            requestId: command.requestId,
            ranAtGeneration: command.generation,
            behind: true,
            superseded: false,
          };
        }
        const publication = braid.publish();
        return {
          kind: "publishBraidResult",
          requestId: command.requestId,
          publication,
          ranAtGeneration: command.generation,
          behind: false,
          superseded: false,
        };
      }
      case "writeBackup":
        return writeBackup(command);
      case "clearBackup":
        await clearBackup(command.bookCode);
        return {
          kind: "backupResult",
          bookCode: command.bookCode,
          cleared: true,
          ranAtGeneration: command.generation,
        };
    }
  }

  async function runGalley(
    command: Extract<MirrorCommand, { kind: "analyzeGalley" }>,
    phases?: PhaseRecorder,
  ): Promise<GalleyResult> {
    if (!galleySeeded) throw new Error("Galley must be seeded before analysis");
    if (!galleyDirty && command.cachePolicy === "none" && lastGalley) {
      return {
        kind: "galleyResult",
        ...cloneGalley(lastGalley),
        cacheState: "fresh",
        ranAtGeneration: command.generation,
        requestId: command.requestId,
      };
    }
    const cached =
      command.cachePolicy === "restore"
        ? await galley.loadCachedPacked(command.config)
        : null;
    if (cached) {
      setTimeout(() => {
        void galley
          .analyzePacked(command.config, command.cachePolicy)
          .then((fresh) => {
            galleyDirty = false;
            rememberGalley(fresh);
            args.backgroundResult?.({
              kind: "galleyResult",
              ...fresh,
              cacheState: "fresh",
              ranAtGeneration: command.generation,
            });
          })
          .catch((error: unknown) =>
            console.error("[worker:sous] background Galley refresh failed", {
              error,
            }),
          );
      }, 0);
      return {
        kind: "galleyResult",
        ...cached,
        cacheState: "persisted",
        ranAtGeneration: command.generation,
        requestId: command.requestId,
      };
    }
    const fresh = await galley.analyzePacked(
      command.config,
      command.cachePolicy,
      phases,
    );
    galleyDirty = false;
    rememberGalley(fresh);
    return {
      kind: "galleyResult",
      ...fresh,
      cacheState: "fresh",
      ranAtGeneration: command.generation,
      requestId: command.requestId,
    };
  }

  async function writeBackup(
    command: Extract<MirrorCommand, { kind: "writeBackup" }>,
  ): Promise<MirrorResult> {
    if (!braid.isDirty(command.bookCode))
      return clearBackup(command.bookCode).then(() => ({
        kind: "backupResult",
        bookCode: command.bookCode,
        cleared: true,
        ranAtGeneration: command.generation,
      }));
    const content = braid.toUsfm(command.bookCode);
    const entry: DirtyBufferFile = {
      schemaVersion: DIRTY_BUFFER_SCHEMA_VERSION,
      diskBaseline: command.diskBaseline ?? { kind: "absent" },
      bodyMd5: await webMd5Service.calculateMd5(content),
      writtenAt: Date.now(),
      appVersion: command.appVersion,
      content,
    };
    try {
      await retryBackupWrite(() =>
        dirtyBufferStore.put(args.workspaceKey, command.bookCode, entry),
      );
    } catch (error) {
      console.error("[worker:braid] backup write failed after retries", {
        bookCode: command.bookCode,
        error,
      });
    }
    return {
      kind: "backupResult",
      bookCode: command.bookCode,
      ranAtGeneration: command.generation,
    };
  }

  async function clearBackup(bookCode: string): Promise<void> {
    try {
      await retryBackupWrite(() =>
        dirtyBufferStore.clear(args.workspaceKey, bookCode),
      );
    } catch (error) {
      console.error("[worker:braid] backup clear failed after retries", {
        bookCode,
        error,
      });
    }
  }

  /**
   * Restore BOTH resident arms in one pass and hand main the bytes it needs to
   * materialize them. Braid comes from its sidecar when Braid itself accepts it
   * against the exact disk bytes, otherwise from a cold parse that republishes
   * and atomically replaces the sidecar. Galley is seeded off the same resident
   * projection and answered from its own cache or a fresh pass. Nothing here
   * runs a second analysis afterwards — this IS the initial analysis.
   */
  async function loadProject(
    command: Extract<HostCommand, { kind: "loadProject" }>,
  ): Promise<LoadedProject> {
    const phases = createPhaseRecorder();
    const workspaceKey = command.workspaceKey;
    const [sidecar, diskBooks] = await Promise.all([
      phases.time(
        "worker:braid:cache-read",
        () =>
          readBraidWarmCache({
            fileSystem,
            cacheRoot: roots.cacheRoot,
            workspaceKey,
          }),
        (value) => ({
          state: value ? "hit" : "miss",
          bytes: value?.byteLength,
        }),
      ),
      phases.time(
        "worker:braid:read-sources",
        () =>
          Promise.all(
            command.books.map(async (book) => ({
              bookCode: book.bookCode,
              sourceKey: book.sourceKey,
              bytes: await fileSystem.readBytes(book.path),
            })),
          ),
        (value) => ({
          books: value.length,
          bytes: value.reduce(
            (total, book) => total + book.bytes.byteLength,
            0,
          ),
        }),
      ),
    ]);

    // One buffer holding every book's exact bytes, addressed by offset. Main
    // needs those bytes to certify the packed container, and one owned buffer
    // is one transfer instead of a clone per book.
    const corpus = await phases.time("worker:braid:hash-sources", async () => {
      let byteOffset = 0;
      const decoded = diskBooks.map((book) => {
        const entry = {
          ...book,
          source: decoder.decode(book.bytes),
          byteOffset,
        };
        byteOffset += book.bytes.byteLength;
        return entry;
      });
      const sources = new Uint8Array(byteOffset);
      for (const book of decoded) sources.set(book.bytes, book.byteOffset);
      const digests = await Promise.all(
        decoded.map((book) => webMd5Service.calculateMd5(book.source)),
      );
      const catalog: LoadedProjectBook[] = decoded.map((book, index) => ({
        bookCode: book.bookCode,
        sourceKey: book.sourceKey,
        byteOffset: book.byteOffset,
        byteLength: book.bytes.byteLength,
        sourceMd5: digests[index] ?? "",
      }));
      return { decoded, sources, catalog };
    });

    const restoreRecords = corpus.decoded.map((book) => ({
      bookCode: book.bookCode,
      sourceKey: book.sourceKey,
      source: corpus.sources.subarray(
        book.byteOffset,
        book.byteOffset + book.bytes.byteLength,
      ),
    }));
    const warm =
      sidecar === null
        ? null
        : phases.timeSync(
            "worker:braid:restore",
            () =>
              braid.restorePublishedCorpus(sidecar, restoreRecords).accepted
                ? detach(sidecar)
                : null,
            (value) => ({ state: value ? "accepted" : "rejected" }),
          );
    if (warm) {
      phases.timeSync("worker:braid:restore-baseline", () =>
        braid.adoptRestoredBaseline(restoreRecords),
      );
    }

    let packed: ArrayBuffer;
    let state: "warm" | "cold";
    if (warm) {
      packed = warm;
      state = "warm";
    } else {
      state = "cold";
      phases.timeSync("worker:braid:cold-seed", () =>
        braid.loadSources(corpus.decoded),
      );
      const publication = phases.timeSync(
        "worker:braid:publish",
        () => braid.publishPacked(),
        (value) => ({ bytes: value.packed.byteLength }),
      );
      packed = publication.packed;
      // Copy before the result's buffer is transferred to main; the sidecar
      // write is best-effort and outlives this load, so it reports itself
      // (`[startup:cache-write]`) rather than riding home as a phase.
      const forCache = new Uint8Array(packed.slice(0));
      phases.record("worker:braid:cache-write", {
        state: "queued",
        bytes: forCache.byteLength,
      });
      void putBraidWarmCache({
        fileSystem,
        cacheRoot: roots.cacheRoot,
        workspaceKey,
        packed: forCache,
        origin: "load",
      });
    }

    const galleyResult = command.analysisDisabled
      ? undefined
      : await loadGalley(command, phases);

    return {
      state,
      packed,
      sources: corpus.sources.buffer as ArrayBuffer,
      books: corpus.catalog,
      galley: galleyResult,
      hostPhases: phases.phases,
    };
  }

  /**
   * Galley's half of the load. A served cache is the fast first paint; the
   * fresh pass that supersedes it runs in the background and arrives through
   * the ordinary result path, exactly as a live analysis would.
   */
  async function loadGalley(
    command: Extract<HostCommand, { kind: "loadProject" }>,
    phases: PhaseRecorder,
  ): Promise<LoadedProjectGalley> {
    phases.timeSync("worker:galley:seed", () => {
      galley.seed(braid.projection({ kind: "all" }), command.config);
      galleySeeded = true;
      galleyDirty = false;
    });
    const cached = await phases.time(
      "worker:galley:cache-read",
      () => galley.loadCachedPacked(command.config),
      (value) => ({ state: value ? "hit" : "miss" }),
    );
    if (cached) {
      galleyDirty = true;
      setTimeout(() => {
        void galley
          .analyzePacked(command.config, "refresh")
          .then((fresh) => {
            galleyDirty = false;
            rememberGalley(fresh);
            args.backgroundResult?.({
              kind: "galleyResult",
              ...fresh,
              cacheState: "fresh",
              ranAtGeneration: command.generation,
            });
          })
          .catch((error: unknown) =>
            console.error("[worker:sous] background Galley refresh failed", {
              error,
            }),
          );
      }, 0);
      return { ...cached, cacheState: "persisted" };
    }
    const fresh = await phases.time(
      "worker:galley:analyze",
      () => galley.analyzePacked(command.config, "refresh"),
      (value) => ({ bytes: value.packed.byteLength }),
    );
    galleyDirty = false;
    rememberGalley(fresh);
    return { ...fresh, cacheState: "fresh" };
  }

  return {
    applyPatch,
    runCommand,
    loadProject,
    dispose() {
      galley.dispose();
      braid.dispose();
    },
  };
}

const decoder = new TextDecoder();

/** The view's bytes as a standalone buffer this result can hand over. */
function detach(view: Uint8Array): ArrayBuffer {
  return view.buffer.slice(
    view.byteOffset,
    view.byteOffset + view.byteLength,
  ) as ArrayBuffer;
}

function cloneGalley(analysis: GalleyAnalysis): GalleyAnalysis {
  return {
    ...analysis,
    packed: analysis.packed.slice(0),
    keys: [...analysis.keys],
    segments: analysis.segments,
  };
}

function resultOrBehind<
  T extends { books: Record<string, Token[]>; usfm: Record<string, string> },
>(
  command: Extract<MirrorCommand, { kind: "formatBraid" | "applyBraidFix" }>,
  isBehind: boolean,
  operation: () => T,
  wrap: (value: T) => {
    kind: "formatBraidResult" | "applyBraidFixResult";
    books: Record<string, Token[]>;
    usfm: Record<string, string>;
  },
): FormatBraidResult | ApplyBraidFixResult {
  const value = isBehind ? { books: {}, usfm: {} } : operation();
  return {
    ...wrap(value as T),
    requestId: command.requestId,
    ranAtGeneration: command.generation,
    behind: isBehind,
    superseded: false,
  } as FormatBraidResult | ApplyBraidFixResult;
}
