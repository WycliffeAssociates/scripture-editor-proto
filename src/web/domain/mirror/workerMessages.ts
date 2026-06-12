// workerMessages.ts
//
// The wire envelope between the main thread and the workspace-mirror worker.
// One FIFO postMessage channel carries patches and commands in order (the only
// ordering web needs); results come back the same way. The payloads are the
// transport-agnostic protocol types — this module only wraps them with a
// direction tag and the worker's init handshake.

import type {
  MirrorCommand,
  MirrorPatch,
  MirrorResult,
} from "@/app/domain/mirror/mirrorProtocol.ts";

/** One-time init: tells the worker where its OPFS storage roots live. */
export type WorkerInitMessage = {
  kind: "init";
  workspaceKey: string;
  dirtyBufferRoot: string;
};

export type ToWorkerMessage =
  | WorkerInitMessage
  | { kind: "patch"; patch: MirrorPatch }
  | { kind: "command"; command: MirrorCommand };

export type FromWorkerMessage = { kind: "result"; result: MirrorResult };
