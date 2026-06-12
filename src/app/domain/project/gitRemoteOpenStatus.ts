import type { SettingsManager } from "@/app/data/settings.ts";
import { adoptRemoteLatestAsLocalBase } from "@/app/domain/project/adoptRemoteLatestAsLocalBase.ts";
import { isGitAuthLikeError } from "@/app/domain/project/remoteSync/gitErrorTaxonomy.ts";
import {
  buildGitRemoteProjectStatus,
  buildStatusFromRemoteRelationship,
  type GitRemoteHeadMetadata,
} from "@/app/domain/project/remoteSync/gitRemoteLifecycle.ts";
import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import { GIT_REMOTE_DEFAULT_NAME } from "@/core/persistence/gitConstants.ts";
import type {
  GitProvider,
  GitRemoteInspection,
} from "@/core/persistence/GitProvider.ts";
import {
  createDefaultGitRemoteProjectStatus,
  GIT_REMOTE_PROJECT_STATUS_CONNECTED,
  GIT_REMOTE_PROJECT_STATUS_OFFLINE,
  GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED,
  type GitRemoteProjectInfo,
  type GitRemoteProjectStatus,
} from "@/core/persistence/gitRemoteModels.ts";
import {
  GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY,
  GIT_REMOTE_RELATIONSHIP_DIVERGED,
} from "@/core/persistence/gitRemoteRelationship.ts";
import {
  applyGitRemoteProjectStatus,
  readGitRemoteProjectInfo,
  readGitRemoteProjectStatus,
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
    const status = await applyStatusPatch({
      fileSystem: args.fileSystem,
      storageRoots: args.storageRoots,
      projectPath: args.projectPath,
      patch: {
        kind: GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED,
        checkedAt,
      },
    });
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
        : await applyStatusPatch({
            fileSystem: args.fileSystem,
            storageRoots: args.storageRoots,
            projectPath: args.projectPath,
            patch: {
              kind: GIT_REMOTE_PROJECT_STATUS_CONNECTED,
              checkedAt,
            },
          });
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
    const status = await applyStatusPatch({
      fileSystem: args.fileSystem,
      storageRoots: args.storageRoots,
      projectPath: args.projectPath,
      patch: { kind, checkedAt },
    });
    return {
      kind:
        kind === GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED
          ? GIT_REMOTE_OPEN_STATUS_REAUTH_REQUIRED
          : GIT_REMOTE_OPEN_STATUS_OFFLINE,
      status,
      remoteInfo,
    };
  }

  const status = await applyGitRemoteProjectStatus({
    fileSystem: args.fileSystem,
    storageRoots: args.storageRoots,
    projectPath: args.projectPath,
    update: (latestStatus) =>
      buildStatusFromInspection({
        existingStatus:
          latestStatus ?? createDefaultGitRemoteProjectStatus(args.projectPath),
        inspection,
        checkedAt,
        projectPath: args.projectPath,
        loadedProject: args.loadedProject,
        trackedBranch: remoteInfo.trackedBranch,
        gitProvider: args.gitProvider,
      }),
  });
  console.debug("[gitRemoteOpenStatus] Classified remote status on open.", {
    projectPath: args.projectPath,
    relationship: inspection.relationship.kind,
    localHead: inspection.localHead,
    remoteHead: inspection.remoteHead,
    statusKind: status.kind,
  });
  return {
    kind: status.kind,
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
  const adoptRemoteResult = await shouldAdoptRemoteLatest({
    inspection: args.inspection,
    loadedProject: args.loadedProject,
    projectPath: args.projectPath,
    trackedBranch: args.trackedBranch,
    gitProvider: args.gitProvider,
  });

  if (adoptRemoteResult.shouldAdopt) {
    return buildGitRemoteProjectStatus(args.existingStatus, {
      kind: GIT_REMOTE_PROJECT_STATUS_CONNECTED,
      checkedAt: args.checkedAt,
      localHead: args.inspection.remoteHead,
      remoteHead: args.inspection.remoteHead,
      localHeadAuthoredAt: headMetadata.remoteAuthoredAt,
      remoteHeadAuthoredAt: headMetadata.remoteAuthoredAt,
      latestIncomingAuthorName: null,
    });
  }

  return buildStatusFromRemoteRelationship({
    existingStatus: args.existingStatus,
    relationship: args.inspection.relationship,
    localHead: args.inspection.localHead,
    remoteHead: args.inspection.remoteHead,
    checkedAt: args.checkedAt,
    headMetadata,
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
      args.inspection.relationship.kind === GIT_REMOTE_RELATIONSHIP_DIVERGED) &&
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

async function readHeadCommitMetadata(args: {
  inspection: GitRemoteInspection;
  projectPath: string;
  gitProvider: Pick<GitProvider, "readCommitDetails">;
}): Promise<GitRemoteHeadMetadata> {
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
            error: error instanceof Error ? error.message : String(error),
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
    Array.from(remoteSnapshot.keys()).filter((path) => path.endsWith(".usfm")),
  );
  const allBookPaths = new Set([...localBookPaths, ...remoteBookPaths]);

  // Check remote-only paths synchronously before fanning out local reads
  for (const storageKey of allBookPaths) {
    if (
      !localBookPaths.has(storageKey) &&
      remoteSnapshot.get(storageKey) != null
    ) {
      return false;
    }
  }

  const matches = await Promise.all(
    Array.from(allBookPaths)
      .filter((storageKey) => localBookPaths.has(storageKey))
      .map(async (storageKey) => {
        const remoteText = remoteSnapshot.get(storageKey);
        const localBook = await args.loadedProject.getBook(storageKey);
        return (remoteText ?? null) === localBook.contents;
      }),
  );

  return matches.every(Boolean);
}

async function applyStatusPatch(args: {
  fileSystem: FileSystem;
  storageRoots: StorageRoots;
  projectPath: string;
  patch: Parameters<typeof buildGitRemoteProjectStatus>[1];
}): Promise<GitRemoteProjectStatus> {
  return await applyGitRemoteProjectStatus({
    fileSystem: args.fileSystem,
    storageRoots: args.storageRoots,
    projectPath: args.projectPath,
    update: (existing) =>
      buildGitRemoteProjectStatus(
        existing ?? createDefaultGitRemoteProjectStatus(args.projectPath),
        args.patch,
      ),
  });
}
