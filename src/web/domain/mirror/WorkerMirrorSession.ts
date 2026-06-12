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
import type {
  FromWorkerMessage,
  ToWorkerMessage,
} from "@/app/domain/mirror/workerMessages.ts";

export class WorkerMirrorSession {
  private readonly worker: Worker;
  private readonly removeSink: () => void;

  constructor(args: {
    feed: MirrorFeed;
    workspaceKey: string;
    dirtyBufferRoot: string;
  }) {
    this.worker = new Worker(
      new URL("./workspaceMirror.worker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker.onmessage = (event: MessageEvent<FromWorkerMessage>) => {
      if (event.data.kind === "result") {
        args.feed.deliverResult(event.data.result);
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
      sendCommand: (command: MirrorCommand) =>
        this.post({ kind: "command", command }),
    });
  }

  private post(message: ToWorkerMessage): void {
    this.worker.postMessage(message);
  }

  dispose(): void {
    this.removeSink();
    this.worker.terminate();
  }
}
