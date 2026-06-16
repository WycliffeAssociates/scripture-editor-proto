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
import type { MirrorTraceEntry } from "./mirrorTrace.ts";

/** One-time init: tells the worker where its dirty-buffer storage root lives. */
export type WorkerInitMessage = {
  kind: "init";
  workspaceKey: string;
  dirtyBufferRoot: string;
  /** Forward the main thread's diagnostic trace flag (the worker has no
   *  localStorage to read it from itself). */
  trace: boolean;
};

export type ToWorkerMessage =
  | WorkerInitMessage
  | { kind: "patch"; patch: MirrorPatch }
  | { kind: "command"; command: MirrorCommand };

export type FromWorkerMessage =
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
  | { kind: "result"; result: MirrorResult }
  // A diagnostic trace entry recorded inside the worker, relayed for the main
  // thread to log in sequence with its own (the worker can't reach the page
  // console the harness captures). Only emitted when init carried `trace`.
  | { kind: "trace"; entry: MirrorTraceEntry };
