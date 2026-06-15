// workspaceKernel.ts
//
// The workspace kernel and its single-slot, refcounted registry. A "kernel" is
// the off-React, per-project machinery a workspace needs alive before the
// editor paints: the multicast `MirrorFeed`, the platform mirror session(s)
// attached to it, the seeded mirror state, and the awaited initial findings.
// It is NOT the Effect pipelines (those stay forked in the provider) and NOT
// the React stores (those are still provider-born). The provider CLAIMS a
// kernel from loader data and RELEASES it on unmount — ownership lives here in
// the registry, not in an effect that constructs-then-disposes.
//
// Why a module-level registry rather than provider-scoped construction:
//   - TanStack preloads a route (hover a project in the picker) by running the
//     loader without mounting. The loader builds the kernel; on an empty slot
//     that warms the worker set + findings so the project opens instantly —
//     that is the preload feature. On an OCCUPIED slot, preload must NOT evict
//     the live workspace (the user is still editing the open project), so the
//     loader skips kernel work entirely.
//   - StrictMode double-mounts, HMR remounts, and preload-then-navigate all
//     acquire/release in quick succession. Refcounting + a short dispose grace
//     absorb that churn so we don't tear the worker set down and rebuild it.
//
// HARD CONSTRAINT: at most ONE live kernel (single slot) — low-end field
// machines must never host two worker sets / token mirrors at once. Plus at
// most one *dying* kernel mid-grace (the outgoing project during a swap).

import {
  awaitInitialFindings,
  type InitialFindings,
  NO_INITIAL_FINDINGS,
  seedMirror,
} from "@/app/domain/editor/pipelines/mirrorPatchProducer.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { DirtyBufferStore } from "@/app/state/DirtyBufferStore.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";

import { MirrorFeed } from "./MirrorFeed.ts";
import type {
  MirrorSession,
  MirrorSessionFactory,
} from "./mirrorSessionFactory.ts";

/**
 * Everything the loader must hand the kernel builder to spin up a project's
 * mirror. The stores listed here are the load-time, kernel-internal seed
 * sources (a transient `WorkingFilesStore` the kernel builds from `projectFiles`
 * — the kernel seeds from loader data, NOT the provider's store) plus the
 * already-recovered baseline store. The factory is the platform seam.
 */
export type WorkspaceKernelBuildArgs = {
  /** Stable identity of the project this kernel serves (the workspace key). */
  projectKey: string;
  /** Parsed + crash-recovered book state from the loader. */
  projectFiles: ScriptureBookState[];
  /** Disk baselines the loader's recovery established (read into the seed). */
  workspaceBaselineStore: WorkspaceBaselineStore;
  /** The dirty-buffer store the platform session writes backups through. */
  dirtyBufferStore: DirtyBufferStore;
  dirtyBufferRoot: string;
  /** Platform mirror session factory (web worker / desktop sinks). */
  mirrorSessionFactory: MirrorSessionFactory;
  /**
   * True when the mode disables analysis (plain mode — bytes-only). The kernel
   * still spawns + seeds the mirror (the backup sink needs resident tokens) but
   * skips the initial findings pass, matching the gated live pipelines.
   */
  analysisDisabled: boolean;
};

/** One mounted lifetime's claim on the kernel; released on unmount. */
export type WorkspaceKernelClaim = {
  /** Drop this claim. At refcount 0 the kernel is disposed after a grace. */
  release(): void;
};

/**
 * The loader's reference to a built, warm kernel. The provider reads `feed`
 * (to point its pipelines + result router at) and `initialFindings` (committed
 * into the FindingsStore before the editor Deferred resolves), and takes a
 * `claim()` for the duration of each mount, releasing it on unmount.
 * `generation` is the store generation the seed + initial findings ran at — the
 * provider keeps its store reset coherent with it.
 *
 * Reads need no claim: the loader holds the slot warm via the dispose grace
 * (an unclaimed slot self-disposes after the grace, which also bridges the
 * loader→mount gap and a preload that never navigates). `claim()` is
 * re-entrant — a StrictMode unmount/remount releases then re-claims, and the
 * re-claim cancels the pending grace dispose so the worker set is reused, never
 * torn down underneath the live workspace.
 */
export type WorkspaceKernelHandle = {
  feed: MirrorFeed;
  initialFindings: InitialFindings;
  generation: number;
  claim(): WorkspaceKernelClaim;
};

// --- The kernel itself (a built, ready slot) -------------------------------

type LiveKernel = {
  projectKey: string;
  feed: MirrorFeed;
  session: MirrorSession;
  initialFindings: InitialFindings;
  generation: number;
  refcount: number;
  /** Set while a disposal grace timer is pending; cleared if re-claimed. */
  graceTimer: ReturnType<typeof setTimeout> | null;
};

// The single slot. At most one live kernel; `building` guards against a second
// concurrent build for the same key (StrictMode double-invoke of the loader).
let slot: LiveKernel | null = null;
let building: { projectKey: string; promise: Promise<LiveKernel> } | null =
  null;

// Absorbs StrictMode double-mount, HMR remount, and preload-then-navigate: a
// release that drops the count to 0 waits this long before disposing, so a
// re-claim in the window reuses the live kernel instead of rebuilding it.
const DISPOSE_GRACE_MS = 5_000;

async function buildKernel(
  args: WorkspaceKernelBuildArgs,
): Promise<LiveKernel> {
  const feed = new MirrorFeed();
  // The kernel seeds from loader data, not the provider's store. A transient
  // store wraps `projectFiles` purely so the existing `seedMirror` tokenization
  // path produces seed bytes identical to the store-driven path. Its generation
  // starts at 0 (a fresh store); that is the load generation the provider keeps
  // its own store reset coherent with (see the provider's store reset note).
  const seedStore = new WorkingFilesStore(args.projectFiles);
  const generation = seedStore.generation();

  const session = args.mirrorSessionFactory({
    feed,
    workspaceKey: args.projectKey,
    dirtyBufferRoot: args.dirtyBufferRoot,
    dirtyBufferStore: args.dirtyBufferStore,
  });

  // 3. seedMirrors — full token fan-out from the loader's parsed files.
  seedMirror({
    workingFilesStore: seedStore,
    workspaceBaselineStore: args.workspaceBaselineStore,
    feed,
    generation,
  });

  // 4. awaitEnginesReady — the ready ACK (wasm/engine init complete).
  await session.ready();

  // 5. initialFindings — the awaited project-wide lint + sous, unless plain
  //    mode runs no analysis (then findings are empty, matching the live gate).
  const initialFindings = args.analysisDisabled
    ? NO_INITIAL_FINDINGS
    : await awaitInitialFindings({
        feed,
        generation,
        // Recovery for a load-time `resyncRequest`: re-push the seed exactly as
        // step 3 did. No router is mounted yet to service the resync otherwise.
        reseed: () =>
          seedMirror({
            workingFilesStore: seedStore,
            workspaceBaselineStore: args.workspaceBaselineStore,
            feed,
            generation,
          }),
      });

  return {
    projectKey: args.projectKey,
    feed,
    session,
    initialFindings,
    generation,
    refcount: 0,
    graceTimer: null,
  };
}

function disposeKernel(kernel: LiveKernel): void {
  if (kernel.graceTimer) clearTimeout(kernel.graceTimer);
  kernel.session.dispose();
  if (slot === kernel) slot = null;
}

/**
 * Schedule a grace dispose iff the kernel is idle (no active claims) and none is
 * already pending. Arms the gap between the loader returning and the provider's
 * first claim, the gap between a StrictMode unmount and remount, and a preload
 * that never navigates — all reuse the same window. A `claim()` inside the
 * window cancels it.
 */
function armGraceIfIdle(kernel: LiveKernel): void {
  if (kernel.refcount > 0 || kernel.graceTimer) return;
  kernel.graceTimer = setTimeout(() => {
    kernel.graceTimer = null;
    if (kernel.refcount === 0) disposeKernel(kernel);
  }, DISPOSE_GRACE_MS);
}

/**
 * The loader's reference to the slot. Reads ride the warm slot directly; a
 * `claim()` takes a refcount for one mounted lifetime and cancels any pending
 * grace dispose, so a remount reuses the worker set instead of racing its
 * teardown.
 */
function makeHandle(kernel: LiveKernel): WorkspaceKernelHandle {
  return {
    feed: kernel.feed,
    initialFindings: kernel.initialFindings,
    generation: kernel.generation,
    claim(): WorkspaceKernelClaim {
      kernel.refcount++;
      if (kernel.graceTimer) {
        clearTimeout(kernel.graceTimer);
        kernel.graceTimer = null;
      }
      let released = false;
      return {
        release() {
          if (released) return;
          released = true;
          kernel.refcount--;
          armGraceIfIdle(kernel);
        },
      };
    },
  };
}

/**
 * Acquire the kernel for `projectKey`, building it if needed.
 *
 *   - Same key, live (or grace-pending): reuse it, refcount++.
 *   - Same key, currently building: await that build, then claim.
 *   - Different key, slot occupied:
 *       · `preload: true`  → DO NOT evict the live workspace; return null so the
 *         loader skips kernel work (parse-only). Preload never evicts.
 *       · `preload: false` → an actual navigation: dispose the old kernel and
 *         build the new one (single slot).
 *   - Empty slot: build and warm (a `preload` here warms the slot — the
 *     feature: hover a project → it opens with findings ready).
 *
 * Returns a handle the caller READS from and `claim()`s per mount; the slot is
 * held warm by the dispose grace, not by acquiring. Returns null ONLY for the
 * preload-while-occupied case; every navigation (preload false) resolves to a
 * handle.
 */
export async function acquireWorkspaceKernel(
  args: WorkspaceKernelBuildArgs & { preload: boolean },
): Promise<WorkspaceKernelHandle | null> {
  const { projectKey, preload } = args;

  // Same key already live (or in its grace window): reuse.
  if (slot && slot.projectKey === projectKey) {
    armGraceIfIdle(slot);
    return makeHandle(slot);
  }

  // Same key currently building (StrictMode double loader invoke, or a
  // preload then a navigation racing): join that build.
  if (building && building.projectKey === projectKey) {
    const kernel = await building.promise;
    armGraceIfIdle(kernel);
    return makeHandle(kernel);
  }

  // A DIFFERENT key wants the slot.
  if (slot || (building && building.projectKey !== projectKey)) {
    // Preload must never evict the occupied/building slot — the open project
    // keeps its single worker set. The loader proceeds parse-only.
    if (preload) return null;
    // A real navigation: dispose the outgoing kernel (single slot, and the
    // grace would otherwise leave a second kernel briefly alive).
    if (slot) disposeKernel(slot);
    // If a build for a different key is in flight, let it settle then dispose
    // it before taking the slot — we never keep two live worker sets.
    if (building) {
      const stale = building.promise;
      building = null;
      void stale.then((k) => {
        if (k !== slot) disposeKernel(k);
      });
    }
  }

  // Build for this key, guarding against a concurrent second build.
  const promise = buildKernel(args);
  building = { projectKey, promise };
  let kernel: LiveKernel;
  try {
    kernel = await promise;
  } finally {
    if (building?.promise === promise) building = null;
  }
  // A navigation to a *different* key could have landed while we built; if the
  // slot was taken by someone else, dispose ours rather than overwrite.
  if (slot && slot.projectKey !== projectKey) {
    disposeKernel(kernel);
    // Fall through to reuse whatever now occupies the slot only if it matches;
    // otherwise the caller (loader) will have its own handle from that path.
    if (slot.projectKey === projectKey) {
      armGraceIfIdle(slot);
      return makeHandle(slot);
    }
  }
  slot = kernel;
  armGraceIfIdle(kernel);
  return makeHandle(kernel);
}

/** Test-only: tear the slot down so each test starts from an empty registry. */
export function __resetWorkspaceKernelRegistryForTests(): void {
  if (slot) {
    if (slot.graceTimer) clearTimeout(slot.graceTimer);
    slot.session.dispose();
  }
  slot = null;
  building = null;
}
