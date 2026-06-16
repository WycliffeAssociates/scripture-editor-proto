import type { GitProvider } from "@/core/persistence/GitProvider.ts";

/**
 * Move the local branch/worktree base to the already-fetched remote latest.
 *
 * Passing an empty replay list performs the same branch move used by the
 * replay path without preserving any additional local-only commits.
 */
export async function adoptRemoteLatestAsLocalBase(args: {
  projectPath: string;
  trackedBranch: string;
  remoteHead: string;
  gitProvider: GitProvider;
}) {
  return args.gitProvider.applyReplayPlanOntoRemote({
    projectPath: args.projectPath,
    branch: args.trackedBranch,
    remoteHead: args.remoteHead,
    commitHashes: [],
  });
}
