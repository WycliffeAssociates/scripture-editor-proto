// WorkerMirrorSession.ts
//
// Main-thread handle to the web workspace-mirror worker. It is the feed's one
// sink today: patches/commands posted to the worker on the FIFO channel,
// results delivered back into the `MirrorFeed`. The worker is a Vite module
// worker so its imports (wasm onion/sous, OPFS) bundle like the rest of the app.

import type { MirrorFeed } from "@/app/domain/mirror/MirrorFeed.ts";
import type {
  MirrorCommand,
  MirrorPatch,
} from "@/app/domain/mirror/mirrorProtocol.ts";
import type { MirrorSession } from "@/app/domain/mirror/mirrorSessionFactory.ts";
import {
  isMirrorTraceEnabled,
  logRelayedMirrorTrace,
  mirrorTrace,
} from "@/app/domain/mirror/mirrorTrace.ts";
import type {
  FromWorkerMessage,
  ToWorkerMessage,
} from "@/app/domain/mirror/workerMessages.ts";

export class WorkerMirrorSession implements MirrorSession {
  private readonly worker: Worker;
  private readonly removeSink: () => void;
  // Resolved when the worker posts its `ready` ACK (wasm init complete). The
  // load contract awaits this before posting the seed + initial analyze.
  private readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;

  constructor(args: {
    feed: MirrorFeed;
    workspaceKey: string;
    dirtyBufferRoot: string;
  }) {
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    this.worker = new Worker(
      new URL("./workspaceMirror.worker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker.onmessage = (event: MessageEvent<FromWorkerMessage>) => {
      if (event.data.kind === "hello") {
        this.flushPending();
        return;
      }
      if (event.data.kind === "ready") {
        this.resolveReady();
        return;
      }
      if (event.data.kind === "trace") {
        logRelayedMirrorTrace(event.data.entry);
        return;
      }
      if (event.data.kind === "result") {
        const r = event.data.result;
        mirrorTrace("session.recv.result", {
          kind: r.kind,
          ranAtGen: "ranAtGeneration" in r ? r.ranAtGeneration : undefined,
          requestId: "requestId" in r ? r.requestId : undefined,
          books: "byBook" in r ? Object.keys(r.byBook as object) : undefined,
        });
        args.feed.deliverResult(r);
      }
    };
    // A worker that fails to load or throws at top level otherwise dies
    // silently — and with it every pipeline feeding through this sink.
    this.worker.onerror = (event) => {
      console.error("[mirror] workspace-mirror worker error", event);
    };
    this.worker.onmessageerror = (event) => {
      console.error("[mirror] workspace-mirror worker message error", event);
    };
    this.post({
      kind: "init",
      workspaceKey: args.workspaceKey,
      dirtyBufferRoot: args.dirtyBufferRoot,
      trace: isMirrorTraceEnabled(),
    });
    // Register as a sink — patches/commands the producer/pipelines write now
    // reach the worker.
    this.removeSink = args.feed.addSink({
      pushPatch: (patch: MirrorPatch) => this.post({ kind: "patch", patch }),
      sendCommand: (command: MirrorCommand) =>
        this.post({ kind: "command", command }),
    });
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  // Outgoing messages buffer until the worker's `hello` (channel-open ACK)
  // arrives — posts before the worker's module graph finishes evaluating can
  // be silently dropped (see workerMessages.ts).
  private pending: ToWorkerMessage[] | null = [];

  private post(message: ToWorkerMessage): void {
    mirrorTrace("session.post", {
      kind: message.kind,
      buffered: this.pending !== null,
      detail:
        message.kind === "command"
          ? message.command.kind
          : message.kind === "patch"
            ? message.patch.kind
            : undefined,
    });
    if (this.pending) {
      this.pending.push(message);
      return;
    }
    this.worker.postMessage(message);
  }

  private flushPending(): void {
    const queued = this.pending;
    this.pending = null;
    for (const message of queued ?? []) this.worker.postMessage(message);
  }

  dispose(): void {
    this.removeSink();
    this.worker.terminate();
  }
}
