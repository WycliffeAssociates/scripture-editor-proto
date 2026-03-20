import { describe, expect, it, vi } from "vitest";
import { ensureProjectGitReady } from "@/app/domain/git/ensureProjectGitReady.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";

function createProjectMock(initialGitIgnore = ""): Project {
    let contents = initialGitIgnore;
    const writable = {
        write: vi.fn(async (next: string) => {
            contents = next;
        }),
        close: vi.fn(async () => {}),
    };
    const fileHandle = {
        getFile: vi.fn(async () => ({
            text: async () => contents,
        })),
        createWritable: vi.fn(async () => writable),
    };

    const directoryHandle = {
        getFileHandle: vi.fn(async () => fileHandle),
    };

    return {
        id: "p1",
        name: "Project 1",
        files: [],
        metadata: {
            id: "p1",
            name: "Project 1",
            language: { id: "en", name: "English", direction: "ltr" },
        },
        projectDir: {
            path: "/userData/projects/p1",
            asDirectoryHandle: () => directoryHandle,
        },
        fileWriter: {} as never,
        addBook: async () => {},
        getBook: async () => null,
    } as unknown as Project;
}

function createGitProviderMock(
    overrides: Partial<GitProvider> = {},
): GitProvider {
    return {
        ensureRepo: vi.fn(async () => {}),
        getBranchInfo: vi.fn(async () => ({
            current: "main",
            hasMaster: true,
            defaultBranch: "main",
            detached: false,
        })),
        checkoutPreferredBranch: vi.fn(async () => {}),
        listHistory: vi.fn(async () => []),
        readProjectSnapshotAtCommit: vi.fn(async () => new Map()),
        restoreTrackedFilesFromCommit: vi.fn(async () => {}),
        commitAll: vi.fn(async () => ({ hash: "abc" })),
        isRepoHealthy: vi.fn(async () => true),
        ...overrides,
    };
}

describe("ensureProjectGitReady", () => {
    it("creates baseline commit when history is empty", async () => {
        const project = createProjectMock();
        const gitProvider = createGitProviderMock({
            listHistory: vi.fn(async () => []),
        });

        await ensureProjectGitReady({ gitProvider, loadedProject: project });

        expect(gitProvider.ensureRepo).toHaveBeenCalledWith(
            "/userData/projects/p1",
            { defaultBranch: "main" },
        );
        expect(gitProvider.commitAll).toHaveBeenCalledTimes(1);
    });

    it("attempts branch checkout when repo opens detached", async () => {
        const project = createProjectMock();
        const gitProvider = createGitProviderMock({
            getBranchInfo: vi.fn(async () => ({
                current: "",
                hasMaster: true,
                defaultBranch: "main",
                detached: true,
            })),
            listHistory: vi.fn(async () => [{ hash: "h1" }] as never),
        });

        await ensureProjectGitReady({ gitProvider, loadedProject: project });
        expect(gitProvider.checkoutPreferredBranch).toHaveBeenCalledWith(
            "/userData/projects/p1",
            { prefer: "main" },
        );
    });

    it("re-runs repo initialization when health check fails", async () => {
        const project = createProjectMock();
        const gitProvider = createGitProviderMock({
            isRepoHealthy: vi.fn(async () => false),
            listHistory: vi.fn(async () => [{ hash: "h1" }] as never),
        });

        await ensureProjectGitReady({ gitProvider, loadedProject: project });

        expect(gitProvider.ensureRepo).toHaveBeenCalledTimes(2);
    });

    it("does not throw when baseline commit fails with recoverable web git errors", async () => {
        const project = createProjectMock();
        const gitProvider = createGitProviderMock({
            listHistory: vi.fn(async () => []),
            commitAll: vi.fn(async () => {
                throw new Error("NotFoundError: Could not find 01-GEN.usfm.");
            }),
        });

        await expect(
            ensureProjectGitReady({ gitProvider, loadedProject: project }),
        ).resolves.toBeUndefined();
    });
});
