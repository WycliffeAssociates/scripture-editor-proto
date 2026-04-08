import { describe, expect, it, vi } from "vitest";
import {
    PUBLISH_AFTER_SAVE_NEEDS_REVIEW,
    PUBLISH_AFTER_SAVE_NOT_LINKED,
    PUBLISH_AFTER_SAVE_PENDING_AUTO_PUSH_DISABLED,
    PUBLISH_AFTER_SAVE_PENDING_OFFLINE,
    PUBLISH_AFTER_SAVE_PENDING_PUBLISH,
    PUBLISH_AFTER_SAVE_PUBLISHED,
    PUBLISH_AFTER_SAVE_REAUTH_REQUIRED,
    publishLinkedProjectNow,
    publishLinkedProjectAfterSave,
} from "@/app/domain/project/gitRemotePublishCoordinator.ts";
import type { SettingsManager } from "@/app/data/settings.ts";
import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";
import {
    GIT_REMOTE_PUBLISH_AUTH_FAILED,
    GIT_REMOTE_PUBLISH_OFFLINE,
    GIT_REMOTE_PUBLISH_PUBLISHED,
    GIT_REMOTE_PUBLISH_REMOTE_ADVANCED,
    type GitProvider,
} from "@/core/persistence/GitProvider.ts";
import {
    GIT_REMOTE_PROJECT_STATUS_CONNECTED,
    GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW,
    GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH,
    GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED,
} from "@/core/persistence/gitRemoteModels.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import {
    readGitRemoteProjectStatus,
    writeGitRemoteProjectInfo,
} from "@/core/persistence/gitRemoteStore.ts";
import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";

const storageRoots: StorageRoots = {
    appDataRoot: "/appData",
    projectsRoot: "/userData/projects",
    tempRoot: "/appData/temp",
    cacheRoot: "/appData/cache",
    logsRoot: "/appData/logs",
    databaseRoot: "/appData/database",
};

function createSettingsManager(autoPushOnSave: boolean): SettingsManager {
    return {
        getSettings: () => ({
            fontSize: "16px",
            fontFamily: "Inter",
            zoom: 1,
            canSetZoom: true,
            canAccessSystemFonts: true,
            lastProjectPath: null,
            lastBookIdentifier: null,
            lastChapterNumber: null,
            restoreToLastProjectOnLaunch: true,
            editorMode: "regular",
            appLanguage: "en",
            appDirection: "ltr",
            colorScheme: "light",
            autoSyncOnOpen: true,
            autoPushOnSave,
            autoAcceptOwnWorkOnSave: false,
            autoAcceptIncomingWork: false,
            diffViewModeDefault: "list",
        }),
        get: (key) => createSettingsManager(autoPushOnSave).getSettings()[key],
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

function createGitProvider(
    outcome:
        | typeof GIT_REMOTE_PUBLISH_PUBLISHED
        | typeof GIT_REMOTE_PUBLISH_REMOTE_ADVANCED
        | typeof GIT_REMOTE_PUBLISH_OFFLINE
        | typeof GIT_REMOTE_PUBLISH_AUTH_FAILED,
    localHead = "local-head",
    remoteHead: string | null = "remote-head",
): GitProvider {
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
        pushCurrentBranch: vi.fn().mockResolvedValue({
            outcome,
            localHead,
            remoteHead,
        }),
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

describe("publishLinkedProjectAfterSave", () => {
    it("returns notLinked when no remote info exists", async () => {
        const fileSystem = new InMemoryFileSystem();

        await expect(
            publishLinkedProjectAfterSave({
                projectPath: "/userData/projects/foo",
                localHead: "local-head",
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
                gitProvider: createGitProvider(GIT_REMOTE_PUBLISH_PUBLISHED),
                now: () => "2026-03-30T20:00:00.000Z",
            }),
        ).resolves.toEqual({ kind: PUBLISH_AFTER_SAVE_NOT_LINKED });
    });

    it("marks pending publish when auto push is disabled", async () => {
        const fileSystem = new InMemoryFileSystem();
        await seedLinkedProject(fileSystem);

        await expect(
            publishLinkedProjectAfterSave({
                projectPath: "/userData/projects/foo",
                localHead: "local-head",
                fileSystem,
                storageRoots,
                settingsManager: createSettingsManager(false),
                authSessionProvider: createAuthSessionProvider(null),
                gitProvider: createGitProvider(GIT_REMOTE_PUBLISH_PUBLISHED),
                now: () => "2026-03-30T20:00:00.000Z",
            }),
        ).resolves.toEqual({
            kind: PUBLISH_AFTER_SAVE_PENDING_PUBLISH,
            reason: PUBLISH_AFTER_SAVE_PENDING_AUTO_PUSH_DISABLED,
        });

        await expect(
            readGitRemoteProjectStatus({
                fileSystem,
                storageRoots,
                projectPath: "/userData/projects/foo",
            }),
        ).resolves.toMatchObject({
            kind: GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH,
            lastKnownLocalHead: "local-head",
        });
    });

    it("marks reauth required when the active session is missing or for another host", async () => {
        const fileSystem = new InMemoryFileSystem();
        await seedLinkedProject(fileSystem);

        await expect(
            publishLinkedProjectAfterSave({
                projectPath: "/userData/projects/foo",
                localHead: "local-head",
                fileSystem,
                storageRoots,
                settingsManager: createSettingsManager(true),
                authSessionProvider: createAuthSessionProvider({
                    hostBaseUrl: "https://other.example.org",
                    username: "alice",
                    token: "token",
                    tokenId: "1",
                    tokenName: "dovetail-web",
                }),
                gitProvider: createGitProvider(GIT_REMOTE_PUBLISH_PUBLISHED),
                now: () => "2026-03-30T20:00:00.000Z",
            }),
        ).resolves.toEqual({ kind: PUBLISH_AFTER_SAVE_REAUTH_REQUIRED });

        await expect(
            readGitRemoteProjectStatus({
                fileSystem,
                storageRoots,
                projectPath: "/userData/projects/foo",
            }),
        ).resolves.toMatchObject({
            kind: GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED,
            lastKnownLocalHead: "local-head",
        });
    });

    it("marks connected when publish succeeds", async () => {
        const fileSystem = new InMemoryFileSystem();
        await seedLinkedProject(fileSystem);

        await expect(
            publishLinkedProjectAfterSave({
                projectPath: "/userData/projects/foo",
                localHead: "local-head",
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
                gitProvider: createGitProvider(
                    GIT_REMOTE_PUBLISH_PUBLISHED,
                    "local-head",
                    "local-head",
                ),
                now: () => "2026-03-30T20:00:00.000Z",
            }),
        ).resolves.toEqual({ kind: PUBLISH_AFTER_SAVE_PUBLISHED });

        await expect(
            readGitRemoteProjectStatus({
                fileSystem,
                storageRoots,
                projectPath: "/userData/projects/foo",
            }),
        ).resolves.toMatchObject({
            kind: GIT_REMOTE_PROJECT_STATUS_CONNECTED,
            lastKnownLocalHead: "local-head",
            lastKnownRemoteHead: "local-head",
            lastPublishedAt: "2026-03-30T20:00:00.000Z",
        });
    });

    it("marks needs review when remote advanced", async () => {
        const fileSystem = new InMemoryFileSystem();
        await seedLinkedProject(fileSystem);

        await expect(
            publishLinkedProjectAfterSave({
                projectPath: "/userData/projects/foo",
                localHead: "local-head",
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
                gitProvider: createGitProvider(
                    GIT_REMOTE_PUBLISH_REMOTE_ADVANCED,
                    "local-head",
                    "remote-head",
                ),
                now: () => "2026-03-30T20:00:00.000Z",
            }),
        ).resolves.toEqual({ kind: PUBLISH_AFTER_SAVE_NEEDS_REVIEW });

        await expect(
            readGitRemoteProjectStatus({
                fileSystem,
                storageRoots,
                projectPath: "/userData/projects/foo",
            }),
        ).resolves.toMatchObject({
            kind: GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW,
            lastKnownLocalHead: "local-head",
            lastKnownRemoteHead: "remote-head",
        });
    });

    it("marks pending publish when network publish fails offline", async () => {
        const fileSystem = new InMemoryFileSystem();
        await seedLinkedProject(fileSystem);

        await expect(
            publishLinkedProjectAfterSave({
                projectPath: "/userData/projects/foo",
                localHead: "local-head",
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
                gitProvider: createGitProvider(
                    GIT_REMOTE_PUBLISH_OFFLINE,
                    "local-head",
                    null,
                ),
                now: () => "2026-03-30T20:00:00.000Z",
            }),
        ).resolves.toEqual({
            kind: PUBLISH_AFTER_SAVE_PENDING_PUBLISH,
            reason: PUBLISH_AFTER_SAVE_PENDING_OFFLINE,
        });
    });

    it("marks reauth required when publish auth fails", async () => {
        const fileSystem = new InMemoryFileSystem();
        await seedLinkedProject(fileSystem);

        await expect(
            publishLinkedProjectAfterSave({
                projectPath: "/userData/projects/foo",
                localHead: "local-head",
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
                gitProvider: createGitProvider(
                    GIT_REMOTE_PUBLISH_AUTH_FAILED,
                    "local-head",
                    "remote-head",
                ),
                now: () => "2026-03-30T20:00:00.000Z",
            }),
        ).resolves.toEqual({ kind: PUBLISH_AFTER_SAVE_REAUTH_REQUIRED });
    });
});

describe("publishLinkedProjectNow", () => {
    it("publishes even when auto-push-on-save is disabled", async () => {
        const fileSystem = new InMemoryFileSystem();
        await seedLinkedProject(fileSystem);

        await expect(
            publishLinkedProjectNow({
                projectPath: "/userData/projects/foo",
                fileSystem,
                storageRoots,
                authSessionProvider: createAuthSessionProvider({
                    hostBaseUrl: "https://gitea.example.org",
                    username: "alice",
                    token: "token",
                    tokenId: "1",
                    tokenName: "dovetail-web",
                }),
                gitProvider: createGitProvider(
                    GIT_REMOTE_PUBLISH_PUBLISHED,
                    "local-head",
                    "local-head",
                ),
                now: () => "2026-03-30T20:00:00.000Z",
            }),
        ).resolves.toEqual({ kind: PUBLISH_AFTER_SAVE_PUBLISHED });

        await expect(
            readGitRemoteProjectStatus({
                fileSystem,
                storageRoots,
                projectPath: "/userData/projects/foo",
            }),
        ).resolves.toMatchObject({
            kind: GIT_REMOTE_PROJECT_STATUS_CONNECTED,
            lastKnownLocalHead: "local-head",
            lastKnownRemoteHead: "local-head",
            lastPublishedAt: "2026-03-30T20:00:00.000Z",
        });
    });
});
