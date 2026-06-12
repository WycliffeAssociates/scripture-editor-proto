// mirrorSessionFactory.ts
//
// The platform seam for constructing a mirror session. The workspace builds the
// platform-neutral `MirrorFeed`, then asks the injected factory to attach a
// mirror to it. Web returns a worker-backed session; desktop returns an
// in-process session bound to its services (the phase-2 interim). The workspace
// itself stays platform-agnostic — it only knows the feed and the factory.

import type { DirtyBufferStore } from "@/app/state/DirtyBufferStore.ts";

import type { MirrorFeed } from "./MirrorFeed.ts";

/** A live mirror attachment to a feed; `dispose` tears down its sink (and any
 *  worker/transport it owns) when the workspace swaps or unmounts. */
export interface MirrorSession {
  /**
   * Resolves once every mirror behind this session has finished initializing
   * (wasm/engine load), so the workspace's load contract can await readiness
   * before posting the seed + initial analyze. A transport that is ready
   * synchronously (the Rust mirror — `invoke` is available immediately)
   * resolves at once; a composed session resolves when all its mirrors do.
   */
  ready(): Promise<void>;
  dispose(): void;
}

export type MirrorSessionFactory = (args: {
  feed: MirrorFeed;
  workspaceKey: string;
  /** The managed root the dirty-buffer backups live under. */
  dirtyBufferRoot: string;
  /** The store the desktop interim writes shipped-back envelope bytes through. */
  dirtyBufferStore: DirtyBufferStore;
}) => MirrorSession;
