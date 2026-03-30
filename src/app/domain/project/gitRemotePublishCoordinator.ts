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

export const PUBLISH_AFTER_SAVE_RESULT_VALUES = [
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

    const publishResult = await args.gitProvider.pushCurrentBranch({
        projectPath: args.projectPath,
        remoteName: GIT_REMOTE_DEFAULT_NAME,
        branch: remoteInfo.trackedBranch,
        auth: {
            username: session.username,
            token: session.token,
        },
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
                    existingStatus,
                    kind: GIT_REMOTE_PROJECT_STATUS_CONNECTED,
                    localHead: publishResult.localHead ?? args.localHead,
                    remoteHead:
                        publishResult.remoteHead ??
                        publishResult.localHead ??
                        args.localHead,
                    checkedAt: now,
                    publishedAt: now,
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
                    existingStatus,
                    kind: GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH,
                    localHead: publishResult.localHead ?? args.localHead,
                    remoteHead: publishResult.remoteHead,
                    checkedAt: now,
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
                    existingStatus,
                    kind: GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW,
                    localHead: publishResult.localHead ?? args.localHead,
                    remoteHead: publishResult.remoteHead,
                    checkedAt: now,
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
                    existingStatus,
                    kind: GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED,
                    localHead: publishResult.localHead ?? args.localHead,
                    remoteHead: publishResult.remoteHead,
                    checkedAt: now,
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
    };
}
