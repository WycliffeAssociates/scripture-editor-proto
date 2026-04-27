import type { SettingsManager } from "@/app/data/settings.ts";
import { adoptRemoteLatestAsLocalBase } from "@/app/domain/project/adoptRemoteLatestAsLocalBase.ts";
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
    type GitRemoteProjectInfo,
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
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

const GIT_REMOTE_OPEN_STATUS_RESULT_VALUES = [
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
          remoteInfo: GitRemoteProjectInfo;
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
          remoteInfo: GitRemoteProjectInfo;
      };

export async function hydrateGitRemoteStatusOnOpen(args: {
    projectPath: string;
    loadedProject?: Pick<Project, "books" | "getBook">;
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
            remoteInfo,
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
            remoteInfo,
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
            remoteInfo,
        };
    }

    const status = await buildStatusFromInspection({
        existingStatus,
        inspection,
        checkedAt,
        projectPath: args.projectPath,
        loadedProject: args.loadedProject,
        trackedBranch: remoteInfo.trackedBranch,
        gitProvider: args.gitProvider,
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
        remoteInfo,
    };
}

async function buildStatusFromInspection(args: {
    existingStatus: GitRemoteProjectStatus;
    inspection: GitRemoteInspection;
    checkedAt: string;
    projectPath: string;
    loadedProject?: Pick<Project, "books" | "getBook">;
    trackedBranch: string;
    gitProvider: Pick<
        GitProvider,
        | "readCommitDetails"
        | "readProjectSnapshotAtCommit"
        | "applyReplayPlanOntoRemote"
    >;
}): Promise<GitRemoteProjectStatus> {
    const headMetadata = await readHeadCommitMetadata({
        inspection: args.inspection,
        projectPath: args.projectPath,
        gitProvider: args.gitProvider,
    });
    const latestIncomingAuthorName =
        args.inspection.relationship.kind ===
            GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY ||
        args.inspection.relationship.kind === GIT_REMOTE_RELATIONSHIP_DIVERGED
            ? headMetadata.remoteAuthorName
            : null;

    const adoptRemoteResult = await shouldAdoptRemoteLatest({
        inspection: args.inspection,
        loadedProject: args.loadedProject,
        projectPath: args.projectPath,
        trackedBranch: args.trackedBranch,
        gitProvider: args.gitProvider,
    });

    if (adoptRemoteResult.shouldAdopt) {
        return buildStatus({
            existingStatus: args.existingStatus,
            kind: GIT_REMOTE_PROJECT_STATUS_CONNECTED,
            checkedAt: args.checkedAt,
            localHead: args.inspection.remoteHead,
            remoteHead: args.inspection.remoteHead,
            localHeadAuthoredAt: headMetadata.remoteAuthoredAt,
            remoteHeadAuthoredAt: headMetadata.remoteAuthoredAt,
            latestIncomingAuthorName: null,
        });
    }

    return buildStatusFromRelationship({
        existingStatus: args.existingStatus,
        inspection: args.inspection,
        checkedAt: args.checkedAt,
        headMetadata,
        latestIncomingAuthorName,
    });
}

async function shouldAdoptRemoteLatest(args: {
    inspection: GitRemoteInspection;
    loadedProject?: Pick<Project, "books" | "getBook">;
    projectPath: string;
    trackedBranch: string;
    gitProvider: Pick<
        GitProvider,
        | "readCommitDetails"
        | "readProjectSnapshotAtCommit"
        | "applyReplayPlanOntoRemote"
    >;
}): Promise<{ shouldAdopt: boolean }> {
    if (
        (args.inspection.relationship.kind ===
            GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY ||
            args.inspection.relationship.kind ===
                GIT_REMOTE_RELATIONSHIP_DIVERGED) &&
        args.inspection.remoteHead &&
        args.loadedProject
    ) {
        const contentMatchesRemote = await projectContentMatchesRemoteLatest({
            loadedProject: args.loadedProject,
            projectPath: args.projectPath,
            remoteHead: args.inspection.remoteHead,
            gitProvider: args.gitProvider,
        });
        if (contentMatchesRemote) {
            await adoptRemoteLatestAsLocalBase({
                projectPath: args.projectPath,
                trackedBranch: args.trackedBranch,
                remoteHead: args.inspection.remoteHead,
                gitProvider: args.gitProvider as GitProvider,
            });
            return { shouldAdopt: true };
        }
    }
    return { shouldAdopt: false };
}

function buildStatusFromRelationship(args: {
    existingStatus: GitRemoteProjectStatus;
    inspection: GitRemoteInspection;
    checkedAt: string;
    headMetadata: {
        localAuthoredAt: string | null;
        remoteAuthoredAt: string | null;
        remoteAuthorName: string | null;
    };
    latestIncomingAuthorName: string | null;
}): GitRemoteProjectStatus {
    switch (args.inspection.relationship.kind) {
        case GIT_REMOTE_RELATIONSHIP_UP_TO_DATE:
            return buildStatus({
                existingStatus: args.existingStatus,
                kind: GIT_REMOTE_PROJECT_STATUS_CONNECTED,
                checkedAt: args.checkedAt,
                localHead: args.inspection.localHead,
                remoteHead: args.inspection.remoteHead,
                localHeadAuthoredAt: args.headMetadata.localAuthoredAt,
                remoteHeadAuthoredAt: args.headMetadata.remoteAuthoredAt,
                latestIncomingAuthorName: null,
            });
        case GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY:
            return buildStatus({
                existingStatus: args.existingStatus,
                kind: GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE,
                checkedAt: args.checkedAt,
                localHead: args.inspection.localHead,
                remoteHead: args.inspection.remoteHead,
                localHeadAuthoredAt: args.headMetadata.localAuthoredAt,
                remoteHeadAuthoredAt: args.headMetadata.remoteAuthoredAt,
                latestIncomingAuthorName: args.latestIncomingAuthorName,
            });
        case GIT_REMOTE_RELATIONSHIP_DIVERGED:
            return buildStatus({
                existingStatus: args.existingStatus,
                kind: GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW,
                checkedAt: args.checkedAt,
                localHead: args.inspection.localHead,
                remoteHead: args.inspection.remoteHead,
                localHeadAuthoredAt: args.headMetadata.localAuthoredAt,
                remoteHeadAuthoredAt: args.headMetadata.remoteAuthoredAt,
                latestIncomingAuthorName: args.latestIncomingAuthorName,
            });
        case GIT_REMOTE_RELATIONSHIP_AHEAD_ONLY:
        case GIT_REMOTE_RELATIONSHIP_UNTRACKED:
            return buildStatus({
                existingStatus: args.existingStatus,
                kind: GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH,
                checkedAt: args.checkedAt,
                localHead: args.inspection.localHead,
                remoteHead: args.inspection.remoteHead,
                localHeadAuthoredAt: args.headMetadata.localAuthoredAt,
                remoteHeadAuthoredAt: args.headMetadata.remoteAuthoredAt,
                latestIncomingAuthorName: null,
            });
    }
}

async function readHeadCommitMetadata(args: {
    inspection: GitRemoteInspection;
    projectPath: string;
    gitProvider: Pick<GitProvider, "readCommitDetails">;
}): Promise<{
    localAuthoredAt: string | null;
    remoteAuthoredAt: string | null;
    remoteAuthorName: string | null;
}> {
    const uniqueHeads = [
        args.inspection.localHead,
        args.inspection.remoteHead,
    ].filter((head): head is string => Boolean(head));
    const metadataByHead = new Map<
        string,
        { authoredAtIso: string | null; authorName: string | null }
    >();

    await Promise.all(
        uniqueHeads.map(async (head) => {
            try {
                const commit = await args.gitProvider.readCommitDetails(
                    args.projectPath,
                    head,
                );
                metadataByHead.set(head, {
                    authoredAtIso: commit.authoredAtIso || null,
                    authorName: commit.authorName || null,
                });
            } catch (error) {
                console.debug(
                    "[gitRemoteOpenStatus] Failed to read commit metadata for head.",
                    {
                        projectPath: args.projectPath,
                        head,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                );
                metadataByHead.set(head, {
                    authoredAtIso: null,
                    authorName: null,
                });
            }
        }),
    );

    const localHeadMetadata = args.inspection.localHead
        ? metadataByHead.get(args.inspection.localHead)
        : null;
    const remoteHeadMetadata = args.inspection.remoteHead
        ? metadataByHead.get(args.inspection.remoteHead)
        : null;

    return {
        localAuthoredAt: localHeadMetadata?.authoredAtIso ?? null,
        remoteAuthoredAt: remoteHeadMetadata?.authoredAtIso ?? null,
        remoteAuthorName: remoteHeadMetadata?.authorName ?? null,
    };
}

async function projectContentMatchesRemoteLatest(args: {
    loadedProject: Pick<Project, "books" | "getBook">;
    projectPath: string;
    remoteHead: string;
    gitProvider: Pick<GitProvider, "readProjectSnapshotAtCommit">;
}): Promise<boolean> {
    const remoteSnapshot = await args.gitProvider.readProjectSnapshotAtCommit(
        args.projectPath,
        args.remoteHead,
    );
    const localBookPaths = new Set(
        args.loadedProject.books.map((b) => b.storageKey),
    );
    const remoteBookPaths = new Set(
        Array.from(remoteSnapshot.keys()).filter((path) =>
            path.endsWith(".usfm"),
        ),
    );
    const allBookPaths = new Set([...localBookPaths, ...remoteBookPaths]);

    for (const storageKey of allBookPaths) {
        const remoteText = remoteSnapshot.get(storageKey);
        const hasLocalBook = localBookPaths.has(storageKey);
        if (!hasLocalBook) {
            if (remoteText != null) {
                return false;
            }
            continue;
        }
        const localBook = await args.loadedProject.getBook(storageKey);
        if ((remoteText ?? null) !== localBook.contents) {
            return false;
        }
    }

    return true;
}

function buildStatus(args: {
    existingStatus: GitRemoteProjectStatus;
    kind: GitRemoteProjectStatus["kind"];
    checkedAt: string;
    localHead?: string | null;
    remoteHead?: string | null;
    localHeadAuthoredAt?: string | null;
    remoteHeadAuthoredAt?: string | null;
    latestIncomingAuthorName?: string | null;
}): GitRemoteProjectStatus {
    return {
        ...args.existingStatus,
        kind: args.kind,
        lastCheckedAt: args.checkedAt,
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
        latestIncomingAuthorName: args.latestIncomingAuthorName ?? null,
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
