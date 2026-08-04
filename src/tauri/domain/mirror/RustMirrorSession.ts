// RustMirrorSession.ts
//
// The desktop lint/Galley half of the mirror feed. On desktop the feed is
// multicast to the Rust resident mirror, which forwards token patches to the
// (`mirror_push_patch`) and commands to the generation-aware Rust resident
// Braid/Galley commands.
//
// Patches are fire-and-forget invokes (the Rust mirror applies idempotently by
// generation, so order doesn't matter). Analyze invokes resolve to a per-book
// result tagged with the generation it ran against; the result is delivered
// back into the feed as a `lintResult`/`galleyResult` for the existing router. A
// `behind` result (the mirror hasn't applied the requested generation yet, on
// this unordered transport) means the patch for this generation hasn't landed
// yet. The race is transient — the time for one in-flight `mirror_push_patch`
// to apply — so we retry the same analyze a bounded number of times with a
// short delay before giving up. Only on exhaustion do we fall back to a
// `resyncRequest`, which re-tokenizes the whole project from current store
// state and is far too heavy a first response to a transient race. A `behind`
// result is never delivered as findings — that would clear the stores.

import { invoke } from "@tauri-apps/api/core";

import { loadProjectResident } from "@/app/domain/mirror/braidHost.ts";
import type { MirrorFeed } from "@/app/domain/mirror/MirrorFeed.ts";
import type {
  GalleyCachePolicy,
  HostCommand,
  LoadedProjectBook,
  LoadProjectResult,
  MirrorPatch,
} from "@/app/domain/mirror/mirrorProtocol.ts";
import type { LoadProjectRequest } from "@/app/domain/mirror/mirrorSessionFactory.ts";
import type { TracedPhase } from "@/app/domain/mirror/traceLog.ts";
import type { GalleyCacheIdentity } from "@/core/domain/sous/galleyTypes.ts";
import type { LintIssue, Token } from "@/core/domain/usfm/usfmOnionTypes.ts";
import type { SegmentsBySid } from "@/core/domain/usfm/vrefTypes.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";

type MirrorLintResultDto = {
  snapshot: {
    snapshotId: string;
    books: Array<{
      sourceKey: string;
      book: string;
      sourceHash: string;
      tokenIdentity: string;
      findings: LintIssue[];
      summary: {
        byCategory: Record<string, number>;
        bySeverity: Record<string, number>;
        byIssueType: Record<string, number>;
        totalCount: number;
        suppressedCount: number;
      };
    }>;
    summary: {
      byCategory: Record<string, number>;
      bySeverity: Record<string, number>;
      byIssueType: Record<string, number>;
      totalCount: number;
      suppressedCount: number;
    };
  };
  ranAtGeneration: number;
  behind: boolean;
};

type MirrorGalleyResultDto = {
  packedId: number;
  keys: string[];
  segments: SegmentsBySid;
  cacheState: "fresh" | "persisted";
  expectedIdentity?: GalleyCacheIdentity;
  ranAtGeneration: number;
  behind: boolean;
};

type MirrorFormatBraidResultDto = {
  books: Record<string, Token[]>;
  usfm: Record<string, string>;
  ranAtGeneration: number;
  behind: boolean;
  superseded: boolean;
};

type MirrorApplyBraidFixResultDto = MirrorFormatBraidResultDto;

type MirrorPublishBraidResultDto = {
  packedId: number;
  snapshotId: string;
  books: Array<{
    bookCode: string;
    sourceHash: string;
    encoded: boolean;
    source: string | null;
  }>;
  sources: Array<{ bookCode: string; sourceKey: string; source: string }>;
  serializedBooks: Array<{ bookCode: string; contents: string }>;
  ranAtGeneration: number;
  behind: boolean;
  superseded: boolean;
};

type MirrorBackupResultDto = {
  bookCode: string;
  cleared: boolean;
  ranAtGeneration: number;
  behind: boolean;
};

type MirrorLoadProjectResultDto = {
  state: "warm" | "cold" | "rejected";
  packedId: number;
  /** Handle for the concatenated exact disk bytes of every loaded book. */
  sourcesId: number;
  books: LoadedProjectBook[];
  galley?: {
    packedId: number;
    keys: string[];
    segments: SegmentsBySid;
    cacheState: "fresh" | "persisted";
    expectedIdentity?: GalleyCacheIdentity;
  };
  hostPhases: TracedPhase[];
  error?: string;
};

// A `behind` result means the patch for this generation is still in flight on
// the unordered transport. Retry the same analyze this many times, sleeping the
// matching delay before each retry, before falling back to a full resync.
const BEHIND_RETRY_DELAYS_MS = [150, 300];

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

type BehindResultDto = { behind: boolean };

function asArrayBuffer(value: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value;
  return new Uint8Array(value).slice().buffer;
}

// Shared runner for the two near-identical analyze paths. Invokes the analyze
// command; on a `behind` result it retries the same invoke per
// BEHIND_RETRY_DELAYS_MS (the patch is still in flight), and only delivers a
// `resyncRequest` once retries are exhausted. A fresh (not-behind) result is
// handed to `deliver` to be shaped into the kind-specific feed result.
async function runAnalyze<R extends BehindResultDto>(args: {
  feed: MirrorFeed;
  command: "mirror_lint" | "mirror_galley_analyze";
  generation: number;
  deliver: (result: R) => void | Promise<void>;
  extra?: Record<string, unknown>;
}): Promise<void> {
  const { feed, command, generation, deliver } = args;
  try {
    for (let attempt = 0; ; attempt++) {
      const params = {
        generation,
        ...args.extra,
      };
      const result = await invoke<R>(command, params);
      if (!result.behind) {
        await deliver(result);
        return;
      }
      if (attempt >= BEHIND_RETRY_DELAYS_MS.length) {
        // Retries exhausted: the patch never landed, so fall back to a full
        // re-seed from current store state.
        feed.deliverResult({
          kind: "resyncRequest",
          lastGeneration: generation,
        });
        return;
      }
      await sleep(BEHIND_RETRY_DELAYS_MS[attempt]);
    }
  } catch (error: unknown) {
    console.error(`[mirror] ${command} failed`, { error });
  }
}

// Desktop's resident Braid/Galley live in ONE process-wide Tauri state, so
// "which session owns it" has to be an explicit fact rather than an assumption
// about call order. Each session takes the next epoch; a load adopts it and
// resets the state it is taking over, and every teardown names the epoch it
// believes it is tearing down.
let nextHostEpoch = 0;

export class RustMirrorSession {
  private readonly epoch = ++nextHostEpoch;
  private readonly removeSink: () => void;
  private readonly feed: MirrorFeed;
  private readonly workspaceKey?: string;
  private readonly fileSystem?: FileSystem;
  private readonly cacheRoot?: string;
  private readonly dirtyBufferRoot?: string;
  // The patch payload uses `ref` (a JS-fine key); Rust deserializes it via a
  // renamed field. The protocol's `ChapterRef` already carries `bookCode` /
  // `chapterNum`, which match the Rust DTO field names by construction.

  constructor(args: {
    feed: MirrorFeed;
    workspaceKey?: string;
    fileSystem?: FileSystem;
    cacheRoot?: string;
    dirtyBufferRoot?: string;
  }) {
    this.feed = args.feed;
    this.workspaceKey = args.workspaceKey;
    this.fileSystem = args.fileSystem;
    this.cacheRoot = args.cacheRoot;
    this.dirtyBufferRoot = args.dirtyBufferRoot;
    this.removeSink = args.feed.addSink({
      pushPatch: (patch: MirrorPatch) => {
        void invoke("mirror_push_patch", { patch }).catch((error: unknown) => {
          console.error("[mirror] mirror_push_patch failed", { error });
        });
      },
      sendCommand: (command: HostCommand) => {
        switch (command.kind) {
          case "analyzeLint":
            this.runLint(args.feed, command);
            return;
          case "analyzeGalley":
            this.runGalley(args.feed, command);
            return;
          case "formatBraid":
            this.runFormatBraid(args.feed, command);
            return;
          case "applyBraidFix":
            this.runApplyBraidFix(args.feed, command);
            return;
          case "publishBraid":
            this.runPublishBraid(args.feed, command);
            return;
          case "loadProject":
            this.runLoadProject(args.feed, command);
            return;
          case "writeBackup":
            this.runBackup(
              args.feed,
              command.bookCode,
              command.appVersion,
              command.generation,
              false,
            );
            return;
          case "clearBackup":
            this.runBackup(
              args.feed,
              command.bookCode,
              undefined,
              command.generation,
              true,
            );
            return;
          default:
            return;
        }
      },
    });
  }

  loadProject(request: LoadProjectRequest): Promise<LoadProjectResult> {
    return loadProjectResident({ feed: this.feed, ...request });
  }

  private runLint(
    feed: MirrorFeed,
    command: Extract<HostCommand, { kind: "analyzeLint" }>,
  ): void {
    void runAnalyze<MirrorLintResultDto>({
      feed,
      command: "mirror_lint",
      generation: command.generation,
      // Echo the command's correlation id (when present) so an awaiting caller
      // — the load contract's initial pass — can match this specific result.
      deliver: (result) =>
        feed.deliverResult({
          kind: "lintResult",
          snapshot: result.snapshot,
          ranAtGeneration: result.ranAtGeneration,
          requestId: command.requestId,
        }),
    });
  }

  private runFormatBraid(
    feed: MirrorFeed,
    command: Extract<HostCommand, { kind: "formatBraid" }>,
  ): void {
    void invoke<MirrorFormatBraidResultDto>("mirror_format_braid", {
      generation: command.generation,
      scope: command.scope,
      options: command.options,
    })
      .then((result) =>
        feed.deliverResult({
          kind: "formatBraidResult",
          requestId: command.requestId,
          books: result.books,
          usfm: result.usfm,
          ranAtGeneration: result.ranAtGeneration,
          behind: result.behind,
          superseded: result.superseded,
        }),
      )
      .catch((error: unknown) =>
        feed.deliverResult({
          kind: "braidCommandError",
          requestId: command.requestId,
          operation: "formatBraid",
          error: error instanceof Error ? error.message : String(error),
        }),
      );
  }

  private runApplyBraidFix(
    feed: MirrorFeed,
    command: Extract<HostCommand, { kind: "applyBraidFix" }>,
  ): void {
    void invoke<MirrorApplyBraidFixResultDto>("mirror_apply_braid_fix", {
      generation: command.generation,
      bookCode: command.bookCode,
      fix: command.fix,
    })
      .then((result) =>
        feed.deliverResult({
          kind: "applyBraidFixResult",
          requestId: command.requestId,
          books: result.books,
          usfm: result.usfm,
          ranAtGeneration: result.ranAtGeneration,
          behind: result.behind,
          superseded: result.superseded,
        }),
      )
      .catch((error: unknown) =>
        feed.deliverResult({
          kind: "braidCommandError",
          requestId: command.requestId,
          operation: "applyBraidFix",
          error: error instanceof Error ? error.message : String(error),
        }),
      );
  }

  private runPublishBraid(
    feed: MirrorFeed,
    command: Extract<HostCommand, { kind: "publishBraid" }>,
  ): void {
    void invoke<MirrorPublishBraidResultDto>("mirror_publish_braid", {
      generation: command.generation,
    })
      .then(async (result) => {
        if (result.behind || result.superseded) {
          feed.deliverResult({
            kind: "publishBraidResult",
            requestId: command.requestId,
            ranAtGeneration: result.ranAtGeneration,
            behind: result.behind,
            superseded: result.superseded,
          });
          return;
        }
        const packed = await invoke<ArrayBuffer>("mirror_braid_packed", {
          packedId: result.packedId,
        });
        feed.deliverResult({
          kind: "publishBraidResult",
          requestId: command.requestId,
          publication: {
            packed: asArrayBuffer(packed),
            snapshotId: result.snapshotId,
            books: result.books.map((book) => ({
              book: book.bookCode,
              sourceHash: book.sourceHash,
              encoded: book.encoded,
              source: book.source,
            })),
            sources: result.sources,
            serializedBooks: result.serializedBooks,
          },
          ranAtGeneration: result.ranAtGeneration,
          behind: false,
          superseded: false,
        });
      })
      .catch((error: unknown) =>
        feed.deliverResult({
          kind: "braidCommandError",
          requestId: command.requestId,
          operation: "publishBraid",
          error: error instanceof Error ? error.message : String(error),
        }),
      );
  }

  /**
   * The native load. `mirror_load_project` adopts this session's epoch as the
   * resident state's owner and returns only bookkeeping; the three large
   * payloads — the packed corpus, every book's exact disk bytes, Galley's packed
   * findings — come back over Tauri's binary response path so no part of the
   * corpus is JSON-encoded across the IPC boundary.
   */
  private runLoadProject(
    feed: MirrorFeed,
    command: Extract<HostCommand, { kind: "loadProject" }>,
  ): void {
    void invoke<MirrorLoadProjectResultDto>("mirror_load_project", {
      epoch: this.epoch,
      generation: command.generation,
      projectPath: command.projectPath,
      workspaceKey: encodeURIComponent(command.workspaceKey),
      cacheRoot: this.cacheRoot ?? "",
      books: command.books,
      config: command.config,
      analysisDisabled: command.analysisDisabled,
    })
      .then(async (result) => {
        if (result.state === "rejected") {
          feed.deliverResult({
            kind: "loadProjectResult",
            state: "rejected",
            ranAtGeneration: command.generation,
            projectPath: command.projectPath,
            hostPhases: result.hostPhases,
            error: result.error,
          });
          return;
        }
        const [packed, sources, galleyPacked] = await Promise.all([
          this.readPackedBuffer("mirror_braid_packed", result.packedId),
          this.readPackedBuffer("mirror_braid_packed", result.sourcesId),
          result.galley
            ? this.readPackedBuffer(
                "mirror_galley_packed",
                result.galley.packedId,
              )
            : Promise.resolve(undefined),
        ]);
        feed.deliverResult({
          kind: "loadProjectResult",
          state: result.state,
          ranAtGeneration: command.generation,
          projectPath: command.projectPath,
          packed,
          sources,
          books: result.books,
          galley:
            result.galley && galleyPacked
              ? {
                  packed: galleyPacked,
                  keys: result.galley.keys,
                  segments: result.galley.segments,
                  cacheState: result.galley.cacheState,
                  expectedIdentity: result.galley.expectedIdentity,
                }
              : undefined,
          hostPhases: result.hostPhases,
        });
      })
      .catch((error: unknown) =>
        feed.deliverResult({
          kind: "loadProjectResult",
          state: "rejected",
          ranAtGeneration: command.generation,
          projectPath: command.projectPath,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
  }

  private runBackup(
    feed: MirrorFeed,
    bookCode: string,
    appVersion: string | undefined,
    generation: number,
    clear: boolean,
  ): void {
    const workspaceKey = this.workspaceKey;
    const dirtyBufferRoot = this.dirtyBufferRoot;
    if (!workspaceKey || !dirtyBufferRoot) return;
    void (async () => {
      for (let attempt = 0; ; attempt++) {
        const result = await invoke<MirrorBackupResultDto>("mirror_backup", {
          bookCode,
          appVersion,
          generation,
          dirtyBufferRoot,
          workspaceKey: encodeURIComponent(workspaceKey),
          clear,
        });
        if (!result.behind) {
          feed.deliverResult({
            kind: "backupResult",
            bookCode: result.bookCode,
            cleared: result.cleared,
            ranAtGeneration: result.ranAtGeneration,
          });
          return;
        }
        if (attempt >= BEHIND_RETRY_DELAYS_MS.length) {
          feed.deliverResult({
            kind: "resyncRequest",
            lastGeneration: generation,
          });
          return;
        }
        await sleep(BEHIND_RETRY_DELAYS_MS[attempt]);
      }
    })().catch((error: unknown) =>
      console.error("[mirror] mirror_backup failed", { error }),
    );
  }

  private runGalley(
    feed: MirrorFeed,
    command: Extract<HostCommand, { kind: "analyzeGalley" }>,
  ): void {
    void this.runGalleyOrdered(feed, command);
  }

  private async runGalleyOrdered(
    feed: MirrorFeed,
    command: Extract<HostCommand, { kind: "analyzeGalley" }>,
  ): Promise<void> {
    if (command.cachePolicy === "restore") {
      // Restore must win the race with fresh analysis. Otherwise fresh
      // persistence can observe the malformed file and skip replacing it
      // before the main thread gets a chance to reject the cached snapshot.
      await this.runCachedGalley(feed, command);
    }
    await runAnalyze<MirrorGalleyResultDto>({
      feed,
      command: "mirror_galley_analyze",
      generation: command.generation,
      extra: { config: command.config },
      deliver: async (result) => {
        const packed =
          result.packedId === 0
            ? new ArrayBuffer(0)
            : await this.readPacked(result.packedId);
        if (command.cachePolicy !== "none") {
          void this.persistPackedResult(
            result,
            packed,
            command.cachePolicy,
          ).catch((error: unknown) =>
            console.error("[mirror] native Galley cache write failed", {
              error,
            }),
          );
        }
        feed.deliverResult({
          kind: "galleyResult",
          packed,
          keys: result.keys,
          segments: result.segments,
          cacheState: result.cacheState,
          expectedIdentity: result.expectedIdentity,
          ranAtGeneration: result.ranAtGeneration,
          requestId: command.requestId,
        });
      },
    });
  }

  private async runCachedGalley(
    feed: MirrorFeed,
    command: Extract<HostCommand, { kind: "analyzeGalley" }>,
  ): Promise<void> {
    if (!this.cacheRoot || !this.workspaceKey) return;
    try {
      const result = await invoke<MirrorGalleyResultDto>("mirror_galley_load", {
        generation: command.generation,
        config: command.config,
        cacheRoot: this.cacheRoot,
        workspaceKey: encodeURIComponent(this.workspaceKey),
      });
      if (result.behind || result.packedId === 0) return;
      const packed = await this.readPacked(result.packedId);
      feed.deliverResult({
        kind: "galleyResult",
        packed,
        keys: result.keys,
        segments: result.segments,
        cacheState: result.cacheState,
        expectedIdentity: result.expectedIdentity,
        ranAtGeneration: result.ranAtGeneration,
        requestId: command.requestId,
      });
    } catch (error: unknown) {
      console.error("[mirror] mirror_galley_load failed", { error });
    }
  }

  private async persistPackedResult(
    result: MirrorGalleyResultDto,
    packed: ArrayBuffer,
    cachePolicy: GalleyCachePolicy,
  ): Promise<void> {
    const fileSystem = this.fileSystem;
    if (!fileSystem || !this.cacheRoot || !this.workspaceKey) return;
    const workspace = encodeURIComponent(this.workspaceKey);
    if (result.cacheState !== "fresh") return;
    const path = `${this.cacheRoot}/sous-chef-findings/${workspace}/corpus.bin`;
    if (cachePolicy === "restore" && (await fileSystem.exists(path))) return;
    await fileSystem.mkdir(path.slice(0, path.lastIndexOf("/")), {
      recursive: true,
    });
    await fileSystem.atomicWriteBytes(path, new Uint8Array(packed));
  }

  private readPacked(packedId: number): Promise<ArrayBuffer> {
    return this.readPackedBuffer("mirror_galley_packed", packedId);
  }

  private readPackedBuffer(
    command: "mirror_braid_packed" | "mirror_galley_packed",
    packedId: number,
  ): Promise<ArrayBuffer> {
    if (packedId === 0) return Promise.resolve(new ArrayBuffer(0));
    return invoke<ArrayBuffer>(command, { packedId }).then(asArrayBuffer);
  }

  /**
   * Tear down only if this session still owns the resident state. Tauri invokes
   * are unordered, so a superseded session's teardown can otherwise land after
   * its successor's load and reset the workspace that replaced it.
   */
  dispose(): void {
    this.removeSink();
    void invoke("mirror_dispose", { epoch: this.epoch }).catch(
      (error: unknown) =>
        console.error("[mirror] mirror_dispose failed", { error }),
    );
  }
}
