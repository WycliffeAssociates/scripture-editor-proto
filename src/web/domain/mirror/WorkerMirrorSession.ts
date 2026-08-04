// WorkerMirrorSession.ts
//
// Main-thread handle to the web workspace-mirror worker. It is the feed's one
// sink today: patches/commands posted to the worker on the FIFO channel,
// results delivered back into the `MirrorFeed`. The worker is a Vite module
// worker so its imports (wasm onion/sous, OPFS) bundle like the rest of the app.

import { loadProjectResident } from "@/app/domain/mirror/braidHost.ts";
import { markEditWire } from "@/app/domain/mirror/editTrace.ts";
import type { MirrorFeed } from "@/app/domain/mirror/MirrorFeed.ts";
import type {
  HostCommand,
  LoadProjectResult,
  MirrorPatch,
} from "@/app/domain/mirror/mirrorProtocol.ts";
import type {
  LoadProjectRequest,
  MirrorSession,
} from "@/app/domain/mirror/mirrorSessionFactory.ts";
import type {
  FromWorkerMessage,
  ToWorkerMessage,
} from "@/app/domain/mirror/workerMessages.ts";

export class WorkerMirrorSession implements MirrorSession {
  private readonly worker: Worker;
  private readonly removeSink: () => void;
  private readonly feed: MirrorFeed;
  // Resolved when the worker posts its `ready` ACK (wasm init complete). The
  // load contract awaits this before posting the seed + initial analyze.
  private readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;

  constructor(args: {
    feed: MirrorFeed;
    workspaceKey: string;
    dirtyBufferRoot: string;
  }) {
    this.feed = args.feed;
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
      if (event.data.kind === "disposed") {
        this.worker.terminate();
        return;
      }
      if (event.data.kind === "result") {
        const result = event.data.result;
        const wire = event.data.wire;
        if (wire && "ranAtGeneration" in result) {
          markEditWire(result.ranAtGeneration, wire);
        }
        args.feed.deliverResult(result);
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
    });
    // Register as a sink — patches/commands the producer/pipelines write now
    // reach the worker.
    this.removeSink = args.feed.addSink({
      pushPatch: (patch: MirrorPatch) => this.post({ kind: "patch", patch }),
      sendCommand: (command: HostCommand) =>
        this.post({ kind: "command", command }),
    });
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  loadProject(request: LoadProjectRequest): Promise<LoadProjectResult> {
    return loadProjectResident({ feed: this.feed, ...request });
  }

  // Outgoing messages buffer until the worker's `hello` (channel-open ACK)
  // arrives — posts before the worker's module graph finishes evaluating can
  // be silently dropped (see workerMessages.ts).
  private pending: ToWorkerMessage[] | null = [];

  private post(message: ToWorkerMessage): void {
    if (this.pending) {
      this.pending.push(message);
      return;
    }
    this.sendToWorker(message);
  }

  private flushPending(): void {
    const queued = this.pending;
    this.pending = null;
    for (const message of queued ?? []) this.sendToWorker(message);
  }

  private sendToWorker(message: ToWorkerMessage): void {
    this.worker.postMessage(message);
  }

  dispose(): void {
    this.removeSink();
    // Let the worker release wasm-owned Braid/Galley handles before ending the
    // worker. The timeout only covers a worker that failed before it could
    // process the disposal message; normal shutdown is acknowledged in-order.
    this.post({ kind: "dispose" });
    setTimeout(() => this.worker.terminate(), 100);
  }
}
