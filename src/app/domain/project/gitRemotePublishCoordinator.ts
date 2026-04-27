import type { SettingsManager } from "@/app/data/settings.ts";
import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import {
    GIT_REMOTE_PUBLISH_AUTH_FAILED,
    GIT_REMOTE_PUBLISH_OFFLINE,
    GIT_REMOTE_PUBLISH_PUBLISHED,
    GIT_REMOTE_PUBLISH_REMOTE_ADVANCED,
    type GitProvider,
} from "@/core/persistence/GitProvider.ts";
import { GIT_REMOTE_DEFAULT_NAME } from "@/core/persistence/gitConstants.ts";
import {
    createDefaultGitRemoteProjectStatus,
    GIT_REMOTE_PROJECT_STATUS_CONNECTED,
    GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW,
    GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH,
    GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED,
    type GitRemoteProjectStatus,
} from "@/core/persistence/gitRemoteModels.ts";
import {
    readGitRemoteProjectInfo,
    readGitRemoteProjectStatus,
    writeGitRemoteProjectStatus,
} from "@/core/persistence/gitRemoteStore.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

export type PublishAfterSaveResult =
    | { kind: typeof PUBLISH_AFTER_SAVE_NOT_LINKED }
    | {
          kind: typeof PUBLISH_AFTER_SAVE_PENDING_PUBLISH;
          reason: PublishAfterSavePendingReason;
      }
    | { kind: typeof PUBLISH_AFTER_SAVE_NEEDS_REVIEW }
    | { kind: typeof PUBLISH_AFTER_SAVE_REAUTH_REQUIRED }
    | { kind: typeof PUBLISH_AFTER_SAVE_PUBLISHED };

const PUBLISH_AFTER_SAVE_RESULT_VALUES = [
    "notLinked",
    "pendingPublish",
    "needsReview",
    "reauthRequired",
    "published",
] as const;

export const [
    PUBLISH_AFTER_SAVE_NOT_LINKED,
    PUBLISH_AFTER_SAVE_PENDING_PUBLISH,
    PUBLISH_AFTER_SAVE_NEEDS_REVIEW,
    PUBLISH_AFTER_SAVE_REAUTH_REQUIRED,
    PUBLISH_AFTER_SAVE_PUBLISHED,
] = PUBLISH_AFTER_SAVE_RESULT_VALUES;

export const PUBLISH_AFTER_SAVE_PENDING_REASON_VALUES = [
    "autoPushDisabled",
    "offline",
] as const;

export type PublishAfterSavePendingReason =
    (typeof PUBLISH_AFTER_SAVE_PENDING_REASON_VALUES)[number];

export const [
    PUBLISH_AFTER_SAVE_PENDING_AUTO_PUSH_DISABLED,
    PUBLISH_AFTER_SAVE_PENDING_OFFLINE,
] = PUBLISH_AFTER_SAVE_PENDING_REASON_VALUES;

export type PublishLinkedProjectNowResult = PublishAfterSaveResult;

export async function publishLinkedProjectAfterSave(args: {
    projectPath: string;
    localHead: string | null;
    fileSystem: FileSystem;
    storageRoots: StorageRoots;
    settingsManager: SettingsManager;
    authSessionProvider: AuthSessionProvider;
    gitProvider: GitProvider;
    now?: () => string;
}): Promise<PublishAfterSaveResult> {
    const remoteInfo = await readGitRemoteProjectInfo({
        fileSystem: args.fileSystem,
        storageRoots: args.storageRoots,
        projectPath: args.projectPath,
    });
    if (!remoteInfo) return { kind: PUBLISH_AFTER_SAVE_NOT_LINKED };

    const existingStatus =
        (await readGitRemoteProjectStatus({
            fileSystem: args.fileSystem,
            storageRoots: args.storageRoots,
            projectPath: args.projectPath,
        })) ?? createDefaultGitRemoteProjectStatus(args.projectPath);
    const now = args.now?.() ?? new Date().toISOString();

    if (!args.settingsManager.get("autoPushOnSave")) {
        console.debug(
            "[gitRemotePublishCoordinator] Local save left project pending publish because auto-push-on-save is disabled.",
            {
                projectPath: args.projectPath,
                localHead: args.localHead,
            },
        );
        await writeStatus({
            fileSystem: args.fileSystem,
            storageRoots: args.storageRoots,
            status: buildNextStatus({
                existingStatus,
                kind: GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH,
                localHead: args.localHead,
                checkedAt: now,
            }),
        });
        return {
            kind: PUBLISH_AFTER_SAVE_PENDING_PUBLISH,
            reason: PUBLISH_AFTER_SAVE_PENDING_AUTO_PUSH_DISABLED,
        };
    }

    const session = await args.authSessionProvider.getCurrentSession();
    if (!session || session.hostBaseUrl !== remoteInfo.hostBaseUrl) {
        console.debug(
            "[gitRemotePublishCoordinator] Local save requires cloud reauth before publish.",
            {
                projectPath: args.projectPath,
                linkedHost: remoteInfo.hostBaseUrl,
                sessionHost: session?.hostBaseUrl ?? null,
                localHead: args.localHead,
            },
        );
        await writeStatus({
            fileSystem: args.fileSystem,
            storageRoots: args.storageRoots,
            status: buildNextStatus({
                existingStatus,
                kind: GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED,
                localHead: args.localHead,
                checkedAt: now,
            }),
        });
        return { kind: PUBLISH_AFTER_SAVE_REAUTH_REQUIRED };
    }

    return publishWithCurrentSession({
        fileSystem: args.fileSystem,
        storageRoots: args.storageRoots,
        gitProvider: args.gitProvider,
        projectPath: args.projectPath,
        remoteInfo,
        existingStatus,
        session,
        localHead: args.localHead,
        now,
    });
}

export async function publishLinkedProjectNow(args: {
    projectPath: string;
    fileSystem: FileSystem;
    storageRoots: StorageRoots;
    authSessionProvider: AuthSessionProvider;
    gitProvider: GitProvider;
    now?: () => string;
}): Promise<PublishLinkedProjectNowResult> {
    const remoteInfo = await readGitRemoteProjectInfo({
        fileSystem: args.fileSystem,
        storageRoots: args.storageRoots,
        projectPath: args.projectPath,
    });
    if (!remoteInfo) return { kind: PUBLISH_AFTER_SAVE_NOT_LINKED };

    const existingStatus =
        (await readGitRemoteProjectStatus({
            fileSystem: args.fileSystem,
            storageRoots: args.storageRoots,
            projectPath: args.projectPath,
        })) ?? createDefaultGitRemoteProjectStatus(args.projectPath);
    const now = args.now?.() ?? new Date().toISOString();
    const session = await args.authSessionProvider.getCurrentSession();

    if (!session || session.hostBaseUrl !== remoteInfo.hostBaseUrl) {
        console.debug(
            "[gitRemotePublishCoordinator] Explicit sync requires cloud reauth before publish.",
            {
                projectPath: args.projectPath,
                linkedHost: remoteInfo.hostBaseUrl,
                sessionHost: session?.hostBaseUrl ?? null,
                localHead: existingStatus.lastKnownLocalHead,
            },
        );
        await writeStatus({
            fileSystem: args.fileSystem,
            storageRoots: args.storageRoots,
            status: buildNextStatus({
                existingStatus,
                kind: GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED,
                localHead: existingStatus.lastKnownLocalHead ?? null,
                checkedAt: now,
            }),
        });
        return { kind: PUBLISH_AFTER_SAVE_REAUTH_REQUIRED };
    }

    return publishWithCurrentSession({
        fileSystem: args.fileSystem,
        storageRoots: args.storageRoots,
        gitProvider: args.gitProvider,
        projectPath: args.projectPath,
        remoteInfo,
        existingStatus,
        session,
        localHead: existingStatus.lastKnownLocalHead ?? null,
        now,
    });
}

async function publishWithCurrentSession(args: {
    fileSystem: FileSystem;
    storageRoots: StorageRoots;
    gitProvider: GitProvider;
    projectPath: string;
    remoteInfo: NonNullable<
        Awaited<ReturnType<typeof readGitRemoteProjectInfo>>
    >;
    existingStatus: GitRemoteProjectStatus;
    session: NonNullable<
        Awaited<ReturnType<AuthSessionProvider["getCurrentSession"]>>
    >;
    localHead: string | null;
    now: string;
}): Promise<
    | {
          kind: typeof PUBLISH_AFTER_SAVE_PENDING_PUBLISH;
          reason: PublishAfterSavePendingReason;
      }
    | { kind: typeof PUBLISH_AFTER_SAVE_NEEDS_REVIEW }
    | { kind: typeof PUBLISH_AFTER_SAVE_REAUTH_REQUIRED }
    | { kind: typeof PUBLISH_AFTER_SAVE_PUBLISHED }
> {
    const publishResult = await args.gitProvider.pushCurrentBranch({
        projectPath: args.projectPath,
        remoteName: GIT_REMOTE_DEFAULT_NAME,
        branch: args.remoteInfo.trackedBranch,
        auth: {
            username: args.session.username,
            token: args.session.token,
        },
    });
    const localHead = publishResult.localHead ?? args.localHead;
    const remoteHead = publishResult.remoteHead ?? localHead;
    const localHeadAuthoredAt = await readHeadAuthoredAt({
        gitProvider: args.gitProvider,
        projectPath: args.projectPath,
        head: localHead,
    });
    const remoteHeadAuthoredAt = await readHeadAuthoredAt({
        gitProvider: args.gitProvider,
        projectPath: args.projectPath,
        head: remoteHead,
    });

    switch (publishResult.outcome) {
        case GIT_REMOTE_PUBLISH_PUBLISHED:
            console.debug(
                "[gitRemotePublishCoordinator] Published local save to remote.",
                {
                    projectPath: args.projectPath,
                    localHead: publishResult.localHead ?? args.localHead,
                    remoteHead:
                        publishResult.remoteHead ??
                        publishResult.localHead ??
                        args.localHead,
                },
            );
            await writeStatus({
                fileSystem: args.fileSystem,
                storageRoots: args.storageRoots,
                status: buildNextStatus({
                    existingStatus: args.existingStatus,
                    kind: GIT_REMOTE_PROJECT_STATUS_CONNECTED,
                    localHead,
                    remoteHead,
                    localHeadAuthoredAt,
                    remoteHeadAuthoredAt,
                    checkedAt: args.now,
                    publishedAt: args.now,
                }),
            });
            return { kind: PUBLISH_AFTER_SAVE_PUBLISHED };
        case GIT_REMOTE_PUBLISH_OFFLINE:
            console.debug(
                "[gitRemotePublishCoordinator] Publish deferred because remote is offline or unreachable.",
                {
                    projectPath: args.projectPath,
                    localHead: publishResult.localHead ?? args.localHead,
                    remoteHead: publishResult.remoteHead,
                },
            );
            await writeStatus({
                fileSystem: args.fileSystem,
                storageRoots: args.storageRoots,
                status: buildNextStatus({
                    existingStatus: args.existingStatus,
                    kind: GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH,
                    localHead,
                    remoteHead: publishResult.remoteHead,
                    localHeadAuthoredAt,
                    remoteHeadAuthoredAt:
                        publishResult.remoteHead === null
                            ? null
                            : remoteHeadAuthoredAt,
                    checkedAt: args.now,
                }),
            });
            return {
                kind: PUBLISH_AFTER_SAVE_PENDING_PUBLISH,
                reason: PUBLISH_AFTER_SAVE_PENDING_OFFLINE,
            };
        case GIT_REMOTE_PUBLISH_REMOTE_ADVANCED:
            console.debug(
                "[gitRemotePublishCoordinator] Publish requires review because remote advanced.",
                {
                    projectPath: args.projectPath,
                    localHead: publishResult.localHead ?? args.localHead,
                    remoteHead: publishResult.remoteHead,
                },
            );
            await writeStatus({
                fileSystem: args.fileSystem,
                storageRoots: args.storageRoots,
                status: buildNextStatus({
                    existingStatus: args.existingStatus,
                    kind: GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW,
                    localHead,
                    remoteHead: publishResult.remoteHead,
                    localHeadAuthoredAt,
                    remoteHeadAuthoredAt:
                        publishResult.remoteHead === null
                            ? null
                            : remoteHeadAuthoredAt,
                    checkedAt: args.now,
                }),
            });
            return { kind: PUBLISH_AFTER_SAVE_NEEDS_REVIEW };
        case GIT_REMOTE_PUBLISH_AUTH_FAILED:
            console.debug(
                "[gitRemotePublishCoordinator] Publish failed because the cloud session is no longer valid.",
                {
                    projectPath: args.projectPath,
                    localHead: publishResult.localHead ?? args.localHead,
                    remoteHead: publishResult.remoteHead,
                },
            );
            await writeStatus({
                fileSystem: args.fileSystem,
                storageRoots: args.storageRoots,
                status: buildNextStatus({
                    existingStatus: args.existingStatus,
                    kind: GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED,
                    localHead,
                    remoteHead: publishResult.remoteHead,
                    localHeadAuthoredAt,
                    remoteHeadAuthoredAt:
                        publishResult.remoteHead === null
                            ? null
                            : remoteHeadAuthoredAt,
                    checkedAt: args.now,
                }),
            });
            return { kind: PUBLISH_AFTER_SAVE_REAUTH_REQUIRED };
    }
}

async function writeStatus(args: {
    fileSystem: FileSystem;
    storageRoots: StorageRoots;
    status: GitRemoteProjectStatus;
}) {
    await writeGitRemoteProjectStatus(args);
}

function buildNextStatus(args: {
    existingStatus: GitRemoteProjectStatus;
    kind: GitRemoteProjectStatus["kind"];
    localHead: string | null;
    remoteHead?: string | null;
    localHeadAuthoredAt?: string | null;
    remoteHeadAuthoredAt?: string | null;
    checkedAt: string;
    publishedAt?: string;
}): GitRemoteProjectStatus {
    return {
        ...args.existingStatus,
        kind: args.kind,
        lastCheckedAt: args.checkedAt,
        lastPublishedAt:
            args.publishedAt ?? args.existingStatus.lastPublishedAt,
        lastKnownLocalHead:
            args.localHead ?? args.existingStatus.lastKnownLocalHead,
        lastKnownRemoteHead:
            args.remoteHead ?? args.existingStatus.lastKnownRemoteHead,
        lastKnownLocalHeadAuthoredAt:
            args.localHeadAuthoredAt ??
            args.existingStatus.lastKnownLocalHeadAuthoredAt,
        lastKnownRemoteHeadAuthoredAt:
            args.remoteHeadAuthoredAt ??
            args.existingStatus.lastKnownRemoteHeadAuthoredAt,
    };
}

async function readHeadAuthoredAt(args: {
    gitProvider: GitProvider;
    projectPath: string;
    head: string | null;
}): Promise<string | null> {
    if (!args.head) return null;
    try {
        const commit = await args.gitProvider.readCommitDetails(
            args.projectPath,
            args.head,
        );
        return commit.authoredAtIso || null;
    } catch (error) {
        console.debug(
            "[gitRemotePublishCoordinator] Failed to read commit timestamp for head.",
            {
                projectPath: args.projectPath,
                head: args.head,
                error: error instanceof Error ? error.message : String(error),
            },
        );
        return null;
    }
}
