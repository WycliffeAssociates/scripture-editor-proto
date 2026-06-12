// workerMessages.ts
//
// The wire envelope between the main thread and a worker-hosted mirror. One
// FIFO postMessage channel carries patches and commands in order (the only
// ordering web needs); results come back the same way. The payloads are the
// transport-agnostic protocol types — this module only wraps them with a
// direction tag and the worker's init handshake. Shared by the web
// workspace-mirror worker and the desktop backup worker (both host a
// `WorkspaceMirror` behind the same channel).

import type {
  MirrorCommand,
  MirrorPatch,
  MirrorResult,
} from "./mirrorProtocol.ts";

/** One-time init: tells the worker where its dirty-buffer storage root lives. */
export type WorkerInitMessage = {
  kind: "init";
  workspaceKey: string;
  dirtyBufferRoot: string;
};

export type ToWorkerMessage =
  | WorkerInitMessage
  | { kind: "patch"; patch: MirrorPatch }
  | { kind: "command"; command: MirrorCommand };

export type FromWorkerMessage =
  // `ready` is the init ACK: the worker posts it once its async init (wasm
  // marker catalog + engines) has completed, so the main side can await the
  // load contract instead of firing the seed + initial analyze blind. On the
  // FIFO postMessage channel every later patch/command is already ordered
  // behind init; the ACK lets load *await* that ordering rather than assume it.
  { kind: "ready" } | { kind: "result"; result: MirrorResult };
