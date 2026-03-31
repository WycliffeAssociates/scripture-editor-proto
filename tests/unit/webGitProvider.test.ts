import { beforeEach, describe, expect, it, vi } from "vitest";
import { GIT_REMOTE_PUBLISH_REMOTE_ADVANCED } from "@/core/persistence/GitProvider.ts";
import { WebGitProvider } from "@/web/adapters/git/WebGitProvider.ts";

const {
    gitInitMock,
    gitListBranchesMock,
    gitStatusMatrixMock,
    gitCurrentBranchMock,
    gitLogMock,
    gitCheckoutMock,
    gitListFilesMock,
    gitReadBlobMock,
    gitRemoveMock,
    gitAddMock,
    gitResolveRefMock,
    gitFindMergeBaseMock,
    gitCommitMock,
    gitFetchMock,
    gitPushMock,
    gitWriteRefMock,
    gitCherryPickMock,
    gitCloneMock,
} = vi.hoisted(() => ({
    gitInitMock: vi.fn(),
    gitListBranchesMock: vi.fn(),
    gitStatusMatrixMock: vi.fn(),
    gitCurrentBranchMock: vi.fn(),
    gitLogMock: vi.fn(),
    gitCheckoutMock: vi.fn(),
    gitListFilesMock: vi.fn(),
    gitReadBlobMock: vi.fn(),
    gitRemoveMock: vi.fn(),
    gitAddMock: vi.fn(),
    gitResolveRefMock: vi.fn(),
    gitFindMergeBaseMock: vi.fn(),
    gitCommitMock: vi.fn(),
    gitFetchMock: vi.fn(),
    gitPushMock: vi.fn(),
    gitWriteRefMock: vi.fn(),
    gitCherryPickMock: vi.fn(),
    gitCloneMock: vi.fn(),
}));

vi.mock("isomorphic-git", () => ({
    init: gitInitMock,
    listBranches: gitListBranchesMock,
    statusMatrix: gitStatusMatrixMock,
    currentBranch: gitCurrentBranchMock,
    log: gitLogMock,
    checkout: gitCheckoutMock,
    listFiles: gitListFilesMock,
    readBlob: gitReadBlobMock,
    remove: gitRemoveMock,
    add: gitAddMock,
    resolveRef: gitResolveRefMock,
    findMergeBase: gitFindMergeBaseMock,
    commit: gitCommitMock,
    fetch: gitFetchMock,
    push: gitPushMock,
    writeRef: gitWriteRefMock,
    cherryPick: gitCherryPickMock,
    clone: gitCloneMock,
}));

vi.mock("isomorphic-git/http/web", () => ({
    default: { __http: true },
}));

function makeRuntime() {
    let gitDirExists = false;
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const rm = vi.fn().mockResolvedValue(undefined);
    const stat = vi.fn().mockImplementation(async (path: string) => {
        if (gitDirExists && String(path).includes("/.git")) {
            return { isDirectory: () => true };
        }
        throw new Error("ENOENT");
    });
    const writeFile = vi.fn().mockResolvedValue(undefined);
    return {
        ensureReady: vi.fn().mockResolvedValue(undefined),
        fs: {
            promises: {
                mkdir,
                rm,
                stat,
                writeFile,
            },
        },
        mkdir,
        rm,
        stat,
        writeFile,
        setGitDirExists(value: boolean) {
            gitDirExists = value;
        },
    };
}

function makeRepoExistsRuntime() {
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const rm = vi
        .fn()
        .mockRejectedValue(
            new Error(
                "ENOENT: No such file or directory, rmdir '/x/.git/hooks'",
            ),
        );
    const stat = vi.fn().mockResolvedValue({ isDirectory: () => true });
    const writeFile = vi.fn().mockResolvedValue(undefined);
    return {
        ensureReady: vi.fn().mockResolvedValue(undefined),
        fs: {
            promises: {
                mkdir,
                rm,
                stat,
                writeFile,
            },
        },
        mkdir,
        rm,
        stat,
        writeFile,
    };
}

describe("WebGitProvider", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        gitInitMock.mockReset();
        gitListBranchesMock.mockReset();
        gitStatusMatrixMock.mockReset();
        gitCurrentBranchMock.mockReset();
        gitLogMock.mockReset();
        gitCheckoutMock.mockReset();
        gitListFilesMock.mockReset();
        gitReadBlobMock.mockReset();
        gitRemoveMock.mockReset();
        gitAddMock.mockReset();
        gitResolveRefMock.mockReset();
        gitFindMergeBaseMock.mockReset();
        gitCommitMock.mockReset();
        gitFetchMock.mockReset();
        gitPushMock.mockReset();
        gitWriteRefMock.mockReset();
        gitCherryPickMock.mockReset();
        gitCloneMock.mockReset();
        gitListBranchesMock.mockResolvedValue(["main"]);
        gitStatusMatrixMock.mockResolvedValue([]);
    });

    it("clones a remote repo into the requested project path", async () => {
        const runtime = makeRuntime();
        gitCloneMock.mockResolvedValue(undefined);
        gitResolveRefMock.mockResolvedValue("cloned-head");

        const provider = new WebGitProvider(runtime as never, {
            requestedWithHeaderValue: "dovetail-web",
        });
        await expect(
            provider.cloneRemoteRepo({
                projectPath: "/userData/projects/p",
                remoteUrl: "https://gitea.example.org/alice/bho-bible.git",
                branch: "master",
                auth: { username: "alice", token: "secret" },
            }),
        ).resolves.toEqual({ head: "cloned-head" });

        expect(runtime.mkdir).toHaveBeenCalledWith("/userData/projects", {
            recursive: true,
        });
        expect(gitCloneMock).toHaveBeenCalledWith(
            expect.objectContaining({
                dir: "/userData/projects/p",
                url: "https://gitea.example.org/alice/bho-bible.git",
                ref: "master",
                singleBranch: true,
                depth: 1,
                headers: {
                    "X-Requested-With": "dovetail-web",
                },
            }),
        );
    });

    it("serializes concurrent ensureRepo calls for the same project path", async () => {
        const runtime = makeRuntime();
        gitInitMock.mockImplementation(async () => {
            runtime.setGitDirExists(true);
        });

        const provider = new WebGitProvider(runtime as never);

        const first = provider.ensureRepo("/userData/projects/p", {
            defaultBranch: "main",
        });
        const second = provider.ensureRepo("/userData/projects/p", {
            defaultBranch: "main",
        });

        await Promise.all([first, second]);
        expect(gitInitMock).toHaveBeenCalledTimes(1);
    });

    it("treats missing refs/heads/* as empty history", async () => {
        const runtime = makeRuntime();
        gitLogMock.mockRejectedValue(
            new Error("reference 'refs/heads/master' not found"),
        );

        const provider = new WebGitProvider(runtime as never);
        const history = await provider.listHistory("/userData/projects/p", {
            limit: 10,
            offset: 0,
        });

        expect(history).toEqual([]);
    });

    it("treats headContent null errors as empty history", async () => {
        const runtime = makeRuntime();
        gitLogMock.mockRejectedValue(
            new Error(
                'can\'t access property "startsWith", headContent is null',
            ),
        );

        const provider = new WebGitProvider(runtime as never);
        const history = await provider.listHistory("/userData/projects/p", {
            limit: 10,
            offset: 0,
        });

        expect(history).toEqual([]);
    });

    it("continues ensureRepo when recursive rm hits ENOENT under .git/hooks", async () => {
        const runtime = makeRepoExistsRuntime();
        gitListBranchesMock
            .mockRejectedValueOnce(new Error("corrupt repo"))
            .mockResolvedValue(["main"]);
        gitStatusMatrixMock
            .mockRejectedValueOnce(new Error("corrupt repo"))
            .mockResolvedValue([]);
        gitInitMock.mockResolvedValue(undefined);

        const provider = new WebGitProvider(runtime as never);
        await expect(
            provider.ensureRepo("/userData/projects/p", {
                defaultBranch: "main",
            }),
        ).resolves.toBeUndefined();
        expect(gitInitMock).toHaveBeenCalledTimes(1);
    });

    it("throws after exhausting git.init retries for persistent .git ENOENT", async () => {
        const runtime = makeRuntime();
        gitInitMock.mockRejectedValue(
            new Error(
                "ENOENT: No such file or directory, mkdir '/userData/projects/p/.git/branches'",
            ),
        );

        const provider = new WebGitProvider(runtime as never);
        await expect(
            provider.ensureRepo("/userData/projects/p", {
                defaultBranch: "main",
            }),
        ).rejects.toThrow(
            "ENOENT: No such file or directory, mkdir '/userData/projects/p/.git/branches'",
        );

        expect(gitInitMock).toHaveBeenCalledTimes(4);
    });

    it("retries git.init after transient .git bootstrap ENOENT and waits for repo health", async () => {
        const runtime = makeRuntime();
        gitInitMock
            .mockRejectedValueOnce(
                new Error(
                    "ENOENT: No such file or directory, mkdir '/userData/projects/p/.git/branches'",
                ),
            )
            .mockImplementationOnce(async () => {
                runtime.setGitDirExists(true);
            });
        const provider = new WebGitProvider(runtime as never);
        await expect(
            provider.ensureRepo("/userData/projects/p", {
                defaultBranch: "main",
            }),
        ).resolves.toBeUndefined();

        expect(gitInitMock).toHaveBeenCalledTimes(2);
    });

    it("retries .gitignore staging when git add sees a transient not found error", async () => {
        const runtime = makeRuntime();
        gitStatusMatrixMock.mockResolvedValue([[".gitignore", 0, 2, 0]]);
        gitAddMock
            .mockRejectedValueOnce(
                new Error("NotFoundError: Could not find .gitignore."),
            )
            .mockResolvedValueOnce(undefined);
        gitResolveRefMock.mockRejectedValue(new Error("Could not find HEAD"));
        gitCommitMock.mockResolvedValue("hash-1");

        const provider = new WebGitProvider(runtime as never);
        const result = await provider.commitAll(
            "/userData/projects/p",
            {
                op: "baseline",
                timestampIso: "2026-03-05T00:00:00.000Z",
                changedChapters: [],
            },
            { name: "Test", email: "test@example.com" },
        );

        expect(result).toEqual({ hash: "hash-1" });
        expect(gitAddMock).toHaveBeenCalledTimes(2);
        expect(gitCommitMock).toHaveBeenCalledTimes(1);
    });

    it("inspects local and tracked remote heads without fetching full contents", async () => {
        const runtime = makeRuntime();
        gitResolveRefMock
            .mockResolvedValueOnce("local-head")
            .mockResolvedValueOnce("remote-head");
        gitFindMergeBaseMock.mockResolvedValue(["base-head"]);

        const provider = new WebGitProvider(runtime as never);
        const result = await provider.inspectRemoteHeads({
            projectPath: "/userData/projects/p",
            remoteName: "origin",
            branch: "master",
            auth: { username: "alice", token: "token" },
        });

        expect(result).toEqual({
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
        expect(gitResolveRefMock).toHaveBeenNthCalledWith(1, {
            fs: runtime.fs,
            dir: "/userData/projects/p",
            ref: "HEAD",
        });
        expect(gitResolveRefMock).toHaveBeenNthCalledWith(2, {
            fs: runtime.fs,
            dir: "/userData/projects/p",
            ref: "refs/remotes/origin/master",
        });
    });

    it("plans replay commits from local history above the merge base", async () => {
        const runtime = makeRuntime();
        gitResolveRefMock
            .mockResolvedValueOnce("local-head")
            .mockResolvedValueOnce("remote-head");
        gitFindMergeBaseMock.mockResolvedValue(["base-head"]);
        gitLogMock.mockResolvedValue([
            { oid: "local-head" },
            { oid: "local-parent" },
            { oid: "base-head" },
        ]);

        const provider = new WebGitProvider(runtime as never);
        const result = await provider.planReplayOntoRemote({
            projectPath: "/userData/projects/p",
            remoteName: "origin",
            branch: "master",
            auth: { username: "alice", token: "token" },
        });

        expect(result).toEqual({
            strategy: "replayLocalCommitsOntoRemoteLatest",
            commitHashes: ["local-head", "local-parent"],
            relationship: {
                kind: "diverged",
                localHead: "local-head",
                remoteHead: "remote-head",
                mergeBase: "base-head",
            },
        });
    });

    it("fetches remote tracking heads before returning inspection", async () => {
        const runtime = makeRuntime();
        gitFetchMock.mockResolvedValue({});
        gitResolveRefMock
            .mockResolvedValueOnce("local-head")
            .mockResolvedValueOnce("remote-head");
        gitFindMergeBaseMock.mockResolvedValue(["base-head"]);

        const provider = new WebGitProvider(runtime as never, {
            requestedWithHeaderValue: "dovetail-web",
        });
        const result = await provider.fetchRemoteHeads({
            projectPath: "/userData/projects/p",
            remoteName: "origin",
            branch: "master",
            auth: { username: "alice", token: "token" },
        });

        expect(gitFetchMock).toHaveBeenCalledWith({
            fs: runtime.fs,
            http: { __http: true },
            dir: "/userData/projects/p",
            headers: {
                "X-Requested-With": "dovetail-web",
            },
            remote: "origin",
            ref: "master",
            remoteRef: "master",
            singleBranch: true,
            prune: true,
            onAuth: expect.any(Function),
        });
        expect(result.relationship.kind).toBe("diverged");
    });

    it("classifies non-fast-forward push rejection as remoteAdvanced", async () => {
        const runtime = makeRuntime();
        gitResolveRefMock.mockResolvedValueOnce("local-head");
        gitPushMock.mockRejectedValue(
            new Error("PushRejectedError: non-fast-forward update"),
        );

        const provider = new WebGitProvider(runtime as never, {
            requestedWithHeaderValue: "dovetail-web",
        });
        await expect(
            provider.pushCurrentBranch({
                projectPath: "/userData/projects/p",
                remoteName: "origin",
                branch: "master",
                auth: { username: "alice", token: "token" },
            }),
        ).resolves.toEqual({
            outcome: GIT_REMOTE_PUBLISH_REMOTE_ADVANCED,
            localHead: "local-head",
            remoteHead: null,
        });
        expect(gitPushMock).toHaveBeenCalledWith(
            expect.objectContaining({
                headers: {
                    "X-Requested-With": "dovetail-web",
                },
            }),
        );
    });

    it("resets the branch to remote latest and replays local commits oldest-first", async () => {
        const runtime = makeRuntime();
        gitWriteRefMock.mockResolvedValue(undefined);
        gitCheckoutMock.mockResolvedValue(undefined);
        gitCherryPickMock.mockResolvedValue("new-commit");
        gitResolveRefMock.mockResolvedValueOnce("replayed-head");

        const provider = new WebGitProvider(runtime as never);
        const result = await provider.applyReplayPlanOntoRemote({
            projectPath: "/userData/projects/p",
            branch: "master",
            remoteHead: "remote-head",
            commitHashes: ["c3", "c2", "c1"],
        });

        expect(gitWriteRefMock).toHaveBeenCalledWith({
            fs: runtime.fs,
            dir: "/userData/projects/p",
            ref: "refs/heads/master",
            value: "remote-head",
            force: true,
        });
        expect(gitCheckoutMock).toHaveBeenCalledWith({
            fs: runtime.fs,
            dir: "/userData/projects/p",
            ref: "master",
            force: true,
        });
        expect(gitCherryPickMock.mock.calls.map(([args]) => args.oid)).toEqual([
            "c1",
            "c2",
            "c3",
        ]);
        expect(result).toEqual({
            head: "replayed-head",
            replayedCommitHashes: ["c3", "c2", "c1"],
        });
    });
});
