// workspaceMirror.worker.ts
//
// The web workspace-mirror worker. Holds ONE `WorkspaceMirror` in module scope:
// the resident token mirror plus lint wasm, resident Galley, and the OPFS dirty-buffer
// backup write — all off the main thread. It is a thin pump: patches/commands
// in on the FIFO channel, results out. The behavior lives in `WorkspaceMirror`
// (testable without a Worker); this file only wires the engines and marshals
// messages.

import type {
  FromWorkerMessage,
  ToWorkerMessage,
} from "@/app/domain/mirror/workerMessages.ts";
import { WorkspaceMirror } from "@/app/domain/mirror/WorkspaceMirror.ts";

import { makeWebMirrorEngines } from "./webMirrorEngines.ts";

let mirror: WorkspaceMirror | null = null;

function post(message: FromWorkerMessage, transfer: Transferable[] = []): void {
  (
    self as unknown as {
      postMessage(message: unknown, transfer?: Transferable[]): void;
    }
  ).postMessage(message, transfer);
}

function postTraced(
  message: FromWorkerMessage,
  transfer: Transferable[],
  traceId: number | undefined,
): void {
  const label =
    traceId === undefined
      ? null
      : `sous:transport.workerToMain.post:${traceId}`;
  if (import.meta.env.DEV && label) console.time(label);
  try {
    post({ ...message, traceId }, transfer);
  } finally {
    if (import.meta.env.DEV && label) console.timeEnd(label);
  }
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
  const isBackupCommand =
    event.data.kind === "command" &&
    (event.data.command.kind === "writeBackup" ||
      event.data.command.kind === "clearBackup");

  const run = (): Promise<void> =>
    (async () => {
      const traceId = event.data.traceId;
      const queueLabel =
        traceId === undefined ? null : `sous:worker.queueWait:${traceId}`;
      if (import.meta.env.DEV && queueLabel) console.timeEnd(queueLabel);
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

  if (import.meta.env.DEV && event.data.traceId !== undefined) {
    console.time(`sous:worker.queueWait:${event.data.traceId}`);
  }
};

async function handleMessage(message: ToWorkerMessage): Promise<void> {
  switch (message.kind) {
    case "init": {
      mirror = new WorkspaceMirror(
        makeWebMirrorEngines({
          workspaceKey: message.workspaceKey,
          dirtyBufferRoot: message.dirtyBufferRoot,
        }),
        (result) =>
          postTraced(
            { kind: "result", result },
            result.kind === "galleyResult"
              ? [result.packed]
              : result.kind === "publishBraidResult" && result.publication
                ? [result.publication.packed]
                : [],
            undefined,
          ),
      );
      console.info("[mirror.worker] initialized (wasm engines ready)");
      // ACK init so the main side's load contract can await readiness (and the
      // seed + initial analyze it posts behind this) deterministically.
      post({ kind: "ready" });
      return;
    }
    case "patch": {
      const traceId = message.traceId;
      const label =
        traceId === undefined
          ? null
          : `sous:worker.patch:${message.patch.kind}:${message.patch.generation}:${traceId}`;
      if (import.meta.env.DEV && label) console.time(label);
      try {
        mirror?.applyPatch(message.patch);
      } finally {
        if (import.meta.env.DEV && label) console.timeEnd(label);
      }
      return;
    }
    case "command": {
      if (!mirror) return;
      const suffix = message.traceId === undefined ? "na" : message.traceId;
      const label = `sous:worker.command:${message.command.kind}:${message.command.generation}:${suffix}`;
      if (import.meta.env.DEV) console.time(label);
      try {
        const result = await mirror.runCommand(message.command);
        postTraced(
          { kind: "result", result },
          result.kind === "galleyResult"
            ? [result.packed]
            : result.kind === "publishBraidResult" && result.publication
              ? [result.publication.packed]
              : [],
          message.traceId,
        );
      } catch (error: unknown) {
        const command = message.command;
        if (
          command.kind === "formatBraid" ||
          command.kind === "applyBraidFix" ||
          command.kind === "publishBraid"
        ) {
          postTraced(
            {
              kind: "result",
              result: {
                kind: "braidCommandError",
                requestId: command.requestId,
                operation: command.kind,
                error: error instanceof Error ? error.message : String(error),
              },
            },
            [],
            message.traceId,
          );
          return;
        }
        throw error;
      } finally {
        if (import.meta.env.DEV) console.timeEnd(label);
      }
      return;
    }
    case "dispose": {
      mirror?.dispose();
      mirror = null;
      post({ kind: "disposed" });
      return;
    }
  }
}

// Channel-open ACK, posted from the module's synchronous tail (the handler
// above is registered). See `hello` in workerMessages.ts for why sessions
// must not post anything before receiving this.
post({ kind: "hello" });
