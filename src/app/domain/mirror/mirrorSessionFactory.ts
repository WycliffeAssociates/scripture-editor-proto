// mirrorSessionFactory.ts
//
// The platform seam for constructing a mirror session. The workspace builds the
// platform-neutral `MirrorFeed`, then asks the injected factory to attach a
// mirror to it. Web returns a worker-backed session; desktop returns an
// in-process session bound to its services (the phase-2 interim). The workspace
// itself stays platform-agnostic — it only knows the feed and the factory.

import type { DirtyBufferStore } from "@/app/state/DirtyBufferStore.ts";

import type { MirrorSession } from "./InProcessMirrorSession.ts";
import type { MirrorFeed } from "./MirrorFeed.ts";

export type MirrorSessionFactory = (args: {
  feed: MirrorFeed;
  workspaceKey: string;
  /** The managed root the dirty-buffer backups live under. */
  dirtyBufferRoot: string;
  /** The store the desktop interim writes shipped-back envelope bytes through. */
  dirtyBufferStore: DirtyBufferStore;
}) => MirrorSession;
