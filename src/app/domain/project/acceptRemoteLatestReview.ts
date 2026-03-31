import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import {
    createDefaultGitRemoteProjectStatus,
    GIT_REMOTE_PROJECT_STATUS_CONNECTED,
    type GitRemoteProjectStatus,
} from "@/core/persistence/gitRemoteModels.ts";
import {
    readGitRemoteProjectStatus,
    writeGitRemoteProjectStatus,
} from "@/core/persistence/gitRemoteStore.ts";
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
    const replay = await args.gitProvider.applyReplayPlanOntoRemote({
        projectPath: args.projectPath,
        branch: args.trackedBranch,
        remoteHead: args.remoteHead,
        commitHashes: [],
    });
    const existingStatus =
        (await readGitRemoteProjectStatus({
            fileSystem: args.fileSystem,
            storageRoots: args.storageRoots,
            projectPath: args.projectPath,
        })) ?? createDefaultGitRemoteProjectStatus(args.projectPath);
    const nextStatus: GitRemoteProjectStatus = {
        ...existingStatus,
        kind: GIT_REMOTE_PROJECT_STATUS_CONNECTED,
        lastCheckedAt: args.now?.() ?? new Date().toISOString(),
        lastKnownLocalHead: replay.head ?? args.remoteHead,
        lastKnownRemoteHead: args.remoteHead,
    };
    await writeGitRemoteProjectStatus({
        fileSystem: args.fileSystem,
        storageRoots: args.storageRoots,
        status: nextStatus,
    });
    return nextStatus;
}
