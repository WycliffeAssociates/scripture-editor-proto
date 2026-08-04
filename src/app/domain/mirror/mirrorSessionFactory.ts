// mirrorSessionFactory.ts
//
// The platform seam for constructing a mirror session. The kernel builder
// builds the platform-neutral `MirrorFeed`, then asks the injected factory to
// attach a mirror to it. Web returns a worker-backed session; desktop returns a
// Rust resident session. The
// kernel itself stays platform-agnostic — it only knows the feed and the
// factory.

import type { SousConfig } from "scripture-sous-chef-web";

import type { FileSystem } from "@/core/persistence/FileSystem.ts";

import type { MirrorFeed } from "./MirrorFeed.ts";
import type { LoadProjectBook, LoadProjectResult } from "./mirrorProtocol.ts";

/**
 * Everything a resident host needs to bring BOTH arms up for one project:
 * Braid's corpus from the listed book paths, and Galley's analysis of the same
 * corpus under `config`. One request, one result — the load path never issues a
 * follow-up analysis.
 */
export type LoadProjectRequest = {
  generation: number;
  projectPath: string;
  workspaceKey: string;
  books: LoadProjectBook[];
  config?: SousConfig;
  analysisDisabled: boolean;
};

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
  loadProject(request: LoadProjectRequest): Promise<LoadProjectResult>;
  dispose(): void;
}

export type MirrorSessionFactory = (args: {
  feed: MirrorFeed;
  workspaceKey: string;
  /** The managed root the dirty-buffer backups live under. */
  dirtyBufferRoot: string;
  /** Optional platform cache seam used by native packed-findings persistence. */
  fileSystem?: FileSystem;
  cacheRoot?: string;
}) => MirrorSession;
