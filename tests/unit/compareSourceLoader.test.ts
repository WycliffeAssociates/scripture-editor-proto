import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CompareMetadataSummary } from "@/app/domain/project/compare/compareService.ts";
import { CompareSourceLoader } from "@/app/domain/project/compare/compareSourceLoader.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import { FsBackedAuthSessionProvider } from "@/core/persistence/FsBackedAuthSessionProvider.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import {
  GIT_REMOTE_INFO_SCHEMA_VERSION,
  type GitRemoteSession,
} from "@/core/persistence/gitRemoteModels.ts";
import { writeGitRemoteProjectInfo } from "@/core/persistence/gitRemoteStore.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

const remoteCompareSourceMock = vi.hoisted(() => ({
  buildRemoteLatestCompareSource: vi.fn(),
}));

vi.mock("@/app/domain/project/compare/remoteCompareSource.ts", () => ({
  buildRemoteLatestCompareSource:
    remoteCompareSourceMock.buildRemoteLatestCompareSource,
}));

const storageRoots: StorageRoots = {
  appDataRoot: "/appData",
  projectsRoot: "/userData/projects",
  tempRoot: "/appData/temp",
  cacheRoot: "/appData/cache",
  logsRoot: "/appData/logs",
  databaseRoot: "/appData/database",
};

function makeProject(): Project {
  return {
    folderName: "bho-bible",
    displayName: "Bho Bible",
    projectPath: "/userData/projects/bho-bible",
    projectId: "bho-bible",
    projectType: "scripture-burrito",
    language: {
      code: "bho",
      name: "Bhojpuri",
      direction: "ltr",
    },
    books: [],
    listBooks: async () => [],
    getBook: async () => {
      throw new Error("not needed");
    },
    saveBook: async () => {},
    addBook: async () => {
      throw new Error("not needed");
    },
    listVersions: async () => [],
    restoreVersion: async () => {},
    stageAndCommit: async () => ({ hash: "head" }),
  };
}

function makeLoader(fileSystem: InMemoryFileSystem) {
  const authSessionProvider = new FsBackedAuthSessionProvider(
    fileSystem,
    storageRoots,
  );
  const gitProvider = {
    fetchRemoteHeads: vi.fn(),
    readProjectSnapshotAtCommit: vi.fn(),
  } as unknown as GitProvider;
  const usfmOnionService = {
    supportsPathIo: false,
  } as unknown as IUsfmOnionService;

  return new CompareSourceLoader({
    projectsService: {
      openProjectReadOnly: vi.fn(),
    },
    fileSystem,
    storageRoots,
    usfmOnionService,
    authSessionProvider,
    gitProvider,
  });
}

async function seedRemoteInfo(fileSystem: InMemoryFileSystem) {
  await writeGitRemoteProjectInfo({
    fileSystem,
    storageRoots,
    info: {
      schemaVersion: GIT_REMOTE_INFO_SCHEMA_VERSION,
      projectPath: "/userData/projects/bho-bible",
      hostBaseUrl: "https://gitea.example.org",
      repoId: "1",
      repoOwner: "alice",
      repoName: "bho-bible",
      repoUrl: "https://gitea.example.org/alice/bho-bible",
      trackedBranch: "master",
    },
  });
}

async function seedSession(
  authSessionProvider: FsBackedAuthSessionProvider,
  overrides: Partial<GitRemoteSession> = {},
) {
  await authSessionProvider.replaceSession({
    hostBaseUrl: "https://gitea.example.org",
    username: "alice",
    token: "secret-token",
    tokenName: "zephyr-web",
    tokenId: "77",
    ...overrides,
  });
}

describe("CompareSourceLoader.loadRemoteLatest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads remote latest through the bridge when the linked host matches the active session", async () => {
    const fileSystem = new InMemoryFileSystem();
    const loader = makeLoader(fileSystem);
    const authSessionProvider = new FsBackedAuthSessionProvider(
      fileSystem,
      storageRoots,
    );
    const project = makeProject();
    const parsedFiles = [
      {
        bookCode: "GEN",
        path: "ingredients/GEN.usfm",
        title: "Genesis",
        prevBookId: null,
        nextBookId: null,
        chapters: [],
      },
    ] satisfies ScriptureBookState[];
    const metadataSummary: CompareMetadataSummary = {
      projectId: "bho-bible",
      languageId: "bho",
      languageDirection: "ltr",
    };
    await seedRemoteInfo(fileSystem);
    await seedSession(authSessionProvider);
    remoteCompareSourceMock.buildRemoteLatestCompareSource.mockResolvedValue({
      parsedFiles,
      metadataSummary,
      remoteSync: {
        remoteHead: "remote-head",
        trackedBranch: "master",
        relationship: "behindOnly",
      },
    });

    const result = await loader.loadRemoteLatest(project);

    expect(
      remoteCompareSourceMock.buildRemoteLatestCompareSource,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        loadedProject: project,
        remoteInfo: expect.objectContaining({
          repoName: "bho-bible",
          trackedBranch: "master",
        }),
        auth: {
          username: "alice",
          token: "secret-token",
        },
      }),
    );
    expect(result).toEqual({
      parsedFiles,
      metadataSummary,
      remoteSync: {
        remoteHead: "remote-head",
        trackedBranch: "master",
        relationship: "behindOnly",
      },
    });
  });

  it("throws when the project is not linked to a remote source", async () => {
    const fileSystem = new InMemoryFileSystem();
    const loader = makeLoader(fileSystem);

    await expect(loader.loadRemoteLatest(makeProject())).rejects.toThrow(
      /not linked to a remote source/u,
    );
    expect(
      remoteCompareSourceMock.buildRemoteLatestCompareSource,
    ).not.toHaveBeenCalled();
  });

  it("throws when the active session belongs to a different linked host", async () => {
    const fileSystem = new InMemoryFileSystem();
    const loader = makeLoader(fileSystem);
    await seedRemoteInfo(fileSystem);
    await seedSession(
      new FsBackedAuthSessionProvider(fileSystem, storageRoots),
      {
        hostBaseUrl: "https://other.example.org",
      },
    );

    await expect(loader.loadRemoteLatest(makeProject())).rejects.toThrow(
      /requires an active session/u,
    );
    expect(
      remoteCompareSourceMock.buildRemoteLatestCompareSource,
    ).not.toHaveBeenCalled();
  });
});
