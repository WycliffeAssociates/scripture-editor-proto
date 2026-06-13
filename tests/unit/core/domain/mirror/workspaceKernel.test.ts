// workspaceKernel.test.ts
//
// Registry semantics: single slot, refcount + grace, preload-never-evicts, and
// the build order (seed before ready before initial findings). The platform
// session is faked so the build is synchronous-ish and disposal is observable.

import { afterEach, describe, expect, it, vi } from "vitest";

import type { MirrorSessionFactory } from "@/app/domain/mirror/mirrorSessionFactory.ts";
import {
  __resetWorkspaceKernelRegistryForTests,
  acquireWorkspaceKernel,
  type WorkspaceKernelBuildArgs,
} from "@/app/domain/mirror/workspaceKernel.ts";
import type { DirtyBufferStore } from "@/app/state/DirtyBufferStore.ts";
import { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";

afterEach(() => {
  __resetWorkspaceKernelRegistryForTests();
  vi.useRealTimers();
});

// A fake session: records lifecycle, answers analyze commands so the load
// contract's `awaitInitialFindings` resolves. `ready()` resolves on a
// microtask; the order of events (seed patch, ready, analyze command) is
// recorded for the build-order assertion.
function makeFakeFactory(log: string[]): {
  factory: MirrorSessionFactory;
  disposed: () => number;
} {
  let disposeCount = 0;
  const factory: MirrorSessionFactory = ({ feed }) => {
    feed.addSink({
      pushPatch: (p) => log.push(`patch:${p.kind}`),
      sendCommand: (c) => {
        log.push(`command:${c.kind}`);
        // Echo a matching result so awaitInitialFindings resolves.
        if (c.kind === "analyzeLint") {
          feed.deliverResult({
            kind: "lintResult",
            byBook: {},
            ranAtGeneration: c.generation,
            requestId: c.requestId,
          });
        }
        if (c.kind === "analyzeSous") {
          feed.deliverResult({
            kind: "sousResult",
            byBook: {},
            ranAtGeneration: c.generation,
            requestId: c.requestId,
          });
        }
      },
    });
    return {
      ready: () => {
        log.push("ready");
        return Promise.resolve();
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
  analysisDisabled = false,
): WorkspaceKernelBuildArgs {
  return {
    projectKey,
    projectFiles: [],
    workspaceBaselineStore: new WorkspaceBaselineStore({
      calculateMd5: async (t) => t,
    }),
    dirtyBufferStore: {} as DirtyBufferStore,
    dirtyBufferRoot: "/tmp",
    mirrorSessionFactory: factory,
    analysisDisabled,
  };
}

describe("acquireWorkspaceKernel — build order", () => {
  it("seeds before awaiting ready, then runs the initial analyze", async () => {
    const log: string[] = [];
    const { factory } = makeFakeFactory(log);
    const handle = await acquireWorkspaceKernel({
      ...buildArgs("p1", factory),
      preload: false,
    });
    expect(handle).not.toBeNull();
    // fullSync seed precedes ready precedes the analyze commands.
    expect(log).toEqual([
      "patch:fullSync",
      "ready",
      "command:analyzeLint",
      "command:analyzeSous",
    ]);
  });

  it("skips the initial analyze in plain mode (analysisDisabled)", async () => {
    const log: string[] = [];
    const { factory } = makeFakeFactory(log);
    const handle = await acquireWorkspaceKernel({
      ...buildArgs("p1", factory, true),
      preload: false,
    });
    expect(handle?.initialFindings).toEqual({ lint: {}, sous: {} });
    expect(log).toEqual(["patch:fullSync", "ready"]);
  });
});

describe("acquireWorkspaceKernel — single slot + refcount", () => {
  it("reuses the live kernel for the same key (no second build/dispose)", async () => {
    const log: string[] = [];
    const { factory, disposed } = makeFakeFactory(log);
    const a = await acquireWorkspaceKernel({
      ...buildArgs("p1", factory),
      preload: false,
    });
    const b = await acquireWorkspaceKernel({
      ...buildArgs("p1", factory),
      preload: false,
    });
    // One build (one fullSync), shared feed, no dispose yet.
    expect(log.filter((e) => e === "patch:fullSync")).toHaveLength(1);
    expect(a?.feed).toBe(b?.feed);
    expect(disposed()).toBe(0);
  });

  it("disposes the old kernel when a different key navigates in", async () => {
    const log: string[] = [];
    const { factory, disposed } = makeFakeFactory(log);
    await acquireWorkspaceKernel({
      ...buildArgs("p1", factory),
      preload: false,
    });
    await acquireWorkspaceKernel({
      ...buildArgs("p2", factory),
      preload: false,
    });
    expect(disposed()).toBe(1);
    expect(log.filter((e) => e === "patch:fullSync")).toHaveLength(2);
  });
});

describe("acquireWorkspaceKernel — dispose grace", () => {
  it("does not dispose immediately at refcount 0; re-claim cancels the grace", async () => {
    vi.useFakeTimers();
    const log: string[] = [];
    const { factory, disposed } = makeFakeFactory(log);
    const a = await acquireWorkspaceKernel({
      ...buildArgs("p1", factory),
      preload: false,
    });
    const claimA = a?.claim();
    claimA?.release();
    // Within the grace window: not yet disposed.
    vi.advanceTimersByTime(1_000);
    expect(disposed()).toBe(0);
    // Re-claim (StrictMode remount) cancels the pending disposal and reuses it.
    const b = await acquireWorkspaceKernel({
      ...buildArgs("p1", factory),
      preload: false,
    });
    const claimB = b?.claim();
    vi.advanceTimersByTime(10_000);
    expect(disposed()).toBe(0);
    expect(log.filter((e) => e === "patch:fullSync")).toHaveLength(1);
    claimB?.release();
    vi.advanceTimersByTime(10_000);
    expect(disposed()).toBe(1);
  });

  it("survives the loader→mount gap unclaimed, then disposes if never claimed", async () => {
    vi.useFakeTimers();
    const log: string[] = [];
    const { factory, disposed } = makeFakeFactory(log);
    // Loader warms the slot but the component never mounts (aborted nav /
    // preload that goes nowhere): the grace reaps it.
    await acquireWorkspaceKernel({
      ...buildArgs("p1", factory),
      preload: false,
    });
    vi.advanceTimersByTime(1_000);
    expect(disposed()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(disposed()).toBe(1);
  });
});

describe("acquireWorkspaceKernel — preload never evicts", () => {
  it("returns null on preload when a different key occupies the slot", async () => {
    const log: string[] = [];
    const { factory, disposed } = makeFakeFactory(log);
    await acquireWorkspaceKernel({
      ...buildArgs("open", factory),
      preload: false,
    });
    const warmed = await acquireWorkspaceKernel({
      ...buildArgs("hovered", factory),
      preload: true,
    });
    // The live workspace is untouched; the preload built nothing.
    expect(warmed).toBeNull();
    expect(disposed()).toBe(0);
    expect(log.filter((e) => e === "patch:fullSync")).toHaveLength(1);
  });

  it("warms a cold slot on preload (the open-with-findings-ready feature)", async () => {
    const log: string[] = [];
    const { factory } = makeFakeFactory(log);
    const warmed = await acquireWorkspaceKernel({
      ...buildArgs("hovered", factory),
      preload: true,
    });
    expect(warmed).not.toBeNull();
    expect(log).toContain("patch:fullSync");
    // A subsequent navigation to that same key reuses the warmed kernel.
    const navigated = await acquireWorkspaceKernel({
      ...buildArgs("hovered", factory),
      preload: false,
    });
    expect(navigated?.feed).toBe(warmed?.feed);
    expect(log.filter((e) => e === "patch:fullSync")).toHaveLength(1);
  });
});
