import { describe, expect, it, vi } from "vitest";
import { prepareRemoteBaseForReconciliation } from "@/app/domain/project/prepareRemoteBaseForReconciliation.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import {
    GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY,
    GIT_REMOTE_RELATIONSHIP_DIVERGED,
} from "@/core/persistence/gitRemoteRelationship.ts";

function createGitProvider(): GitProvider {
    return {
        ensureRepo: vi.fn(),
        getBranchInfo: vi.fn(),
        checkoutPreferredBranch: vi.fn(),
        listHistory: vi.fn(),
        readCommitDetails: vi.fn(),
        readProjectSnapshotAtCommit: vi.fn(),
        restoreTrackedFilesFromCommit: vi.fn(),
        commitAll: vi.fn(),
        cloneRemoteRepo: vi.fn(),
        ensureRemote: vi.fn(),
        inspectRemoteHeads: vi.fn(),
        fetchRemoteHeads: vi.fn(),
        pushCurrentBranch: vi.fn(),
        planReplayOntoRemote: vi.fn(),
        applyReplayPlanOntoRemote: vi.fn().mockResolvedValue({
            head: "new-head",
            replayedCommitHashes: [],
        }),
        isRepoHealthy: vi.fn(),
    };
}

describe("prepareRemoteBaseForReconciliation", () => {
    it("adopts remote latest directly for behind-only reconciliation", async () => {
        const gitProvider = createGitProvider();

        await prepareRemoteBaseForReconciliation({
            projectPath: "/userData/projects/demo",
            trackedBranch: "master",
            remoteHead: "remote-head",
            relationship: GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY,
            gitProvider,
        });

        expect(gitProvider.applyReplayPlanOntoRemote).toHaveBeenCalledWith({
            projectPath: "/userData/projects/demo",
            branch: "master",
            remoteHead: "remote-head",
            commitHashes: [],
        });
    });

    it("adopts remote latest before saving when reconciliation is diverged", async () => {
        const gitProvider = createGitProvider();

        await prepareRemoteBaseForReconciliation({
            projectPath: "/userData/projects/demo",
            trackedBranch: "master",
            remoteHead: "remote-head",
            relationship: GIT_REMOTE_RELATIONSHIP_DIVERGED,
            gitProvider,
        });

        expect(gitProvider.applyReplayPlanOntoRemote).toHaveBeenCalledWith({
            projectPath: "/userData/projects/demo",
            branch: "master",
            remoteHead: "remote-head",
            commitHashes: [],
        });
    });

    it("returns null for unrelated relationships", async () => {
        const gitProvider = createGitProvider();

        await expect(
            prepareRemoteBaseForReconciliation({
                projectPath: "/userData/projects/demo",
                trackedBranch: "master",
                remoteHead: "remote-head",
                relationship: "upToDate",
                gitProvider,
            }),
        ).resolves.toBeNull();

        expect(gitProvider.applyReplayPlanOntoRemote).not.toHaveBeenCalled();
    });
});
