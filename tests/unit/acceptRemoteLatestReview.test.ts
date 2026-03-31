import { describe, expect, it, vi } from "vitest";
import { acceptRemoteLatestReview } from "@/app/domain/project/acceptRemoteLatestReview.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import {
    GIT_REMOTE_PROJECT_STATUS_CONNECTED,
} from "@/core/persistence/gitRemoteModels.ts";
import {
    readGitRemoteProjectStatus,
    writeGitRemoteProjectStatus,
} from "@/core/persistence/gitRemoteStore.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";

const storageRoots: StorageRoots = {
    appDataRoot: "/appData",
    projectsRoot: "/userData/projects",
    tempRoot: "/appData/temp",
    cacheRoot: "/appData/cache",
    logsRoot: "/appData/logs",
    databaseRoot: "/appData/database",
};

function createGitProvider(): GitProvider {
    return {
        ensureRepo: vi.fn(),
        getBranchInfo: vi.fn(),
        checkoutPreferredBranch: vi.fn(),
        listHistory: vi.fn(),
        readProjectSnapshotAtCommit: vi.fn(),
        restoreTrackedFilesFromCommit: vi.fn(),
        commitAll: vi.fn(),
        cloneRemoteRepo: vi.fn(),
        inspectRemoteHeads: vi.fn(),
        fetchRemoteHeads: vi.fn(),
        pushCurrentBranch: vi.fn(),
        planReplayOntoRemote: vi.fn(),
        applyReplayPlanOntoRemote: vi.fn().mockResolvedValue({
            head: "remote-head",
            replayedCommitHashes: [],
        }),
        isRepoHealthy: vi.fn(),
    };
}

describe("acceptRemoteLatestReview", () => {
    it("fast-forwards to remote latest and persists connected status", async () => {
        const fileSystem = new InMemoryFileSystem();
        const gitProvider = createGitProvider();

        await writeGitRemoteProjectStatus({
            fileSystem,
            storageRoots,
            status: {
                projectPath: "/userData/projects/demo",
                kind: "remoteUpdatesAvailable",
                lastCheckedAt: null,
                lastPublishedAt: null,
                lastKnownLocalHead: "old-local",
                lastKnownRemoteHead: "remote-head",
            },
        });

        const status = await acceptRemoteLatestReview({
            projectPath: "/userData/projects/demo",
            trackedBranch: "master",
            remoteHead: "remote-head",
            fileSystem,
            storageRoots,
            gitProvider,
            now: () => "2026-03-31T15:00:00.000Z",
        });

        expect(gitProvider.applyReplayPlanOntoRemote).toHaveBeenCalledWith({
            projectPath: "/userData/projects/demo",
            branch: "master",
            remoteHead: "remote-head",
            commitHashes: [],
        });
        expect(status).toEqual({
            projectPath: "/userData/projects/demo",
            kind: GIT_REMOTE_PROJECT_STATUS_CONNECTED,
            lastCheckedAt: "2026-03-31T15:00:00.000Z",
            lastPublishedAt: null,
            lastKnownLocalHead: "remote-head",
            lastKnownRemoteHead: "remote-head",
        });
        await expect(
            readGitRemoteProjectStatus({
                fileSystem,
                storageRoots,
                projectPath: "/userData/projects/demo",
            }),
        ).resolves.toEqual(status);
    });
});
