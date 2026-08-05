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
  HostRecovery,
  HostRecoveryEntry,
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
  Pick<
    LoadProjectResult,
    "packed" | "sources" | "books" | "recovery" | "hostPhases"
  >
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
    };
  };

  /**
   * Set once a patch has thrown, cleared only by a complete re-seed.
   *
   * A patch that failed did not apply, so the resident corpus no longer holds
   * what main holds — and the watermark alone cannot express that, because the
   * NEXT patch advances it right past the gap. Without this, every read of
   * resident state looks current: `publishBraid` would happily serialize the
   * stale corpus, and a save would write bytes that predate the user's edits.
   * Treating the mirror as behind makes analyze resync and makes save refuse,
   * which is the difference between a loud failure and silent data loss.
   */
  let desynced = false;

  const applyPatch = (patch: MirrorPatch): void => {
    try {
      applyPatchInner(patch);
    } catch (error) {
      desynced = true;
      throw error;
    }
    latestGeneration = Math.max(latestGeneration, patch.generation);
    if (patch.kind === "fullSync") desynced = false;
  };

  const applyPatchInner = (patch: MirrorPatch): void => {
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
    desynced || generation > latestGeneration;

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
    // A book the editor knows about but Braid does not is a residency gap —
    // an atomic corpus mutation that was rejected, say. Report it and leave
    // any existing backup ALONE: with no resident content there is nothing to
    // serialize, and clearing on this path would delete the user's unsaved
    // work precisely when the resident state is the thing that is wrong.
    if (!braid.hasBook(command.bookCode)) {
      console.warn("[worker:braid] no resident book; backup left as-is", {
        bookCode: command.bookCode,
      });
      return {
        kind: "backupResult",
        bookCode: command.bookCode,
        ranAtGeneration: command.generation,
      };
    }
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

    // The catalog IS the extent table Braid restores against — same offsets
    // main later certifies the container with, so the two cannot disagree.
    const warm =
      sidecar === null
        ? null
        : phases.timeSync(
            "worker:braid:restore",
            () =>
              braid.restorePublishedCorpus(
                sidecar,
                corpus.sources,
                corpus.catalog,
              ).accepted
                ? detach(sidecar)
                : null,
            (value) => ({ state: value ? "accepted" : "rejected" }),
          );
    if (warm) {
      phases.timeSync("worker:braid:restore-baseline", () =>
        braid.adoptRestoredBaseline(),
      );
    }

    let packed: ArrayBuffer | null = warm;
    const state: "warm" | "cold" = warm ? "warm" : "cold";
    if (!warm) {
      phases.timeSync("worker:braid:cold-seed", () =>
        braid.loadSources(corpus.decoded),
      );
    }

    // Crash recovery, as a layer over the corpus that was just established:
    // baseline is disk, current becomes the backup. Everything downstream —
    // lint, publish, Galley — then runs ONCE, on the effective content.
    const layered = new Map<string, string>();
    const recovery = await phases.time(
      "worker:braid:recover",
      () => layerBackups(corpus.catalog, corpus.sources, layered),
      (value) => ({
        restored: value.restoredBookCodes.length,
        conflicted: value.conflictedBookCodes.length,
        reported: value.entries.length,
      }),
    );
    // What main certifies the container against has to be what the container is
    // bound to, book for book — see `rebindSources`.
    const boundSources =
      layered.size === 0
        ? corpus.sources
        : rebindSources(corpus.catalog, corpus.sources, layered);

    if (recovery.restoredBookCodes.length > 0 || packed === null) {
      const publication = phases.timeSync(
        "worker:braid:publish",
        () => braid.publishPacked(),
        (value) => ({ bytes: value.packed.byteLength }),
      );
      packed = publication.packed;
      // THE SIDECAR MEANS "THIS IS WHAT IS ON DISK". A recovery open holds
      // unsaved work, so republishing it here would label the user's backup as
      // the saved corpus and the next open would restore it as clean. Same rule
      // Galley follows with `cachePolicy: "none"`. Only a cold open — which by
      // definition just parsed disk and layered nothing — may write.
      if (state === "cold" && recovery.restoredBookCodes.length === 0) {
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
      } else {
        phases.record("worker:braid:cache-write", {
          state: "skipped",
          reason: "recovered",
        });
      }
    }

    const galleyResult = command.analysisDisabled
      ? undefined
      : await loadGalley(command, phases);

    return {
      state,
      packed,
      sources: detach(boundSources),
      books: corpus.catalog,
      recovery,
      galley: galleyResult,
      hostPhases: phases.phases,
    };
  }

  /**
   * Layer every usable crash backup over the resident corpus.
   *
   * Baseline is already disk at this point, so `updateBook` makes current the
   * backup and leaves the comparison intact — which is what lets Braid, rather
   * than a token diff on main, answer both "is this stale residue" and "which
   * chapters did the user actually change".
   *
   * Nothing here throws: a backup that cannot be read, parsed, or matched to a
   * resident book becomes a report entry and the reopen continues. That is the
   * whole point of the report — the work may still be in the named file.
   */
  async function layerBackups(
    catalog: readonly LoadedProjectBook[],
    sources: Uint8Array,
    /** Receives each layered book's backup source — its new bound source. */
    layered: Map<string, string>,
  ): Promise<HostRecovery> {
    const entries: HostRecoveryEntry[] = [];
    const restoredBookCodes: string[] = [];
    const conflictedBookCodes: string[] = [];
    const diskSourceByBook: Record<string, string> = {};
    const resident = new Map(catalog.map((book) => [book.bookCode, book]));

    for (const backup of await dirtyBufferStore.list(args.workspaceKey)) {
      const { bookCode, path, result } = backup;
      if (result.kind === "missing") continue;
      if (result.kind === "unreadable") {
        entries.push({
          kind: "backup-unreadable",
          reason: result.reason,
          message: result.message,
          path: result.path,
        });
        continue;
      }
      const book = resident.get(bookCode);
      // Not in the project at all. Distinct from "we have no baseline for it":
      // a loaded book whose md5 is unknown is still on disk and still restores.
      if (!book) {
        entries.push({
          kind: "manual-recovery",
          subKind:
            result.entry.diskBaseline.kind === "absent"
              ? "new-book-not-supported"
              : "disk-book-missing",
          bookCode,
          path,
        });
        continue;
      }

      const ingested = braid.layerBookFromUsfm(
        bookCode,
        book.sourceKey,
        result.entry.content,
      );
      if (!ingested.accepted) {
        entries.push({
          kind: "usfm-parse-error",
          message: ingested.error ?? "Braid refused the backup",
          path,
          bookCode,
        });
        continue;
      }

      // Residue, decided by the one authority on what "same USFM" means: a
      // save that failed to clear its backup leaves a file equal to disk, and
      // after layering it Braid simply reports the book clean.
      //
      // An unanswerable scope must NOT read as clean — the branch below deletes
      // the backup on the strength of this answer, and that file can be a
      // translator's only copy. Report it and keep both the backup and the
      // layered content.
      let dirtyChapters: number[];
      try {
        dirtyChapters = braid.dirtyChapters(bookCode);
      } catch (error) {
        entries.push({
          kind: "usfm-parse-error",
          message: String(error),
          path,
          bookCode,
        });
        continue;
      }
      if (dirtyChapters.length === 0) {
        // Residue — but layering ALREADY rebound this book's source to the
        // backup, and `layered` is what the sources blob is rebuilt from. A
        // book reported clean must be bound to disk, or the container gets
        // published against backup bytes main will certify against disk bytes.
        // Reverting puts the disk binding back, which is the state the "clean"
        // claim is about.
        braid.revertToBaseline([bookCode]);
        void dirtyBufferStore.clear(args.workspaceKey, bookCode);
        continue;
      }
      book.dirtyChapters = dirtyChapters;
      // Disk, before the backup replaced it as this book's bound source.
      diskSourceByBook[bookCode] = decoder.decode(
        sources.subarray(book.byteOffset, book.byteOffset + book.byteLength),
      );
      layered.set(bookCode, result.entry.content);
      restoredBookCodes.push(bookCode);
      // Disk moved underneath the backup. A message, never a branch — the work
      // is kept either way; an unknown baseline counts as moved, the safe read.
      const recorded = result.entry.diskBaseline;
      if (recorded.kind === "absent" || recorded.md5 !== book.sourceMd5) {
        conflictedBookCodes.push(bookCode);
      }
    }
    return {
      restoredBookCodes,
      conflictedBookCodes,
      entries,
      diskSourceByBook,
    };
  }

  /**
   * Rebuild the sources buffer so it holds what the corpus is now BOUND to.
   *
   * Layering a backup rebinds that book's source, and the packed container main
   * certifies is bound to the same thing — verification checks exact length and
   * content hash per book, so handing main the disk bytes instead would refuse
   * the whole load. Extents move with the content, so the catalog is rewritten
   * in place rather than patched.
   */
  function rebindSources(
    catalog: LoadedProjectBook[],
    sources: Uint8Array,
    layered: ReadonlyMap<string, string>,
  ): Uint8Array {
    const encoder = new TextEncoder();
    const bytesByBook = catalog.map((book) => {
      const backup = layered.get(book.bookCode);
      return backup === undefined
        ? sources.subarray(book.byteOffset, book.byteOffset + book.byteLength)
        : encoder.encode(backup);
    });
    const total = bytesByBook.reduce((sum, bytes) => sum + bytes.byteLength, 0);
    const rebound = new Uint8Array(total);
    let byteOffset = 0;
    catalog.forEach((book, index) => {
      const bytes = bytesByBook[index];
      rebound.set(bytes, byteOffset);
      book.byteOffset = byteOffset;
      book.byteLength = bytes.byteLength;
      byteOffset += bytes.byteLength;
    });
    return rebound;
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
