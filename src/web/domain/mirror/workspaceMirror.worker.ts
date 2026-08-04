// workspaceMirror.worker.ts
//
// The web worker is a transport pump around the resident Braid/Galley host.

import type {
  LoadProjectResult,
  MirrorResult,
} from "@/app/domain/mirror/mirrorProtocol.ts";
import {
  describeResultPayload,
  transferablesOf,
} from "@/app/domain/mirror/resultTransferables.ts";
import {
  createPhaseRecorder,
  type PhaseRecorder,
} from "@/app/domain/mirror/traceLog.ts";
import type {
  FromWorkerMessage,
  ToWorkerMessage,
} from "@/app/domain/mirror/workerMessages.ts";

import {
  makeWebMirrorEngines,
  type WebMirrorEngines,
} from "./webMirrorEngines.ts";

let engines: WebMirrorEngines | null = null;

function post(message: FromWorkerMessage, transfer: Transferable[] = []): void {
  (
    self as unknown as {
      postMessage(message: unknown, transfer?: Transferable[]): void;
    }
  ).postMessage(message, transfer);
}

/** Post a result, stamped so main can price the crossing. See `wire`. */
function postResult(result: MirrorResult): void {
  const transfer = transferablesOf(result);
  post(
    {
      kind: "result",
      result,
      wire: import.meta.env.DEV
        ? {
            postedAt: performance.timeOrigin + performance.now(),
            shape: describeResultPayload(result),
          }
        : undefined,
    },
    transfer,
  );
}

// State-changing patches and analysis commands share one chain so each
// analysis observes all earlier patches. Crash-recovery persistence has its own
// ordered lane: it snapshots only after the state barrier that existed when
// the backup was requested, then performs its slow filesystem work without
// holding up Galley. Keeping backups ordered prevents an older write from
// overtaking a newer one while the separate lane removes their queue pressure.
let stateChain: Promise<void> = Promise.resolve();
let backupChain: Promise<void> = Promise.resolve();

self.onmessage = (event: MessageEvent<ToWorkerMessage>) => {
  // Open this generation's recorder NOW, at arrival, not when work starts:
  // there is one worker, so the gap between the two IS the queue wait, and it
  // shows up as the first phase's offset rather than going unmeasured.
  if (import.meta.env.DEV && event.data.kind !== "init") {
    const generation =
      event.data.kind === "patch"
        ? event.data.patch.generation
        : event.data.kind === "command"
          ? event.data.command.generation
          : undefined;
    if (generation !== undefined) phasesFor(generation);
  }
  const isBackupCommand =
    event.data.kind === "command" &&
    (event.data.command.kind === "writeBackup" ||
      event.data.command.kind === "clearBackup");

  const run = (): Promise<void> =>
    (async () => {
      try {
        await handleMessage(event.data);
      } catch (error: unknown) {
        // A failed init (wasm load) or command must be loud: with the mirror
        // null or stale every later message no-ops and the symptom is silence.
        console.error(
          `[mirror.worker] ${event.data.kind} failed`,
          error instanceof Error ? (error.stack ?? error.message) : error,
        );
      }
    })();

  if (isBackupCommand) {
    const stateBarrier = stateChain;
    backupChain = backupChain.then(() => stateBarrier).then(run);
  } else {
    stateChain = stateChain.then(run);
  }
};

async function handleMessage(message: ToWorkerMessage): Promise<void> {
  switch (message.kind) {
    case "init": {
      engines = makeWebMirrorEngines({
        workspaceKey: message.workspaceKey,
        dirtyBufferRoot: message.dirtyBufferRoot,
        backgroundResult: (result) => postResult(result),
      });
      console.info("[mirror.worker] initialized (wasm engines ready)");
      // ACK init so the main side's load contract can await readiness (and the
      // seed + initial analyze it posts behind this) deterministically.
      post({ kind: "ready" });
      return;
    }
    case "patch": {
      // Patches are fire-and-forget, so their cost rides home on the next
      // result for the same generation — see `drainWorkerPhases`.
      const phases = phasesFor(message.patch.generation);
      phases.timeSync(`worker:braid:${message.patch.kind}`, () =>
        engines?.applyPatch(message.patch),
      );
      return;
    }
    case "command": {
      if (!engines) return;
      const command = message.command;
      try {
        // No wrapper phase here: a command that does one thing would record
        // the same span twice, and the pair is indistinguishable once timer
        // resolution rounds it. Commands record their own work.
        const phases = phasesFor(command.generation);
        const result: MirrorResult =
          command.kind === "loadProject"
            ? await loadProject(engines, command)
            : await engines.runCommand(command, phases);
        postResult(withWorkerPhases(result));
      } catch (error: unknown) {
        if (
          command.kind === "formatBraid" ||
          command.kind === "applyBraidFix" ||
          command.kind === "publishBraid"
        ) {
          postResult({
            kind: "braidCommandError",
            requestId: command.requestId,
            operation: command.kind,
            error: error instanceof Error ? error.message : String(error),
          });
          return;
        }
        throw error;
      }
      return;
    }
    case "dispose": {
      engines?.dispose();
      engines = null;
      post({ kind: "disposed" });
      return;
    }
  }
}

async function loadProject(
  host: WebMirrorEngines,
  command: Extract<ToWorkerMessage, { kind: "command" }>["command"] & {
    kind: "loadProject";
  },
): Promise<LoadProjectResult> {
  try {
    return {
      kind: "loadProjectResult",
      ...(await host.loadProject(command)),
      ranAtGeneration: command.generation,
      projectPath: command.projectPath,
    };
  } catch (error) {
    return {
      kind: "loadProjectResult",
      state: "rejected",
      ranAtGeneration: command.generation,
      projectPath: command.projectPath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// --- Edit-trace phases ------------------------------------------------------
//
// The worker cannot print into main's trace, so it records what it did per
// store generation and the next result for that generation carries it home.
// Patches have no result of their own, which is exactly why this is keyed by
// generation rather than by request.

const phasesByGeneration = new Map<number, PhaseRecorder>();
/** Generations retained; a generation whose result never lands must not leak. */
const MAX_TRACKED_GENERATIONS = 8;

function phasesFor(generation: number): PhaseRecorder {
  const existing = phasesByGeneration.get(generation);
  if (existing) return existing;
  const created = createPhaseRecorder();
  phasesByGeneration.set(generation, created);
  while (phasesByGeneration.size > MAX_TRACKED_GENERATIONS) {
    const oldest = phasesByGeneration.keys().next().value;
    if (oldest === undefined) break;
    phasesByGeneration.delete(oldest);
  }
  return created;
}

/** Attach and clear this generation's phases, for results that carry them. */
function withWorkerPhases(result: MirrorResult): MirrorResult {
  if (!import.meta.env.DEV) return result;
  if (result.kind !== "lintResult" && result.kind !== "galleyResult") {
    return result;
  }
  const recorder = phasesByGeneration.get(result.ranAtGeneration);
  if (!recorder || recorder.phases.length === 0) return result;
  phasesByGeneration.delete(result.ranAtGeneration);
  return { ...result, hostPhases: recorder.phases };
}

// Channel-open ACK, posted from the module's synchronous tail (the handler
// above is registered). See `hello` in workerMessages.ts for why sessions
// must not post anything before receiving this.
post({ kind: "hello" });
