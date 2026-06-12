// InProcessMirrorSession.ts
//
// A mirror session that hosts the `WorkspaceMirror` on the SAME thread, behind
// the same feed sink interface as the worker. Used on desktop as the interim
// (the web worker can't `invoke`, and a Rust resident mirror is phase 3): the
// engines are bound to the platform's existing services, so lint/sous keep
// their current invoke paths and the dirty-buffer write goes through the same
// seam. Commands run as microtasks so a synchronous patch→command sequence on
// the feed still applies the patch first (FIFO), matching the worker's channel
// ordering.

import type { MirrorFeed } from "./MirrorFeed.ts";
import type { MirrorCommand, MirrorPatch } from "./mirrorProtocol.ts";
import type { MirrorEngines, WorkspaceMirror } from "./WorkspaceMirror.ts";

export interface MirrorSession {
  dispose(): void;
}

export class InProcessMirrorSession implements MirrorSession {
  private readonly removeSink: () => void;

  constructor(args: { feed: MirrorFeed; mirror: WorkspaceMirror }) {
    this.removeSink = args.feed.addSink({
      pushPatch: (patch: MirrorPatch) => args.mirror.applyPatch(patch),
      sendCommand: (command: MirrorCommand) => {
        void args.mirror.runCommand(command).then((result) => {
          args.feed.deliverResult(result);
        });
      },
    });
  }

  dispose(): void {
    this.removeSink();
  }
}

/** Re-export for callers wiring a desktop session. */
export type { MirrorEngines };
