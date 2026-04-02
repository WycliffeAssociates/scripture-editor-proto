/** biome-ignore-all lint/suspicious/noExplicitAny: test mocks */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    GIT_REMOTE_PUBLISH_PUBLISHED,
} from "@/core/persistence/GitProvider.ts";

const mocks = vi.hoisted(() => ({
    invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
    invoke: mocks.invokeMock,
}));

import { TauriGitProvider } from "@/tauri/adapters/git/TauriGitProvider.ts";

describe("TauriGitProvider", () => {
    beforeEach(() => {
        mocks.invokeMock.mockReset();
    });

    it("passes remote clone args through the tauri bridge", async () => {
        mocks.invokeMock.mockResolvedValueOnce("cloned-head");

        const provider = new TauriGitProvider();
        await expect(
            provider.cloneRemoteRepo({
                projectPath: "/userData/projects/p",
                remoteUrl: "https://gitea.example.org/alice/bho-bible.git",
                branch: "master",
                auth: { username: "alice", token: "secret" },
            }),
        ).resolves.toEqual({ head: "cloned-head" });

        expect(mocks.invokeMock).toHaveBeenCalledWith("git_clone_remote_repo", {
            repoPath: "/userData/projects/p",
            remoteUrl: "https://gitea.example.org/alice/bho-bible.git",
            branch: "master",
            username: "alice",
            token: "secret",
        });
    });

    it("maps snake_case remote inspection payloads into the shared contract", async () => {
        mocks.invokeMock.mockResolvedValueOnce({
            local_head: "local-head",
            remote_head: "remote-head",
            merge_base: "base-head",
            relationship: {
                kind: "diverged",
                local_head: "local-head",
                remote_head: "remote-head",
                merge_base: "base-head",
            },
        });

        const provider = new TauriGitProvider();
        await expect(
            provider.inspectRemoteHeads({
                projectPath: "/userData/projects/p",
                remoteName: "origin",
                branch: "master",
                auth: { username: "alice", token: "secret" },
            }),
        ).resolves.toEqual({
            localHead: "local-head",
            remoteHead: "remote-head",
            mergeBase: "base-head",
            relationship: {
                kind: "diverged",
                localHead: "local-head",
                remoteHead: "remote-head",
                mergeBase: "base-head",
            },
        });

        expect(mocks.invokeMock).toHaveBeenCalledWith(
            "git_inspect_remote_heads",
            {
                repoPath: "/userData/projects/p",
                remoteName: "origin",
                branch: "master",
            },
        );
    });

    it("passes ensure-remote args through the tauri bridge", async () => {
        mocks.invokeMock.mockResolvedValueOnce(undefined);

        const provider = new TauriGitProvider();
        await expect(
            provider.ensureRemote({
                projectPath: "/userData/projects/p",
                remoteName: "origin",
                remoteUrl: "https://gitea.example.org/alice/bho-bible.git",
            }),
        ).resolves.toBeUndefined();

        expect(mocks.invokeMock).toHaveBeenCalledWith("git_ensure_remote", {
            repoPath: "/userData/projects/p",
            remoteName: "origin",
            remoteUrl: "https://gitea.example.org/alice/bho-bible.git",
        });
    });

    it("maps downgraded replay-plan payloads into the shared contract", async () => {
        mocks.invokeMock.mockResolvedValueOnce({
            strategy: "none",
            commit_hashes: [],
            relationship: {
                kind: "diverged",
                local_head: "local-head",
                remote_head: "remote-head",
                merge_base: "base-head",
            },
        });

        const provider = new TauriGitProvider();
        await expect(
            provider.planReplayOntoRemote({
                projectPath: "/userData/projects/p",
                remoteName: "origin",
                branch: "master",
                auth: { username: "alice", token: "secret" },
            }),
        ).resolves.toEqual({
            strategy: "none",
            commitHashes: [],
            relationship: {
                kind: "diverged",
                localHead: "local-head",
                remoteHead: "remote-head",
                mergeBase: "base-head",
            },
        });

        expect(mocks.invokeMock).toHaveBeenCalledWith(
            "git_plan_replay_onto_remote",
            {
                repoPath: "/userData/projects/p",
                remoteName: "origin",
                branch: "master",
            },
        );
    });

    it("passes auth through fetch and maps the inspection result", async () => {
        mocks.invokeMock.mockResolvedValueOnce({
            local_head: "local-head",
            remote_head: "remote-head",
            merge_base: "base-head",
            relationship: {
                kind: "behindOnly",
                local_head: "local-head",
                remote_head: "remote-head",
                merge_base: "base-head",
            },
        });

        const provider = new TauriGitProvider();
        await expect(
            provider.fetchRemoteHeads({
                projectPath: "/userData/projects/p",
                remoteName: "origin",
                branch: "master",
                auth: { username: "alice", token: "secret" },
            }),
        ).resolves.toEqual({
            localHead: "local-head",
            remoteHead: "remote-head",
            mergeBase: "base-head",
            relationship: {
                kind: "behindOnly",
                localHead: "local-head",
                remoteHead: "remote-head",
                mergeBase: "base-head",
            },
        });

        expect(mocks.invokeMock).toHaveBeenCalledWith("git_fetch_remote_heads", {
            repoPath: "/userData/projects/p",
            remoteName: "origin",
            branch: "master",
            username: "alice",
            token: "secret",
        });
    });

    it("maps push results from snake_case payloads", async () => {
        mocks.invokeMock.mockResolvedValueOnce({
            outcome: "published",
            local_head: "local-head",
            remote_head: "remote-head",
        });

        const provider = new TauriGitProvider();
        await expect(
            provider.pushCurrentBranch({
                projectPath: "/userData/projects/p",
                remoteName: "origin",
                branch: "master",
                auth: { username: "alice", token: "secret" },
            }),
        ).resolves.toEqual({
            outcome: GIT_REMOTE_PUBLISH_PUBLISHED,
            localHead: "local-head",
            remoteHead: "remote-head",
        });

        expect(mocks.invokeMock).toHaveBeenCalledWith("git_push_current_branch", {
            repoPath: "/userData/projects/p",
            remoteName: "origin",
            branch: "master",
            username: "alice",
            token: "secret",
        });
    });

    it("maps reset-to-remote replay application payloads into the shared contract", async () => {
        mocks.invokeMock.mockResolvedValueOnce({
            head: "remote-head",
            replayed_commit_hashes: [],
        });

        const provider = new TauriGitProvider();
        await expect(
            provider.applyReplayPlanOntoRemote({
                projectPath: "/userData/projects/p",
                branch: "master",
                remoteHead: "remote-head",
                commitHashes: [],
            }),
        ).resolves.toEqual({
            head: "remote-head",
            replayedCommitHashes: [],
        });

        expect(mocks.invokeMock).toHaveBeenCalledWith(
            "git_apply_replay_plan_onto_remote",
            {
                repoPath: "/userData/projects/p",
                branch: "master",
                remoteHead: "remote-head",
                commitHashes: [],
            },
        );
    });
});
