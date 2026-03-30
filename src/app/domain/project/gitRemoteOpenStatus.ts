import type { SettingsManager } from "@/app/data/settings.ts";
import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type {
    GitProvider,
    GitRemoteInspection,
} from "@/core/persistence/GitProvider.ts";
import { GIT_REMOTE_DEFAULT_NAME } from "@/core/persistence/gitConstants.ts";
import {
    createDefaultGitRemoteProjectStatus,
    GIT_REMOTE_PROJECT_STATUS_CONNECTED,
    GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW,
    GIT_REMOTE_PROJECT_STATUS_OFFLINE,
    GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH,
    GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED,
    GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE,
    GIT_REMOTE_PROJECT_STATUS_SYNCING,
    type GitRemoteProjectStatus,
} from "@/core/persistence/gitRemoteModels.ts";
import {
    GIT_REMOTE_RELATIONSHIP_AHEAD_ONLY,
    GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY,
    GIT_REMOTE_RELATIONSHIP_DIVERGED,
    GIT_REMOTE_RELATIONSHIP_UNTRACKED,
    GIT_REMOTE_RELATIONSHIP_UP_TO_DATE,
} from "@/core/persistence/gitRemoteRelationship.ts";
import {
    readGitRemoteProjectInfo,
    readGitRemoteProjectStatus,
    writeGitRemoteProjectStatus,
} from "@/core/persistence/gitRemoteStore.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

export const GIT_REMOTE_OPEN_STATUS_RESULT_VALUES = [
    "notLinked",
    "skippedAutoSync",
    "connected",
    "pendingPublish",
    "remoteUpdatesAvailable",
    "needsReview",
    "offline",
    "reauthRequired",
] as const;

export const [
    GIT_REMOTE_OPEN_STATUS_NOT_LINKED,
    GIT_REMOTE_OPEN_STATUS_SKIPPED_AUTO_SYNC,
    GIT_REMOTE_OPEN_STATUS_CONNECTED,
    GIT_REMOTE_OPEN_STATUS_PENDING_PUBLISH,
    GIT_REMOTE_OPEN_STATUS_REMOTE_UPDATES_AVAILABLE,
    GIT_REMOTE_OPEN_STATUS_NEEDS_REVIEW,
    GIT_REMOTE_OPEN_STATUS_OFFLINE,
    GIT_REMOTE_OPEN_STATUS_REAUTH_REQUIRED,
] = GIT_REMOTE_OPEN_STATUS_RESULT_VALUES;

export type GitRemoteOpenStatusResult =
    | { kind: typeof GIT_REMOTE_OPEN_STATUS_NOT_LINKED }
    | {
          kind: typeof GIT_REMOTE_OPEN_STATUS_SKIPPED_AUTO_SYNC;
          status: GitRemoteProjectStatus;
      }
    | {
          kind:
              | typeof GIT_REMOTE_OPEN_STATUS_CONNECTED
              | typeof GIT_REMOTE_OPEN_STATUS_PENDING_PUBLISH
              | typeof GIT_REMOTE_OPEN_STATUS_REMOTE_UPDATES_AVAILABLE
              | typeof GIT_REMOTE_OPEN_STATUS_NEEDS_REVIEW
              | typeof GIT_REMOTE_OPEN_STATUS_OFFLINE
              | typeof GIT_REMOTE_OPEN_STATUS_REAUTH_REQUIRED;
          status: GitRemoteProjectStatus;
      };

export async function hydrateGitRemoteStatusOnOpen(args: {
    projectPath: string;
    fileSystem: FileSystem;
    storageRoots: StorageRoots;
    settingsManager: SettingsManager;
    authSessionProvider: AuthSessionProvider;
    gitProvider: GitProvider;
    forceSync?: boolean;
    now?: () => string;
}): Promise<GitRemoteOpenStatusResult> {
    const remoteInfo = await readGitRemoteProjectInfo({
        fileSystem: args.fileSystem,
        storageRoots: args.storageRoots,
        projectPath: args.projectPath,
    });
    if (!remoteInfo) {
        return { kind: GIT_REMOTE_OPEN_STATUS_NOT_LINKED };
    }

    const existingStatus =
        (await readGitRemoteProjectStatus({
            fileSystem: args.fileSystem,
            storageRoots: args.storageRoots,
            projectPath: args.projectPath,
        })) ?? createDefaultGitRemoteProjectStatus(args.projectPath);
    const checkedAt = args.now?.() ?? new Date().toISOString();
    const session = await args.authSessionProvider.getCurrentSession();

    if (!session || session.hostBaseUrl !== remoteInfo.hostBaseUrl) {
        console.debug("[gitRemoteOpenStatus] Remote status requires reauth.", {
            projectPath: args.projectPath,
            linkedHost: remoteInfo.hostBaseUrl,
            sessionHost: session?.hostBaseUrl ?? null,
        });
        const status = buildStatus({
            existingStatus,
            kind: GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED,
            checkedAt,
        });
        await persistStatus(args.fileSystem, args.storageRoots, status);
        return {
            kind: GIT_REMOTE_OPEN_STATUS_REAUTH_REQUIRED,
            status,
        };
    }

    if (!args.forceSync && !args.settingsManager.get("autoSyncOnOpen")) {
        console.debug(
            "[gitRemoteOpenStatus] Skipping remote inspection because auto-sync-on-open is disabled.",
            {
                projectPath: args.projectPath,
                statusKind: existingStatus.kind,
            },
        );
        const status =
            existingStatus.lastCheckedAt ||
            existingStatus.kind !== GIT_REMOTE_PROJECT_STATUS_CONNECTED
                ? existingStatus
                : buildStatus({
                      existingStatus,
                      kind: GIT_REMOTE_PROJECT_STATUS_CONNECTED,
                      checkedAt,
                  });
        await persistStatus(args.fileSystem, args.storageRoots, status);
        return {
            kind: GIT_REMOTE_OPEN_STATUS_SKIPPED_AUTO_SYNC,
            status,
        };
    }

    let inspection: GitRemoteInspection;
    try {
        inspection = await args.gitProvider.fetchRemoteHeads({
            projectPath: args.projectPath,
            remoteName: GIT_REMOTE_DEFAULT_NAME,
            branch: remoteInfo.trackedBranch,
            auth: {
                username: session.username,
                token: session.token,
            },
        });
    } catch (error) {
        const kind = isGitAuthLikeError(error)
            ? GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED
            : GIT_REMOTE_PROJECT_STATUS_OFFLINE;
        console.debug(
            "[gitRemoteOpenStatus] Remote inspection failed during open hydration.",
            {
                projectPath: args.projectPath,
                statusKind: kind,
                error: error instanceof Error ? error.message : String(error),
            },
        );
        const status = buildStatus({
            existingStatus,
            kind,
            checkedAt,
        });
        await persistStatus(args.fileSystem, args.storageRoots, status);
        return {
            kind:
                kind === GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED
                    ? GIT_REMOTE_OPEN_STATUS_REAUTH_REQUIRED
                    : GIT_REMOTE_OPEN_STATUS_OFFLINE,
            status,
        };
    }

    const status = buildStatusFromInspection({
        existingStatus,
        inspection,
        checkedAt,
    });
    console.debug("[gitRemoteOpenStatus] Classified remote status on open.", {
        projectPath: args.projectPath,
        relationship: inspection.relationship.kind,
        localHead: inspection.localHead,
        remoteHead: inspection.remoteHead,
        statusKind: status.kind,
    });
    await persistStatus(args.fileSystem, args.storageRoots, status);
    return {
        kind: mapProjectStatusToOpenResult(status.kind),
        status,
    };
}

function buildStatusFromInspection(args: {
    existingStatus: GitRemoteProjectStatus;
    inspection: GitRemoteInspection;
    checkedAt: string;
}): GitRemoteProjectStatus {
    switch (args.inspection.relationship.kind) {
        case GIT_REMOTE_RELATIONSHIP_UP_TO_DATE:
            return buildStatus({
                existingStatus: args.existingStatus,
                kind: GIT_REMOTE_PROJECT_STATUS_CONNECTED,
                checkedAt: args.checkedAt,
                localHead: args.inspection.localHead,
                remoteHead: args.inspection.remoteHead,
            });
        case GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY:
            return buildStatus({
                existingStatus: args.existingStatus,
                kind: GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE,
                checkedAt: args.checkedAt,
                localHead: args.inspection.localHead,
                remoteHead: args.inspection.remoteHead,
            });
        case GIT_REMOTE_RELATIONSHIP_DIVERGED:
            return buildStatus({
                existingStatus: args.existingStatus,
                kind: GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW,
                checkedAt: args.checkedAt,
                localHead: args.inspection.localHead,
                remoteHead: args.inspection.remoteHead,
            });
        case GIT_REMOTE_RELATIONSHIP_AHEAD_ONLY:
        case GIT_REMOTE_RELATIONSHIP_UNTRACKED:
            return buildStatus({
                existingStatus: args.existingStatus,
                kind: GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH,
                checkedAt: args.checkedAt,
                localHead: args.inspection.localHead,
                remoteHead: args.inspection.remoteHead,
            });
    }
}

function buildStatus(args: {
    existingStatus: GitRemoteProjectStatus;
    kind: GitRemoteProjectStatus["kind"];
    checkedAt: string;
    localHead?: string | null;
    remoteHead?: string | null;
}): GitRemoteProjectStatus {
    return {
        ...args.existingStatus,
        kind: args.kind,
        lastCheckedAt: args.checkedAt,
        lastKnownLocalHead:
            args.localHead ?? args.existingStatus.lastKnownLocalHead,
        lastKnownRemoteHead:
            args.remoteHead ?? args.existingStatus.lastKnownRemoteHead,
    };
}

function mapProjectStatusToOpenResult(
    kind: GitRemoteProjectStatus["kind"],
): GitRemoteOpenStatusResult["kind"] {
    switch (kind) {
        case GIT_REMOTE_PROJECT_STATUS_CONNECTED:
            return GIT_REMOTE_OPEN_STATUS_CONNECTED;
        case GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH:
            return GIT_REMOTE_OPEN_STATUS_PENDING_PUBLISH;
        case GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE:
            return GIT_REMOTE_OPEN_STATUS_REMOTE_UPDATES_AVAILABLE;
        case GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW:
            return GIT_REMOTE_OPEN_STATUS_NEEDS_REVIEW;
        case GIT_REMOTE_PROJECT_STATUS_OFFLINE:
            return GIT_REMOTE_OPEN_STATUS_OFFLINE;
        case GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED:
            return GIT_REMOTE_OPEN_STATUS_REAUTH_REQUIRED;
        case GIT_REMOTE_PROJECT_STATUS_SYNCING:
            return GIT_REMOTE_OPEN_STATUS_CONNECTED;
    }
}

async function persistStatus(
    fileSystem: FileSystem,
    storageRoots: StorageRoots,
    status: GitRemoteProjectStatus,
) {
    await writeGitRemoteProjectStatus({
        fileSystem,
        storageRoots,
        status,
    });
}

function isGitAuthLikeError(error: unknown): boolean {
    const message =
        error instanceof Error ? error.message : String(error ?? "");
    return /401|403|authentication|authorization|access denied|forbidden/i.test(
        message,
    );
}
