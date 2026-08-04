// workerMessages.ts
//
// The wire envelope between the main thread and a worker-hosted mirror. One
// FIFO postMessage channel carries patches and commands in order (the only
// ordering web needs); results come back the same way. The payloads are the
// transport-agnostic protocol types — this module only wraps them with a
// direction tag and the worker's init handshake.

import type { WireReport } from "./editTrace.ts";
import type {
  HostCommand,
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
  | { kind: "command"; command: HostCommand }
  | { kind: "dispose" };

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
  | { kind: "disposed" }
  | {
      kind: "result";
      result: MirrorResult;
      /**
       * DEV only. What the worker measured on its OWN clock about this result:
       * how long serialising it took (`postMessage` copies synchronously in
       * the sender, so timing that call is the copy cost), how long the worker
       * spent on this generation in total, and what the payload is made of.
       *
       * Deliberately not a timestamp. Contexts do not share a clock, so main
       * subtracting a worker instant from its own measures skew as much as
       * duration; main pairs these with its own round trip instead.
       */
      wire?: WireReport;
    };
