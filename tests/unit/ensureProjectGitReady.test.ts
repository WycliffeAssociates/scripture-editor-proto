import { describe, expect, it, vi } from "vitest";

import { ensureProjectGitReady } from "@/core/persistence/ensureProjectGitReady.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import { GIT_REMOTE_PUBLISH_PUBLISHED } from "@/core/persistence/GitProvider.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";

function createProjectMock(): Project {
  return {
    folderName: "p1",
    displayName: "Project 1",
    projectPath: "/userData/projects/p1",
    projectId: "p1",
    language: {
      code: "en",
      name: "English",
      direction: "ltr",
    },
    books: [],
    listBooks: async () => [],
    getBook: async () => {
      throw new Error("not used in test");
    },
    saveBook: async () => {},
    addBook: async () => {
      throw new Error("not used in test");
    },
    removeBook: async () => {},
    listVersions: async () => [],
    restoreVersion: async () => {},
    stageAndCommit: async () => ({ hash: "abc" }),
  };
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
    readCommitDetails: vi.fn(async () => ({
      hash: "abc",
      authorName: "alice",
      authoredAtIso: "2026-03-31T10:00:00.000Z",
      subject: "save:2026-03-31T10:00:00.000Z",
    })),
    readProjectSnapshotAtCommit: vi.fn(async () => new Map()),
    restoreTrackedFilesFromCommit: vi.fn(async () => {}),
    commitAll: vi.fn(async () => ({ hash: "abc" })),
    cloneRemoteRepo: vi.fn(async () => ({ head: "abc" })),
    ensureRemote: vi.fn(async () => {}),
    inspectRemoteHeads: vi.fn(async () => {
      throw new Error("not used in test");
    }),
    fetchRemoteHeads: vi.fn(async () => {
      throw new Error("not used in test");
    }),
    pushCurrentBranch: vi.fn(async () => ({
      outcome: GIT_REMOTE_PUBLISH_PUBLISHED,
      localHead: null,
      remoteHead: null,
    })),
    planReplayOntoRemote: vi.fn(async () => {
      throw new Error("not used in test");
    }),
    applyReplayPlanOntoRemote: vi.fn(async () => ({
      head: null,
      replayedCommitHashes: [],
    })),
    isRepoHealthy: vi.fn(async () => true),
    ...overrides,
  };
}

function createFileSystemMock(initialGitIgnore = ""): FileSystem {
  let contents = initialGitIgnore;
  return {
    readText: vi.fn(async () => contents),
    readBytes: vi.fn(async () => new Uint8Array()),
    writeText: vi.fn(async (_path: string, next: string) => {
      contents = next;
    }),
    atomicWriteText: vi.fn(async (_path: string, next: string) => {
      contents = next;
    }),
    atomicWriteBytes: vi.fn(async () => {}),
    writeBytes: vi.fn(async () => {}),
    exists: vi.fn(async () => true),
    list: vi.fn(async () => []),
    mkdir: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    move: vi.fn(async () => {}),
    createTempFile: vi.fn(async () => "/appData/temp/test.txt"),
  };
}

describe("ensureProjectGitReady", () => {
  it("creates baseline commit when history is empty", async () => {
    const project = createProjectMock();
    const fileSystem = createFileSystemMock();
    const gitProvider = createGitProviderMock({
      listHistory: vi.fn(async () => []),
    });

    await ensureProjectGitReady({
      fileSystem,
      gitProvider,
      loadedProject: project,
    });

    expect(gitProvider.ensureRepo).toHaveBeenCalledWith(
      "/userData/projects/p1",
      { defaultBranch: "master" },
    );
    expect(gitProvider.commitAll).toHaveBeenCalledTimes(1);
    expect(fileSystem.writeText).toHaveBeenCalledWith(
      "/userData/projects/p1/.gitignore",
      ".DS_Store\nThumbs.db\nnode_modules\n",
    );
  });

  it("attempts branch checkout when repo opens detached", async () => {
    const project = createProjectMock();
    const fileSystem = createFileSystemMock();
    const gitProvider = createGitProviderMock({
      getBranchInfo: vi.fn(async () => ({
        current: "",
        hasMaster: true,
        defaultBranch: "main",
        detached: true,
      })),
      listHistory: vi.fn(async () => [{ hash: "h1" }] as never),
    });

    await ensureProjectGitReady({
      fileSystem,
      gitProvider,
      loadedProject: project,
    });
    expect(gitProvider.checkoutPreferredBranch).toHaveBeenCalledWith(
      "/userData/projects/p1",
      { prefer: "master" },
    );
  });

  it("re-runs repo initialization when health check fails", async () => {
    const project = createProjectMock();
    const fileSystem = createFileSystemMock();
    const gitProvider = createGitProviderMock({
      isRepoHealthy: vi.fn(async () => false),
      listHistory: vi.fn(async () => [{ hash: "h1" }] as never),
    });

    await ensureProjectGitReady({
      fileSystem,
      gitProvider,
      loadedProject: project,
    });

    expect(gitProvider.ensureRepo).toHaveBeenCalledTimes(2);
  });

  it("does not throw when baseline commit fails with recoverable web git errors", async () => {
    const project = createProjectMock();
    const fileSystem = createFileSystemMock();
    const gitProvider = createGitProviderMock({
      listHistory: vi.fn(async () => []),
      commitAll: vi.fn(async () => {
        throw new Error("NotFoundError: Could not find 01-GEN.usfm.");
      }),
    });

    await expect(
      ensureProjectGitReady({
        fileSystem,
        gitProvider,
        loadedProject: project,
      }),
    ).resolves.toBeUndefined();
  });
});
