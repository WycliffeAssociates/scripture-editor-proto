// workspaceKernel.ts
//
// The workspace kernel and its single-slot, refcounted registry. A "kernel" is
// the off-React, per-project machinery a workspace needs alive before the
// editor paints: the multicast `MirrorFeed`, the platform mirror session
// attached to it, the seeded mirror state, and the first-paint findings. It is
// NOT the Effect pipelines (those stay forked in the provider) and NOT the React
// stores (those are still provider-born). The provider CLAIMS a kernel from
// loader data and RELEASES it on unmount — ownership lives here in the registry,
// not in an effect that constructs-then-disposes.
//
// Why a module-level registry rather than provider-scoped construction:
//   - TanStack preloads a route (hover a project in the picker) by running the
//     loader without mounting. The loader builds the kernel; on an empty slot
//     that warms the worker set + findings so the project opens instantly —
//     that is the preload feature. On an OCCUPIED slot, preload must NOT evict
//     the live workspace (the user is still editing the open project).
//   - StrictMode double-mounts, HMR remounts, and preload-then-navigate all
//     acquire/release in quick succession. Refcounting + a short dispose grace
//     absorb that churn so we don't tear the worker set down and rebuild it.
//
// HARD CONSTRAINT: at most ONE live kernel (single slot) — low-end field
// machines must never host two worker sets / token mirrors at once.
//
// ARBITRATION COMES FIRST. `reserveWorkspaceSlot` decides who owns the slot
// BEFORE the caller creates a session or loads anything, because loading is not
// a private act: desktop's resident Braid/Galley live in one process-wide Tauri
// state, so preparing a second session and then discovering the slot was taken
// would already have overwritten the live workspace's corpus — and disposing
// that "spare" session would reset the survivor's state as well. A reservation
// also means a same-project reopen serves the load it already did rather than
// re-reading and re-parsing the corpus to throw the result away.

import type { SousConfig } from "scripture-sous-chef-web";
import type { LintIssue } from "usfm-onion-web";

import type { RecoveryReportEntry } from "@/app/domain/api/recoverDirtyBuffers.ts";
import { reduceProjectLocalLint } from "@/app/domain/editor/pipelines/localLintPipeline.ts";
import {
  awaitInitialFindings,
  type InitialFindings,
  NO_INITIAL_FINDINGS,
  seedMirror,
  seedResidentMirror,
} from "@/app/domain/editor/pipelines/mirrorPatchProducer.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { DirtyBufferStore } from "@/app/state/DirtyBufferStore.ts";
import type { RecoveredConflictTracker } from "@/app/state/RecoveredConflictTracker.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";
import type { GalleyAnalysis } from "@/core/domain/sous/galleyTypes.ts";

import type { MirrorFeed } from "./MirrorFeed.ts";
import type { MirrorSession } from "./mirrorSessionFactory.ts";
import { logStartupPhase, startupElapsed } from "./startupLog.ts";

/**
 * Everything the loader must hand the kernel builder after the resident host
 * has loaded the project. `braidFindings`/`galley` are the load's OWN results,
 * materialized on main — the load is the initial analysis, so a clean open runs
 * no follow-up lint or Galley pass.
 */
export type WorkspaceKernelBuildArgs = {
  /** Stable identity of the project this kernel serves (the workspace key). */
  projectKey: string;
  /** Parsed + crash-recovered book state from the loader. */
  projectFiles: ScriptureBookState[];
  /** Disk baselines the loader's recovery established (read into the seed). */
  workspaceBaselineStore: WorkspaceBaselineStore;
  /**
   * True when the mode disables analysis (plain mode — bytes-only). The kernel
   * still seeds the mirror (the backup sink needs resident metadata) but
   * publishes no findings, matching the gated live pipelines.
   */
  analysisDisabled: boolean;
  proofreadingConfig?: SousConfig;
  feed: MirrorFeed;
  session: MirrorSession;
  /** Braid findings for the loaded corpus, by book code. */
  braidFindings: ReadonlyMap<string, readonly LintIssue[]> | null;
  /** Galley's analysis of the same corpus. */
  galley: GalleyAnalysis | null;
  /**
   * Books whose working content came from a crash backup rather than disk. The
   * resident corpus was loaded from disk, so these — and only these — have to
   * be republished and re-analyzed.
   */
  recoveredBookCodes: readonly string[];
  /** The loader payload a same-project reopen should be served, unchanged. */
  load: WorkspaceKernelLoad;
};

/**
 * The loader result the kernel owns for the lifetime of the open project. A
 * reopen of the same project returns these exact objects: the provider is not
 * remounted across a same-project reopen, so handing it a second set of
 * workspace stores — or a re-read of a corpus it has since edited — would
 * silently split its state.
 */
export type WorkspaceKernelLoad = {
  projectFiles: ScriptureBookState[];
  workspaceBaselineStore: WorkspaceBaselineStore;
  recoveredConflictTracker: RecoveredConflictTracker;
  dirtyBufferStore: DirtyBufferStore;
  restoredBookCodes: string[];
  conflictedBookCodes: string[];
  recoveryReportEntries: RecoveryReportEntry[];
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
  load: WorkspaceKernelLoad;
  claim(): WorkspaceKernelClaim;
};

// --- The kernel itself (a built, ready slot) -------------------------------

type LiveKernel = {
  projectKey: string;
  feed: MirrorFeed;
  session: MirrorSession;
  initialFindings: InitialFindings;
  generation: number;
  load: WorkspaceKernelLoad;
  refcount: number;
  /** Set while a disposal grace timer is pending; cleared if re-claimed. */
  graceTimer: ReturnType<typeof setTimeout> | null;
};

type Reservation = {
  projectKey: string;
  settled: Promise<LiveKernel | null>;
  resolve: (kernel: LiveKernel | null) => void;
  /** Set when a later navigation took the slot while this load was in flight. */
  superseded: boolean;
};

// The single slot, plus at most one reservation held across an in-flight load.
let slot: LiveKernel | null = null;
let reservation: Reservation | null = null;

// Absorbs StrictMode double-mount, HMR remount, and preload-then-navigate: a
// release that drops the count to 0 waits this long before disposing, so a
// re-claim in the window reuses the live kernel instead of rebuilding it.
const DISPOSE_GRACE_MS = 5_000;

async function buildKernel(
  args: WorkspaceKernelBuildArgs,
): Promise<LiveKernel> {
  const feed = args.feed;
  // The kernel seeds from loader data, not the provider's store. A transient
  // store wraps `projectFiles` purely so the existing seed path produces the
  // same bytes the store-driven path would. Its generation starts at 0 (a fresh
  // store); that is the load generation the provider keeps its own store reset
  // coherent with (see the provider's store reset note).
  const seedStore = new WorkingFilesStore(args.projectFiles);
  const generation = seedStore.generation();

  // The resident host already owns the token corpus, so a clean open sends
  // metadata only. Crash-recovered books are the exception: their working
  // content is the backup, not the disk bytes the host loaded, so each is
  // republished as a complete book.
  const seedStartedAt = startupElapsed();
  seedResidentMirror({
    workingFilesStore: seedStore,
    workspaceBaselineStore: args.workspaceBaselineStore,
    feed,
    generation,
    recoveredBookCodes: args.recoveredBookCodes,
  });
  logStartupPhase(
    "main:resident-seed",
    {
      books: args.projectFiles.length,
      recovered: args.recoveredBookCodes.length,
    },
    { startedAt: seedStartedAt, durationMs: startupElapsed() - seedStartedAt },
  );

  const findingsStartedAt = startupElapsed();
  const initialFindings = args.analysisDisabled
    ? NO_INITIAL_FINDINGS
    : {
        ...(await residentFindings(args, feed, generation, seedStore)),
        localLint: reduceProjectLocalLint(seedStore.read()),
      };
  logStartupPhase(
    "main:initial-findings",
    {
      source:
        args.recoveredBookCodes.length > 0 ? "recovery-reanalysis" : "load",
      braid: initialFindings.lint?.size ?? 0,
      galley: initialFindings.sous?.cacheState ?? "none",
      localLint: Object.keys(initialFindings.localLint).length,
    },
    {
      startedAt: findingsStartedAt,
      durationMs: startupElapsed() - findingsStartedAt,
    },
  );

  return {
    projectKey: args.projectKey,
    feed,
    session: args.session,
    initialFindings,
    generation,
    load: args.load,
    refcount: 0,
    graceTimer: null,
  };
}

/**
 * First-paint findings. A clean open already has them: the load verified and
 * materialized Braid's published container and answered Galley in the same
 * pass. Only a crash-recovered open has to analyze, because the books it
 * restored differ from the corpus the host loaded from disk — and it analyzes
 * with `cachePolicy: "none"`, since unsaved recovered content must never be
 * written into a cache that claims to describe what is on disk.
 */
async function residentFindings(
  args: WorkspaceKernelBuildArgs,
  feed: MirrorFeed,
  generation: number,
  seedStore: WorkingFilesStore,
): Promise<Pick<InitialFindings, "lint" | "sous">> {
  if (args.recoveredBookCodes.length === 0) {
    return { lint: args.braidFindings, sous: args.galley };
  }
  return awaitInitialFindings({
    feed,
    generation,
    cachePolicy: "none",
    // Recovery for a load-time `resyncRequest`: no router is mounted yet to
    // service one, so re-push the complete corpus here.
    reseed: () =>
      seedMirror({
        workingFilesStore: seedStore,
        workspaceBaselineStore: args.workspaceBaselineStore,
        feed,
        generation,
      }),
    config: args.proofreadingConfig,
  });
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

function makeHandle(kernel: LiveKernel): WorkspaceKernelHandle {
  return {
    feed: kernel.feed,
    initialFindings: kernel.initialFindings,
    generation: kernel.generation,
    load: kernel.load,
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

/** The slot is already serving this project; the caller loads nothing. */
export type WorkspaceSlotReuse = {
  kind: "reuse";
  handle: WorkspaceKernelHandle;
};

/** A preload that would have evicted the live workspace. The caller stops. */
export type WorkspaceSlotDeclined = { kind: "declined" };

/**
 * The caller owns the slot and may now create its session and load. It must
 * finish with exactly one of `install` (success) or `abort` (failure), or the
 * registry stays reserved and the next open blocks behind it.
 */
export type WorkspaceSlotGrant = {
  kind: "granted";
  /**
   * Build and install the kernel. Returns null when a later navigation took the
   * slot mid-load: this open is moot, its session is disposed, and the caller
   * returns a kernel-less loader result (the route renders its pending state).
   */
  install(
    args: Omit<WorkspaceKernelBuildArgs, "projectKey">,
  ): Promise<WorkspaceKernelHandle | null>;
  /** Release the reservation after a failed load. */
  abort(): void;
};

export type WorkspaceSlotReservation =
  | WorkspaceSlotReuse
  | WorkspaceSlotDeclined
  | WorkspaceSlotGrant;

/**
 * Decide who owns the single kernel slot, before any resident state is touched.
 *
 *   - Same key, live (or grace-pending): reuse it; the caller loads nothing.
 *   - Same key, currently loading: await that load and reuse its kernel.
 *   - Different key, slot occupied:
 *       · `preload: true`  → decline. Preload never evicts.
 *       · `preload: false` → dispose the outgoing kernel NOW and grant the slot,
 *         so the incoming load never runs against another project's resident
 *         state and the outgoing teardown never lands on top of it.
 *   - Empty slot: grant (a `preload` here warms the slot — the feature).
 */
export async function reserveWorkspaceSlot(args: {
  projectKey: string;
  preload: boolean;
}): Promise<WorkspaceSlotReservation> {
  const { projectKey, preload } = args;

  const startedAt = startupElapsed();
  const decided = (state: string): void =>
    logStartupPhase(
      "main:slot",
      { workspace: projectKey, state },
      { startedAt, durationMs: startupElapsed() - startedAt },
    );

  if (slot && slot.projectKey === projectKey) {
    armGraceIfIdle(slot);
    decided("reuse");
    return { kind: "reuse", handle: makeHandle(slot) };
  }

  // A load for this same key is already in flight (StrictMode double loader
  // invoke, or preload racing a navigation): join it rather than loading twice.
  if (reservation && reservation.projectKey === projectKey) {
    const kernel = await reservation.settled;
    if (kernel) {
      armGraceIfIdle(kernel);
      decided("joined");
      return { kind: "reuse", handle: makeHandle(kernel) };
    }
    // That attempt failed or was superseded; fall through and try again.
  }

  if (slot || reservation) {
    if (preload) {
      decided("declined");
      return { kind: "declined" };
    }
    // A real navigation. Take the slot down before granting it, so the incoming
    // load is the only thing touching resident state.
    if (slot) disposeKernel(slot);
    if (reservation) reservation.superseded = true;
  }

  let resolve: (kernel: LiveKernel | null) => void = () => {};
  const settled = new Promise<LiveKernel | null>((resolveSettled) => {
    resolve = resolveSettled;
  });
  const granted: Reservation = {
    projectKey,
    settled,
    resolve,
    superseded: false,
  };
  reservation = granted;
  decided("granted");

  const finish = (kernel: LiveKernel | null): void => {
    granted.resolve(kernel);
    if (reservation === granted) reservation = null;
  };

  return {
    kind: "granted",
    async install(buildArgs) {
      let kernel: LiveKernel;
      try {
        kernel = await buildKernel({ ...buildArgs, projectKey });
      } catch (error) {
        buildArgs.session.dispose();
        finish(null);
        throw error;
      }
      if (granted.superseded || (slot && slot.projectKey !== projectKey)) {
        disposeKernel(kernel);
        finish(null);
        return null;
      }
      slot = kernel;
      armGraceIfIdle(kernel);
      finish(kernel);
      return makeHandle(kernel);
    },
    abort() {
      finish(null);
    },
  };
}

/** Test-only: tear the slot down so each test starts from an empty registry. */
export function __resetWorkspaceKernelRegistryForTests(): void {
  if (slot) {
    if (slot.graceTimer) clearTimeout(slot.graceTimer);
    slot.session.dispose();
  }
  slot = null;
  reservation = null;
}
