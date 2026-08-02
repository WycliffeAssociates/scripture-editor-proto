// workerMessages.ts
//
// The wire envelope between the main thread and a worker-hosted mirror. One
// FIFO postMessage channel carries patches and commands in order (the only
// ordering web needs); results come back the same way. The payloads are the
// transport-agnostic protocol types — this module only wraps them with a
// direction tag and the worker's init handshake. Shared by the web
// workspace-mirror worker (which hosts a `WorkspaceMirror` behind the same
// channel).

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

type WorkerTraceEnvelope = { traceId?: number };

export type ToWorkerMessage =
  | (WorkerInitMessage & WorkerTraceEnvelope)
  | ({ kind: "patch"; patch: MirrorPatch } & WorkerTraceEnvelope)
  | ({ kind: "command"; command: MirrorCommand } & WorkerTraceEnvelope)
  | ({ kind: "dispose" } & WorkerTraceEnvelope);

export type FromWorkerMessage = (
// `hello` is the channel-open ACK: the worker posts it from its module's
// synchronous tail, once `self.onmessage` is registered. It exists because
// Chromium unblocks a module worker's message port at the first top-level
// await in its IMPORT graph (the wasm deps have one) — anything posted
// before evaluation completes is dispatched into that window with no
// handler and silently dropped. Sessions therefore buffer every outgoing
// message until `hello` arrives, then flush in order.
| { kind: "hello" }
  // `ready` is the init ACK: the worker posts it once its async init (wasm
  // marker catalog + engines) has completed, so the main side can await the
  // load contract instead of firing the seed + initial analyze blind. On the
  // FIFO postMessage channel every later patch/command is already ordered
  // behind init; the ACK lets load *await* that ordering rather than assume it.
  | { kind: "ready" }
  | { kind: "disposed" }
  | { kind: "result"; result: MirrorResult }
) &
  WorkerTraceEnvelope;
