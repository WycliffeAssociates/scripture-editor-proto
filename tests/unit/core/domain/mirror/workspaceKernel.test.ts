// workspaceKernel.test.ts
//
// Registry semantics: arbitration BEFORE any load, single slot, refcount +
// grace, preload-never-evicts, and the build order (metadata seed, no follow-up
// analysis on a clean open). The platform session is faked so the build is
// synchronous-ish and disposal is observable.

import type { LintIssue } from "usfm-onion-web";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MirrorFeed } from "@/app/domain/mirror/MirrorFeed.ts";
import type { MirrorSessionFactory } from "@/app/domain/mirror/mirrorSessionFactory.ts";
import {
  __resetWorkspaceKernelRegistryForTests,
  reserveWorkspaceSlot,
  type WorkspaceKernelBuildArgs,
  type WorkspaceKernelHandle,
} from "@/app/domain/mirror/workspaceKernel.ts";
import { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";

afterEach(() => {
  __resetWorkspaceKernelRegistryForTests();
  vi.useRealTimers();
});

/**
 * A fake session recording lifecycle and every patch/command that reaches the
 * feed. Analyze commands are answered so a recovery-path build can settle; a
 * clean open must never send them, which is what the build-order test asserts.
 */
function makeFakeFactory(log: string[]): {
  factory: MirrorSessionFactory;
  disposed: () => number;
} {
  let disposeCount = 0;
  const factory: MirrorSessionFactory = ({ feed }) => {
    feed.addSink({
      pushPatch: (patch) => log.push(`patch:${patch.kind}`),
      sendCommand: (command) => {
        log.push(`command:${command.kind}`);
        if (command.kind === "analyzeLint") {
          feed.deliverResult({
            kind: "lintResult",
            snapshot: {
              snapshotId: "snapshot",
              books: [],
              summary: {
                byCategory: {
                  document: 0,
                  structure: 0,
                  context: 0,
                  numbering: 0,
                },
                bySeverity: { error: 0, warning: 0 },
                byIssueType: { usfm: 0, content: 0 },
                totalCount: 0,
                suppressedCount: 0,
              },
            },
            ranAtGeneration: command.generation,
            requestId: command.requestId,
          });
        }
        if (command.kind === "analyzeGalley") {
          feed.deliverResult({
            kind: "galleyResult",
            packed: new ArrayBuffer(0),
            keys: [],
            cacheState: "fresh",
            ranAtGeneration: command.generation,
            requestId: command.requestId,
          });
        }
      },
    });
    return {
      ready: () => {
        log.push("ready");
        return Promise.resolve();
      },
      loadProject: async (request) => {
        log.push("load");
        return {
          kind: "loadProjectResult",
          state: "cold",
          ranAtGeneration: request.generation,
          projectPath: request.projectPath,
          packed: new ArrayBuffer(0),
          sources: new ArrayBuffer(0),
          books: [],
        };
      },
      dispose: () => {
        disposeCount++;
        log.push("dispose");
      },
    };
  };
  return { factory, disposed: () => disposeCount };
}

function buildArgs(
  projectKey: string,
  factory: MirrorSessionFactory,
  overrides: Partial<WorkspaceKernelBuildArgs> = {},
): Omit<WorkspaceKernelBuildArgs, "projectKey"> {
  const feed = new MirrorFeed();
  return {
    projectFiles: [],
    workspaceBaselineStore: new WorkspaceBaselineStore({
      calculateMd5: async (text) => text,
    }),
    analysisDisabled: false,
    feed,
    session: factory({
      feed,
      workspaceKey: projectKey,
      dirtyBufferRoot: "/tmp",
    }),
    braidFindings: new Map<string, readonly LintIssue[]>(),
    galley: null,
    recoveredBookCodes: [],
    load: emptyLoad(),
    ...overrides,
  };
}

function emptyLoad(): WorkspaceKernelBuildArgs["load"] {
  return {
    projectFiles: [],
    workspaceBaselineStore: new WorkspaceBaselineStore({
      calculateMd5: async (text) => text,
    }),
    recoveredConflictTracker: null as never,
    dirtyBufferStore: null as never,
    restoredBookCodes: [],
    conflictedBookCodes: [],
    recoveryReportEntries: [],
  };
}

/** Reserve, then (when granted) load + install, mirroring the route's order. */
async function openWorkspace(
  projectKey: string,
  factory: MirrorSessionFactory,
  options: {
    preload?: boolean;
    overrides?: Partial<WorkspaceKernelBuildArgs>;
  } = {},
): Promise<WorkspaceKernelHandle | null> {
  const reservation = await reserveWorkspaceSlot({
    projectKey,
    preload: options.preload ?? false,
  });
  if (reservation.kind === "declined") return null;
  if (reservation.kind === "reuse") return reservation.handle;
  const args = buildArgs(projectKey, factory, options.overrides);
  await args.session.ready();
  await args.session.loadProject({
    generation: 0,
    projectPath: `/${projectKey}`,
    workspaceKey: projectKey,
    books: [],
    analysisDisabled: args.analysisDisabled,
  });
  return reservation.install(args);
}

describe("workspace kernel — build order", () => {
  it("seeds resident metadata and runs NO follow-up analysis on a clean open", async () => {
    const log: string[] = [];
    const { factory } = makeFakeFactory(log);
    const handle = await openWorkspace("p1", factory);
    expect(handle).not.toBeNull();
    // The load already restored both arms and returned their results, so the
    // kernel publishes them rather than asking the host to analyze again.
    expect(log).toEqual(["ready", "load", "patch:residentSeed"]);
  });

  it("republishes only the recovered books, then re-analyzes once", async () => {
    const log: string[] = [];
    const { factory } = makeFakeFactory(log);
    await openWorkspace("p1", factory, {
      overrides: {
        projectFiles: [bookState("MAT"), bookState("MRK")],
        recoveredBookCodes: ["MRK"],
      },
    });
    // One updateBook — for MRK alone, not a whole-corpus fullSync.
    expect(log).toEqual([
      "ready",
      "load",
      "patch:residentSeed",
      "patch:updateBook",
      "command:analyzeLint",
      "command:analyzeGalley",
    ]);
  });

  it("publishes no findings in plain mode (analysisDisabled)", async () => {
    const log: string[] = [];
    const { factory } = makeFakeFactory(log);
    const handle = await openWorkspace("p1", factory, {
      overrides: { analysisDisabled: true },
    });
    expect(handle?.initialFindings).toEqual({
      lint: null,
      sous: null,
      localLint: {},
    });
    expect(log).toEqual(["ready", "load", "patch:residentSeed"]);
  });
});

describe("workspace kernel — arbitration precedes the load", () => {
  it("reuses the live kernel WITHOUT loading the project again", async () => {
    const log: string[] = [];
    const { factory, disposed } = makeFakeFactory(log);
    const a = await openWorkspace("p1", factory);
    const b = await openWorkspace("p1", factory);
    // The second open never created a session and never loaded: on desktop
    // that load would have run against the live workspace's own resident state.
    expect(log.filter((entry) => entry === "load")).toHaveLength(1);
    expect(a?.feed).toBe(b?.feed);
    expect(disposed()).toBe(0);
    // It is served the kernel's own loader payload, not a second set of stores.
    expect(b?.load).toBe(a?.load);
  });

  it("disposes the outgoing kernel BEFORE the incoming project loads", async () => {
    const log: string[] = [];
    const { factory, disposed } = makeFakeFactory(log);
    await openWorkspace("p1", factory);
    await openWorkspace("p2", factory);
    expect(disposed()).toBe(1);
    // Order matters: the old session's teardown completes before the new load
    // touches the shared resident state it is taking over.
    expect(log.indexOf("dispose")).toBeLessThan(log.lastIndexOf("load"));
  });

  it("declines a preload that would evict the live workspace, loading nothing", async () => {
    const log: string[] = [];
    const { factory, disposed } = makeFakeFactory(log);
    await openWorkspace("open", factory);
    const warmed = await openWorkspace("hovered", factory, { preload: true });
    expect(warmed).toBeNull();
    expect(disposed()).toBe(0);
    expect(log.filter((entry) => entry === "load")).toHaveLength(1);
  });

  it("warms a cold slot on preload (the open-with-findings-ready feature)", async () => {
    const log: string[] = [];
    const { factory } = makeFakeFactory(log);
    const warmed = await openWorkspace("hovered", factory, { preload: true });
    expect(warmed).not.toBeNull();
    const navigated = await openWorkspace("hovered", factory);
    expect(navigated?.feed).toBe(warmed?.feed);
    expect(log.filter((entry) => entry === "load")).toHaveLength(1);
  });

  it("releases the reservation when a load fails, so the next open proceeds", async () => {
    const log: string[] = [];
    const { factory } = makeFakeFactory(log);
    const reservation = await reserveWorkspaceSlot({
      projectKey: "p1",
      preload: false,
    });
    expect(reservation.kind).toBe("granted");
    if (reservation.kind !== "granted") return;
    reservation.abort();
    const retried = await openWorkspace("p1", factory);
    expect(retried).not.toBeNull();
  });
});

describe("workspace kernel — dispose grace", () => {
  it("does not dispose immediately at refcount 0; re-claim cancels the grace", async () => {
    vi.useFakeTimers();
    const log: string[] = [];
    const { factory, disposed } = makeFakeFactory(log);
    const a = await openWorkspace("p1", factory);
    a?.claim().release();
    vi.advanceTimersByTime(1_000);
    expect(disposed()).toBe(0);
    // Re-claim (StrictMode remount) cancels the pending disposal and reuses it.
    const b = await openWorkspace("p1", factory);
    const claimB = b?.claim();
    vi.advanceTimersByTime(10_000);
    expect(disposed()).toBe(0);
    expect(log.filter((entry) => entry === "load")).toHaveLength(1);
    claimB?.release();
    vi.advanceTimersByTime(10_000);
    expect(disposed()).toBe(1);
  });

  it("survives the loader→mount gap unclaimed, then disposes if never claimed", async () => {
    vi.useFakeTimers();
    const log: string[] = [];
    const { factory, disposed } = makeFakeFactory(log);
    await openWorkspace("p1", factory);
    vi.advanceTimersByTime(1_000);
    expect(disposed()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(disposed()).toBe(1);
  });
});

function bookState(
  bookCode: string,
): WorkspaceKernelBuildArgs["projectFiles"][number] {
  return {
    path: `/${bookCode}.usfm`,
    nextBookId: null,
    prevBookId: null,
    title: bookCode,
    bookCode,
    chapters: [
      {
        sourceTokens: [],
        currentTokens: [],
        direction: "ltr",
        chapterNumber: 1,
        dirty: false,
        eol: "\n",
      },
    ],
  };
}
