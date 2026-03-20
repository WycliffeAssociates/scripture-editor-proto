import { beforeEach, describe, expect, it, vi } from "vitest";
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
    gitCommitMock,
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
    gitCommitMock: vi.fn(),
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
    commit: gitCommitMock,
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
        gitCommitMock.mockReset();
        gitListBranchesMock.mockResolvedValue(["main"]);
        gitStatusMatrixMock.mockResolvedValue([]);
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
});
