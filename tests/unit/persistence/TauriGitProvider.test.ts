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

    it("maps snake_case replay-plan payloads into the shared contract", async () => {
        mocks.invokeMock.mockResolvedValueOnce({
            strategy: "replayLocalCommitsOntoRemoteLatest",
            commit_hashes: ["c3", "c2", "c1"],
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
            strategy: "replayLocalCommitsOntoRemoteLatest",
            commitHashes: ["c3", "c2", "c1"],
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

    it("maps replay-application payloads into the shared contract", async () => {
        mocks.invokeMock.mockResolvedValueOnce({
            head: "replayed-head",
            replayed_commit_hashes: ["c3", "c2", "c1"],
        });

        const provider = new TauriGitProvider();
        await expect(
            provider.applyReplayPlanOntoRemote({
                projectPath: "/userData/projects/p",
                branch: "master",
                remoteHead: "remote-head",
                commitHashes: ["c3", "c2", "c1"],
            }),
        ).resolves.toEqual({
            head: "replayed-head",
            replayedCommitHashes: ["c3", "c2", "c1"],
        });

        expect(mocks.invokeMock).toHaveBeenCalledWith(
            "git_apply_replay_plan_onto_remote",
            {
                repoPath: "/userData/projects/p",
                branch: "master",
                remoteHead: "remote-head",
                commitHashes: ["c3", "c2", "c1"],
            },
        );
    });
});
