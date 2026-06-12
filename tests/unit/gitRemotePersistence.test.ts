import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";
import { describe, expect, it } from "vitest";

import { settingsDefaults } from "@/app/data/settings.ts";
import {
  GIT_REMOTE_INFO_SCHEMA_VERSION,
  createDefaultGitRemoteProjectStatus,
  parseGitRemoteProjectInfo,
  parseGitRemoteProjectStatus,
} from "@/core/persistence/gitRemoteModels.ts";
import {
  GIT_REMOTE_SESSION_FILENAME,
  getGitRemoteProjectInfoPath,
  getGitRemoteProjectStatusPath,
  getGitRemoteSessionPath,
  getGitRemoteStateRoot,
  toProjectStorageKey,
} from "@/core/persistence/gitRemotePaths.ts";
import {
  applyGitRemoteProjectStatus,
  deleteGitRemoteProjectInfo,
  deleteGitRemoteProjectStatus,
  deleteGitRemoteSession,
  readGitRemoteProjectInfo,
  readGitRemoteProjectStatus,
  readGitRemoteSession,
  writeGitRemoteProjectInfo,
  writeGitRemoteProjectStatus,
  writeGitRemoteSession,
} from "@/core/persistence/gitRemoteStore.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

const storageRoots: StorageRoots = {
  appDataRoot: "/appData",
  projectsRoot: "/userData/projects",
  tempRoot: "/appData/temp",
  cacheRoot: "/appData/cache",
  logsRoot: "/appData/logs",
  databaseRoot: "/appData/database",
};

describe("git remote settings defaults", () => {
  it("enables auto-sync-on-open and auto-push-on-save by default", () => {
    expect(settingsDefaults.autoSyncOnOpen).toBe(true);
    expect(settingsDefaults.autoPushOnSave).toBe(true);
  });
});

describe("git remote path helpers", () => {
  it("stores project and session records beneath the app-data root", () => {
    expect(getGitRemoteStateRoot(storageRoots)).toBe("/appData/git-remote");
    expect(getGitRemoteSessionPath(storageRoots)).toBe(
      `/appData/git-remote/${GIT_REMOTE_SESSION_FILENAME}`,
    );
    expect(
      getGitRemoteProjectInfoPath(storageRoots, "/userData/projects/foo"),
    ).toBe(
      `/appData/git-remote/project-info/${toProjectStorageKey("/userData/projects/foo")}.json`,
    );
    expect(
      getGitRemoteProjectStatusPath(storageRoots, "/userData/projects/foo"),
    ).toBe(
      `/appData/git-remote/project-status/${toProjectStorageKey("/userData/projects/foo")}.json`,
    );
  });
});

describe("git remote model parsing", () => {
  it("rejects unsupported project info schema versions", () => {
    expect(() =>
      parseGitRemoteProjectInfo({
        schemaVersion: 999,
        projectPath: "/userData/projects/foo",
        hostBaseUrl: "https://example.org",
        repoId: "1",
        repoOwner: "alice",
        repoName: "foo",
        repoUrl: "https://example.org/alice/foo",
        trackedBranch: "master",
      }),
    ).toThrow(/Unsupported git remote info schema version/u);
  });

  it("rejects unsupported status values", () => {
    expect(() =>
      parseGitRemoteProjectStatus({
        projectPath: "/userData/projects/foo",
        kind: "mystery-status",
        lastCheckedAt: null,
        lastPublishedAt: null,
        lastKnownLocalHead: null,
        lastKnownRemoteHead: null,
      }),
    ).toThrow(/Unsupported git remote project status/u);
  });

  it("coerces legacy syncing status to connected", () => {
    expect(
      parseGitRemoteProjectStatus({
        projectPath: "/userData/projects/foo",
        kind: "syncing",
        lastCheckedAt: "2026-03-27T00:00:00.000Z",
        lastPublishedAt: null,
        lastKnownLocalHead: "abc123",
        lastKnownRemoteHead: "def456",
        latestIncomingAuthorName: "Alice",
        lastKnownLocalHeadAuthoredAt: null,
        lastKnownRemoteHeadAuthoredAt: null,
      }),
    ).toEqual({
      projectPath: "/userData/projects/foo",
      kind: "connected",
      lastCheckedAt: "2026-03-27T00:00:00.000Z",
      lastPublishedAt: null,
      lastKnownLocalHead: "abc123",
      lastKnownRemoteHead: "def456",
      latestIncomingAuthorName: "Alice",
      lastKnownLocalHeadAuthoredAt: null,
      lastKnownRemoteHeadAuthoredAt: null,
    });
  });

  it("creates an empty per-project status record with null timestamps and heads", () => {
    expect(
      createDefaultGitRemoteProjectStatus("/userData/projects/foo"),
    ).toEqual({
      projectPath: "/userData/projects/foo",
      kind: "connected",
      lastCheckedAt: null,
      lastPublishedAt: null,
      lastKnownLocalHead: null,
      lastKnownRemoteHead: null,
      latestIncomingAuthorName: null,
      lastKnownLocalHeadAuthoredAt: null,
      lastKnownRemoteHeadAuthoredAt: null,
    });
  });
});

describe("git remote json persistence", () => {
  it("round-trips project info through the filesystem seam", async () => {
    const fileSystem = new InMemoryFileSystem();

    await writeGitRemoteProjectInfo({
      fileSystem,
      storageRoots,
      info: {
        schemaVersion: GIT_REMOTE_INFO_SCHEMA_VERSION,
        projectPath: "/userData/projects/foo",
        hostBaseUrl: "https://example.org",
        repoId: "42",
        repoOwner: "alice",
        repoName: "foo",
        repoUrl: "https://example.org/alice/foo",
        trackedBranch: "master",
      },
    });

    await expect(
      readGitRemoteProjectInfo({
        fileSystem,
        storageRoots,
        projectPath: "/userData/projects/foo",
      }),
    ).resolves.toEqual({
      schemaVersion: GIT_REMOTE_INFO_SCHEMA_VERSION,
      projectPath: "/userData/projects/foo",
      hostBaseUrl: "https://example.org",
      repoId: "42",
      repoOwner: "alice",
      repoName: "foo",
      repoUrl: "https://example.org/alice/foo",
      trackedBranch: "master",
    });
  });

  it("round-trips per-project status and session records", async () => {
    const fileSystem = new InMemoryFileSystem();

    await writeGitRemoteProjectStatus({
      fileSystem,
      storageRoots,
      status: {
        projectPath: "/userData/projects/foo",
        kind: "pendingPublish",
        lastCheckedAt: "2026-03-27T00:00:00.000Z",
        lastPublishedAt: null,
        lastKnownLocalHead: "abc123",
        lastKnownRemoteHead: "def456",
        lastKnownLocalHeadAuthoredAt: null,
        lastKnownRemoteHeadAuthoredAt: null,
      },
    });
    await writeGitRemoteSession({
      fileSystem,
      storageRoots,
      session: {
        hostBaseUrl: "https://example.org",
        username: "alice",
        token: "secret",
        tokenName: "zephyr-web",
        tokenId: "99",
      },
    });

    await expect(
      readGitRemoteProjectStatus({
        fileSystem,
        storageRoots,
        projectPath: "/userData/projects/foo",
      }),
    ).resolves.toEqual({
      projectPath: "/userData/projects/foo",
      kind: "pendingPublish",
      lastCheckedAt: "2026-03-27T00:00:00.000Z",
      lastPublishedAt: null,
      lastKnownLocalHead: "abc123",
      lastKnownRemoteHead: "def456",
      latestIncomingAuthorName: null,
      lastKnownLocalHeadAuthoredAt: null,
      lastKnownRemoteHeadAuthoredAt: null,
    });
    await expect(
      readGitRemoteSession({
        fileSystem,
        storageRoots,
      }),
    ).resolves.toEqual({
      hostBaseUrl: "https://example.org",
      username: "alice",
      token: "secret",
      tokenName: "zephyr-web",
      tokenId: "99",
    });
  });

  it("returns null for missing records and supports deletion", async () => {
    const fileSystem = new InMemoryFileSystem();

    await expect(
      readGitRemoteProjectInfo({
        fileSystem,
        storageRoots,
        projectPath: "/userData/projects/foo",
      }),
    ).resolves.toBeNull();

    await writeGitRemoteProjectInfo({
      fileSystem,
      storageRoots,
      info: {
        schemaVersion: GIT_REMOTE_INFO_SCHEMA_VERSION,
        projectPath: "/userData/projects/foo",
        hostBaseUrl: "https://example.org",
        repoId: "42",
        repoOwner: "alice",
        repoName: "foo",
        repoUrl: "https://example.org/alice/foo",
        trackedBranch: "master",
      },
    });
    await writeGitRemoteProjectStatus({
      fileSystem,
      storageRoots,
      status: {
        projectPath: "/userData/projects/foo",
        kind: "connected",
        lastCheckedAt: null,
        lastPublishedAt: null,
        lastKnownLocalHead: null,
        lastKnownRemoteHead: null,
      },
    });
    await writeGitRemoteSession({
      fileSystem,
      storageRoots,
      session: {
        hostBaseUrl: "https://example.org",
        username: "alice",
        token: "secret",
        tokenName: null,
        tokenId: "99",
      },
    });

    await deleteGitRemoteProjectInfo({
      fileSystem,
      storageRoots,
      projectPath: "/userData/projects/foo",
    });
    await deleteGitRemoteProjectStatus({
      fileSystem,
      storageRoots,
      projectPath: "/userData/projects/foo",
    });
    await deleteGitRemoteSession({
      fileSystem,
      storageRoots,
    });

    await expect(
      readGitRemoteProjectInfo({
        fileSystem,
        storageRoots,
        projectPath: "/userData/projects/foo",
      }),
    ).resolves.toBeNull();
    await expect(
      readGitRemoteProjectStatus({
        fileSystem,
        storageRoots,
        projectPath: "/userData/projects/foo",
      }),
    ).resolves.toBeNull();
    await expect(
      readGitRemoteSession({
        fileSystem,
        storageRoots,
      }),
    ).resolves.toBeNull();
  });

  it("serializes per-project status read-modify-write updates", async () => {
    const fileSystem = new InMemoryFileSystem();
    await writeGitRemoteProjectStatus({
      fileSystem,
      storageRoots,
      status: {
        projectPath: "/userData/projects/foo",
        kind: "connected",
        lastCheckedAt: null,
        lastPublishedAt: null,
        lastKnownLocalHead: null,
        lastKnownRemoteHead: null,
      },
    });

    let releaseFirst!: () => void;
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = applyGitRemoteProjectStatus({
      fileSystem,
      storageRoots,
      projectPath: "/userData/projects/foo",
      update: async (existing) => {
        await firstCanFinish;
        return {
          ...(existing ??
            createDefaultGitRemoteProjectStatus("/userData/projects/foo")),
          kind: "pendingPublish",
          lastKnownLocalHead: "local-1",
        };
      },
    });
    const second = applyGitRemoteProjectStatus({
      fileSystem,
      storageRoots,
      projectPath: "/userData/projects/foo",
      update: (existing) => ({
        ...(existing ??
          createDefaultGitRemoteProjectStatus("/userData/projects/foo")),
        kind: "needsReview",
        lastKnownRemoteHead: "remote-2",
      }),
    });

    releaseFirst();
    await Promise.all([first, second]);

    await expect(
      readGitRemoteProjectStatus({
        fileSystem,
        storageRoots,
        projectPath: "/userData/projects/foo",
      }),
    ).resolves.toMatchObject({
      kind: "needsReview",
      lastKnownLocalHead: "local-1",
      lastKnownRemoteHead: "remote-2",
    });
  });
});
