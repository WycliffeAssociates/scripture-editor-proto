import { adoptRemoteLatestAsLocalBase } from "@/app/domain/project/adoptRemoteLatestAsLocalBase.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import {
  createDefaultGitRemoteProjectStatus,
  GIT_REMOTE_PROJECT_STATUS_CONNECTED,
  type GitRemoteProjectStatus,
} from "@/core/persistence/gitRemoteModels.ts";
import { applyGitRemoteProjectStatus } from "@/core/persistence/gitRemoteStore.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

/**
 * Accept the fetched remote latest as the new local git base.
 *
 * This is the explicit "Apply all" path for remote review while the local
 * branch is only behind. No new save commit is created; the local repo simply
 * advances to the already-reviewed remote head.
 */
export async function acceptRemoteLatestReview(args: {
  projectPath: string;
  trackedBranch: string;
  remoteHead: string;
  fileSystem: FileSystem;
  storageRoots: StorageRoots;
  gitProvider: GitProvider;
  now?: () => string;
}): Promise<GitRemoteProjectStatus> {
  const replay = await adoptRemoteLatestAsLocalBase({
    projectPath: args.projectPath,
    trackedBranch: args.trackedBranch,
    remoteHead: args.remoteHead,
    gitProvider: args.gitProvider,
  });
  const nextStatus = await applyGitRemoteProjectStatus({
    fileSystem: args.fileSystem,
    storageRoots: args.storageRoots,
    projectPath: args.projectPath,
    update: (existing) => ({
      ...(existing ?? createDefaultGitRemoteProjectStatus(args.projectPath)),
      kind: GIT_REMOTE_PROJECT_STATUS_CONNECTED,
      lastCheckedAt: args.now?.() ?? new Date().toISOString(),
      lastKnownLocalHead: replay.head ?? args.remoteHead,
      lastKnownRemoteHead: args.remoteHead,
    }),
  });
  return nextStatus;
}
