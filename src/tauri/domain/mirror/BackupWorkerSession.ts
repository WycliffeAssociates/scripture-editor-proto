// BackupWorkerSession.ts
//
// Main-thread handle to the desktop backup worker. On desktop the feed is
// multicast across two sinks: this one owns crash-recovery backup, the Rust
// mirror session owns lint/sous. So this sink forwards ALL patches (the worker
// needs resident tokens to serialize) but only the backup commands
// (`writeBackup`/`clearBackup`) — analyze commands go to the Rust sink and would
// throw in this engine-less worker. Results (the bounced envelope bytes / clear
// signal) are delivered back into the feed for the result router to write.

import type { MirrorFeed } from "@/app/domain/mirror/MirrorFeed.ts";
import type {
  MirrorCommand,
  MirrorPatch,
} from "@/app/domain/mirror/mirrorProtocol.ts";
import type {
  FromWorkerMessage,
  ToWorkerMessage,
} from "@/app/domain/mirror/workerMessages.ts";

export class BackupWorkerSession {
  private readonly worker: Worker;
  private readonly removeSink: () => void;

  constructor(args: {
    feed: MirrorFeed;
    workspaceKey: string;
    dirtyBufferRoot: string;
  }) {
    this.worker = new Worker(
      new URL("./backupWorker.worker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker.onmessage = (event: MessageEvent<FromWorkerMessage>) => {
      if (event.data.kind === "result") {
        args.feed.deliverResult(event.data.result);
      }
    };
    this.post({
      kind: "init",
      workspaceKey: args.workspaceKey,
      dirtyBufferRoot: args.dirtyBufferRoot,
    });
    this.removeSink = args.feed.addSink({
      pushPatch: (patch: MirrorPatch) => this.post({ kind: "patch", patch }),
      sendCommand: (command: MirrorCommand) => {
        // Only backup commands belong to this sink; lint/sous are the Rust
        // mirror's and would throw in this engine-less worker.
        if (command.kind === "writeBackup" || command.kind === "clearBackup") {
          this.post({ kind: "command", command });
        }
      },
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
