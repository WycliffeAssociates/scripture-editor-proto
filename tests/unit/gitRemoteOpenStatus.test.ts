import { describe, expect, it, vi } from "vitest";
import {
    GIT_REMOTE_OPEN_STATUS_CONNECTED,
    GIT_REMOTE_OPEN_STATUS_NEEDS_REVIEW,
    GIT_REMOTE_OPEN_STATUS_NOT_LINKED,
    GIT_REMOTE_OPEN_STATUS_OFFLINE,
    GIT_REMOTE_OPEN_STATUS_PENDING_PUBLISH,
    GIT_REMOTE_OPEN_STATUS_REAUTH_REQUIRED,
    GIT_REMOTE_OPEN_STATUS_REMOTE_UPDATES_AVAILABLE,
    GIT_REMOTE_OPEN_STATUS_SKIPPED_AUTO_SYNC,
    hydrateGitRemoteStatusOnOpen,
} from "@/app/domain/project/gitRemoteOpenStatus.ts";
import type { SettingsManager } from "@/app/data/settings.ts";
import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import {
    GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH,
} from "@/core/persistence/gitRemoteModels.ts";
import {
    GIT_REMOTE_RELATIONSHIP_AHEAD_ONLY,
    GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY,
    GIT_REMOTE_RELATIONSHIP_DIVERGED,
    GIT_REMOTE_RELATIONSHIP_UP_TO_DATE,
} from "@/core/persistence/gitRemoteRelationship.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import {
    readGitRemoteProjectStatus,
    writeGitRemoteProjectInfo,
    writeGitRemoteProjectStatus,
} from "@/core/persistence/gitRemoteStore.ts";
import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";

const storageRoots: StorageRoots = {
    appDataRoot: "/appData",
    projectsRoot: "/userData/projects",
    tempRoot: "/appData/temp",
    cacheRoot: "/appData/cache",
    logsRoot: "/appData/logs",
    databaseRoot: "/appData/database",
};

function createSettingsManager(autoSyncOnOpen: boolean): SettingsManager {
    const settings = {
        fontSize: "16px",
        fontFamily: "Inter",
        zoom: 1,
        canSetZoom: true,
        canAccessSystemFonts: true,
        lastProjectPath: null,
        lastBookIdentifier: null,
        lastChapterNumber: null,
        restoreToLastProjectOnLaunch: true as const,
        editorMode: "regular" as const,
        appLanguage: "en" as const,
        appDirection: "ltr" as const,
        colorScheme: "light" as const,
        autoSyncOnOpen,
        autoPushOnSave: true,
    };
    return {
        getSettings: () => settings,
        get: (key) => settings[key],
        set: vi.fn(),
        update: vi.fn(),
        applySettings: vi.fn(),
    };
}

function createAuthSessionProvider(
    session: Awaited<ReturnType<AuthSessionProvider["getCurrentSession"]>>,
): AuthSessionProvider {
    return {
        getCurrentSession: vi.fn().mockResolvedValue(session),
        loginWithPassword: vi.fn(),
        replaceSession: vi.fn(),
        logoutCurrentSession: vi.fn().mockResolvedValue(undefined),
        clearSession: vi.fn(),
    };
}

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
        ensureRemote: vi.fn(),
        inspectRemoteHeads: vi.fn(),
        fetchRemoteHeads: vi.fn(),
        pushCurrentBranch: vi.fn(),
        planReplayOntoRemote: vi.fn(),
        applyReplayPlanOntoRemote: vi.fn(),
        isRepoHealthy: vi.fn(),
    };
}

async function seedLinkedProject(fileSystem: InMemoryFileSystem) {
    await writeGitRemoteProjectInfo({
        fileSystem,
        storageRoots,
        info: {
            schemaVersion: 1,
            projectPath: "/userData/projects/foo",
            hostBaseUrl: "https://gitea.example.org",
            repoId: "1",
            repoOwner: "alice",
            repoName: "foo",
            repoUrl: "https://gitea.example.org/alice/foo",
            trackedBranch: "master",
        },
    });
}

function makeInspection(
    relationshipKind:
        | typeof GIT_REMOTE_RELATIONSHIP_UP_TO_DATE
        | typeof GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY
        | typeof GIT_REMOTE_RELATIONSHIP_DIVERGED
        | typeof GIT_REMOTE_RELATIONSHIP_AHEAD_ONLY,
) {
    return {
        localHead: "local-head",
        remoteHead: "remote-head",
        mergeBase: "base-head",
        relationship: {
            kind: relationshipKind,
            localHead: "local-head",
            remoteHead: "remote-head",
            mergeBase: "base-head",
        },
    };
}

function makeLoadedProject(): Pick<Project, "books" | "getBook"> {
    return {
        books: [
            {
                bookCode: "GEN",
                title: "Genesis",
                fileName: "01-GEN.usfm",
                storageKey: "01-GEN.usfm",
                path: "/userData/projects/foo/01-GEN.usfm",
            },
        ],
        getBook: vi.fn(async () => ({
            bookCode: "GEN",
            title: "Genesis",
            fileName: "01-GEN.usfm",
            storageKey: "01-GEN.usfm",
            path: "/userData/projects/foo/01-GEN.usfm",
            contents: "\\id GEN\n\\c 1\n\\v 1 In the beginning",
        })),
    };
}

describe("hydrateGitRemoteStatusOnOpen", () => {
    it("returns notLinked when the project has no remote info", async () => {
        const fileSystem = new InMemoryFileSystem();

        await expect(
            hydrateGitRemoteStatusOnOpen({
                projectPath: "/userData/projects/foo",
                fileSystem,
                storageRoots,
                settingsManager: createSettingsManager(true),
                authSessionProvider: createAuthSessionProvider(null),
                gitProvider: createGitProvider(),
                now: () => "2026-03-30T20:00:00.000Z",
            }),
        ).resolves.toEqual({ kind: GIT_REMOTE_OPEN_STATUS_NOT_LINKED });
    });

    it("marks reauth required when the active session is missing", async () => {
        const fileSystem = new InMemoryFileSystem();
        await seedLinkedProject(fileSystem);

        await expect(
            hydrateGitRemoteStatusOnOpen({
                projectPath: "/userData/projects/foo",
                fileSystem,
                storageRoots,
                settingsManager: createSettingsManager(true),
                authSessionProvider: createAuthSessionProvider(null),
                gitProvider: createGitProvider(),
                now: () => "2026-03-30T20:00:00.000Z",
            }),
        ).resolves.toMatchObject({
            kind: GIT_REMOTE_OPEN_STATUS_REAUTH_REQUIRED,
        });
    });

    it("does not fetch automatically when auto sync on open is disabled", async () => {
        const fileSystem = new InMemoryFileSystem();
        const gitProvider = createGitProvider();
        await seedLinkedProject(fileSystem);
        await writeGitRemoteProjectStatus({
            fileSystem,
            storageRoots,
            status: {
                projectPath: "/userData/projects/foo",
                kind: GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH,
                lastCheckedAt: "2026-03-29T20:00:00.000Z",
                lastPublishedAt: null,
                lastKnownLocalHead: "local-head",
                lastKnownRemoteHead: null,
            },
        });

        await expect(
            hydrateGitRemoteStatusOnOpen({
                projectPath: "/userData/projects/foo",
                fileSystem,
                storageRoots,
                settingsManager: createSettingsManager(false),
                authSessionProvider: createAuthSessionProvider({
                    hostBaseUrl: "https://gitea.example.org",
                    username: "alice",
                    token: "token",
                    tokenId: "1",
                    tokenName: "dovetail-web",
                }),
                gitProvider,
                now: () => "2026-03-30T20:00:00.000Z",
            }),
        ).resolves.toMatchObject({
            kind: GIT_REMOTE_OPEN_STATUS_SKIPPED_AUTO_SYNC,
            status: {
                kind: GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH,
            },
        });

        expect(gitProvider.fetchRemoteHeads).not.toHaveBeenCalled();
    });

    it("marks connected when fetched remote heads are up to date", async () => {
        const fileSystem = new InMemoryFileSystem();
        const gitProvider = createGitProvider();
        vi.mocked(gitProvider.fetchRemoteHeads).mockResolvedValue(
            makeInspection(GIT_REMOTE_RELATIONSHIP_UP_TO_DATE),
        );
        await seedLinkedProject(fileSystem);

        await expect(
            hydrateGitRemoteStatusOnOpen({
                projectPath: "/userData/projects/foo",
                fileSystem,
                storageRoots,
                settingsManager: createSettingsManager(true),
                authSessionProvider: createAuthSessionProvider({
                    hostBaseUrl: "https://gitea.example.org",
                    username: "alice",
                    token: "token",
                    tokenId: "1",
                    tokenName: "dovetail-web",
                }),
                gitProvider,
                now: () => "2026-03-30T20:00:00.000Z",
            }),
        ).resolves.toMatchObject({
            kind: GIT_REMOTE_OPEN_STATUS_CONNECTED,
        });
    });

    it("marks remote updates available when the remote is ahead", async () => {
        const fileSystem = new InMemoryFileSystem();
        const gitProvider = createGitProvider();
        vi.mocked(gitProvider.fetchRemoteHeads).mockResolvedValue(
            makeInspection(GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY),
        );
        await seedLinkedProject(fileSystem);

        await expect(
            hydrateGitRemoteStatusOnOpen({
                projectPath: "/userData/projects/foo",
                fileSystem,
                storageRoots,
                settingsManager: createSettingsManager(true),
                authSessionProvider: createAuthSessionProvider({
                    hostBaseUrl: "https://gitea.example.org",
                    username: "alice",
                    token: "token",
                    tokenId: "1",
                    tokenName: "dovetail-web",
                }),
                gitProvider,
                now: () => "2026-03-30T20:00:00.000Z",
            }),
        ).resolves.toMatchObject({
            kind: GIT_REMOTE_OPEN_STATUS_REMOTE_UPDATES_AVAILABLE,
        });
    });

    it("marks needs review when local and remote have diverged", async () => {
        const fileSystem = new InMemoryFileSystem();
        const gitProvider = createGitProvider();
        vi.mocked(gitProvider.fetchRemoteHeads).mockResolvedValue(
            makeInspection(GIT_REMOTE_RELATIONSHIP_DIVERGED),
        );
        await seedLinkedProject(fileSystem);

        await expect(
            hydrateGitRemoteStatusOnOpen({
                projectPath: "/userData/projects/foo",
                fileSystem,
                storageRoots,
                settingsManager: createSettingsManager(true),
                authSessionProvider: createAuthSessionProvider({
                    hostBaseUrl: "https://gitea.example.org",
                    username: "alice",
                    token: "token",
                    tokenId: "1",
                    tokenName: "dovetail-web",
                }),
                gitProvider,
                now: () => "2026-03-30T20:00:00.000Z",
            }),
        ).resolves.toMatchObject({
            kind: GIT_REMOTE_OPEN_STATUS_NEEDS_REVIEW,
        });
    });

    it("auto-aligns to connected when remote ancestry diverges but latest content is identical", async () => {
        const fileSystem = new InMemoryFileSystem();
        const gitProvider = createGitProvider();
        vi.mocked(gitProvider.fetchRemoteHeads).mockResolvedValue(
            makeInspection(GIT_REMOTE_RELATIONSHIP_DIVERGED),
        );
        vi.mocked(gitProvider.readProjectSnapshotAtCommit).mockResolvedValue(
            new Map([["01-GEN.usfm", "\\id GEN\n\\c 1\n\\v 1 In the beginning"]]),
        );
        vi.mocked(gitProvider.applyReplayPlanOntoRemote).mockResolvedValue({
            head: "remote-head",
            replayedCommitHashes: [],
        });
        await seedLinkedProject(fileSystem);

        await expect(
            hydrateGitRemoteStatusOnOpen({
                projectPath: "/userData/projects/foo",
                loadedProject: makeLoadedProject(),
                fileSystem,
                storageRoots,
                settingsManager: createSettingsManager(true),
                authSessionProvider: createAuthSessionProvider({
                    hostBaseUrl: "https://gitea.example.org",
                    username: "alice",
                    token: "token",
                    tokenId: "1",
                    tokenName: "dovetail-web",
                }),
                gitProvider,
                now: () => "2026-03-30T20:00:00.000Z",
            }),
        ).resolves.toMatchObject({
            kind: GIT_REMOTE_OPEN_STATUS_CONNECTED,
            status: {
                kind: "connected",
                lastKnownLocalHead: "remote-head",
                lastKnownRemoteHead: "remote-head",
            },
        });

        expect(gitProvider.applyReplayPlanOntoRemote).toHaveBeenCalledWith({
            projectPath: "/userData/projects/foo",
            branch: "master",
            remoteHead: "remote-head",
            commitHashes: [],
        });
    });

    it("marks pending publish when local history is ahead of remote", async () => {
        const fileSystem = new InMemoryFileSystem();
        const gitProvider = createGitProvider();
        vi.mocked(gitProvider.fetchRemoteHeads).mockResolvedValue(
            makeInspection(GIT_REMOTE_RELATIONSHIP_AHEAD_ONLY),
        );
        await seedLinkedProject(fileSystem);

        const result = await hydrateGitRemoteStatusOnOpen({
            projectPath: "/userData/projects/foo",
            fileSystem,
            storageRoots,
            settingsManager: createSettingsManager(true),
            authSessionProvider: createAuthSessionProvider({
                hostBaseUrl: "https://gitea.example.org",
                username: "alice",
                token: "token",
                tokenId: "1",
                tokenName: "dovetail-web",
            }),
            gitProvider,
            now: () => "2026-03-30T20:00:00.000Z",
        });

        expect(result).toMatchObject({
            kind: GIT_REMOTE_OPEN_STATUS_PENDING_PUBLISH,
        });
        await expect(
            readGitRemoteProjectStatus({
                fileSystem,
                storageRoots,
                projectPath: "/userData/projects/foo",
            }),
        ).resolves.toMatchObject({
            kind: GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH,
        });
    });

    it("marks offline when fetch fails due to a network-like error", async () => {
        const fileSystem = new InMemoryFileSystem();
        const gitProvider = createGitProvider();
        vi.mocked(gitProvider.fetchRemoteHeads).mockRejectedValue(
            new Error("network request failed"),
        );
        await seedLinkedProject(fileSystem);

        await expect(
            hydrateGitRemoteStatusOnOpen({
                projectPath: "/userData/projects/foo",
                fileSystem,
                storageRoots,
                settingsManager: createSettingsManager(true),
                authSessionProvider: createAuthSessionProvider({
                    hostBaseUrl: "https://gitea.example.org",
                    username: "alice",
                    token: "token",
                    tokenId: "1",
                    tokenName: "dovetail-web",
                }),
                gitProvider,
                now: () => "2026-03-30T20:00:00.000Z",
            }),
        ).resolves.toMatchObject({
            kind: GIT_REMOTE_OPEN_STATUS_OFFLINE,
        });
    });
});
