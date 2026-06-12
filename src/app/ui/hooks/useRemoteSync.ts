import { useCallback, useEffect, useState } from "react";

import type { SettingsManager } from "@/app/data/settings.ts";
import {
  GIT_REMOTE_OPEN_STATUS_NOT_LINKED,
  type GitRemoteOpenStatusResult,
  hydrateGitRemoteStatusOnOpen,
} from "@/app/domain/project/gitRemoteOpenStatus.ts";
import {
  PUBLISH_AFTER_SAVE_PUBLISHED,
  publishLinkedProjectNow,
} from "@/app/domain/project/gitRemotePublishCoordinator.ts";
import { prepareRemoteBaseForReconciliation } from "@/app/domain/project/prepareRemoteBaseForReconciliation.ts";
import { decideRemoteSyncAction } from "@/app/domain/project/remoteSync/gitRemoteLifecycle.ts";
import type { RecoveredConflictTracker } from "@/app/state/RecoveredConflictTracker.ts";
import {
  requireGateOpen,
  type WorkspaceGateStore,
} from "@/app/state/WorkspaceInteractionGate.ts";
import type { UseSaveReturn } from "@/app/ui/hooks/useSave.tsx";
import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type {
  GitRemoteProjectInfo,
  GitRemoteProjectStatus,
} from "@/core/persistence/gitRemoteModels.ts";
import { readGitRemoteProjectStatus } from "@/core/persistence/gitRemoteStore.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

type RemoteSyncArgs = {
  loadedProject: Project;
  fileSystem: FileSystem;
  storageRoots: StorageRoots;
  settingsManager: SettingsManager;
  authSessionProvider: AuthSessionProvider;
  gitProvider: GitProvider;
  interactionGate: WorkspaceGateStore;
  recoveredConflictTracker: RecoveredConflictTracker;
  save: UseSaveReturn;
};

export type RemoteSyncHook = {
  status: GitRemoteProjectStatus | null;
  projectInfo: GitRemoteProjectInfo | null;
  isRefreshing: boolean;
  setStatus: (status: GitRemoteProjectStatus | null) => void;
  syncNow(): Promise<void>;
  reviewIncoming(): Promise<void>;
};

/**
 * Owns cloud status hydration and the explicit "sync now" command.
 *
 * `WorkspaceContext` still decides construction order, but cloud branching
 * belongs here so the provider can wire the command instead of carrying sync
 * policy inline.
 */
export function useRemoteSync(args: RemoteSyncArgs): RemoteSyncHook {
  const [remoteStatus, setRemoteStatus] =
    useState<GitRemoteProjectStatus | null>(null);
  const [remoteProjectInfo, setRemoteProjectInfo] =
    useState<GitRemoteProjectInfo | null>(null);
  const [isRefreshingRemoteStatus, setIsRefreshingRemoteStatus] =
    useState(false);

  const applyHydratedRemoteResult = useCallback(
    (result: GitRemoteOpenStatusResult) => {
      if (result.kind === GIT_REMOTE_OPEN_STATUS_NOT_LINKED) {
        setRemoteStatus(null);
        setRemoteProjectInfo(null);
        return;
      }
      setRemoteStatus(result.status);
      setRemoteProjectInfo("remoteInfo" in result ? result.remoteInfo : null);
    },
    [],
  );

  const syncRemoteStatus = useCallback(
    async (forceSync = false) => {
      setIsRefreshingRemoteStatus(true);
      try {
        const result = await hydrateGitRemoteStatusOnOpen({
          projectPath: args.loadedProject.projectPath,
          loadedProject: args.loadedProject,
          fileSystem: args.fileSystem,
          storageRoots: args.storageRoots,
          settingsManager: args.settingsManager,
          authSessionProvider: args.authSessionProvider,
          gitProvider: args.gitProvider,
          forceSync,
        });
        applyHydratedRemoteResult(result);
        return result;
      } finally {
        setIsRefreshingRemoteStatus(false);
      }
    },
    [
      applyHydratedRemoteResult,
      args.authSessionProvider,
      args.fileSystem,
      args.gitProvider,
      args.loadedProject,
      args.settingsManager,
      args.storageRoots,
    ],
  );

  useEffect(() => {
    void syncRemoteStatus().catch((error) => {
      console.error("Failed to hydrate remote project status on open", error);
    });
  }, [syncRemoteStatus]);

  const syncNow = useCallback(async () => {
    const decision = decideRemoteSyncAction({
      status: remoteStatus,
      gateOpen: requireGateOpen(args.interactionGate.get()),
      hasRecoveredConflicts: !args.recoveredConflictTracker.isEmpty(),
      autoAcceptIncomingWork: args.settingsManager.get(
        "autoAcceptIncomingWork",
      ),
    });

    switch (decision.kind) {
      case "publish": {
        setIsRefreshingRemoteStatus(true);
        try {
          const publishResult = await publishLinkedProjectNow({
            projectPath: args.loadedProject.projectPath,
            fileSystem: args.fileSystem,
            storageRoots: args.storageRoots,
            authSessionProvider: args.authSessionProvider,
            gitProvider: args.gitProvider,
          });
          if (publishResult.kind !== PUBLISH_AFTER_SAVE_PUBLISHED) {
            await syncRemoteStatus(true);
            return;
          }
          const persistedStatus = await readGitRemoteProjectStatus({
            fileSystem: args.fileSystem,
            storageRoots: args.storageRoots,
            projectPath: args.loadedProject.projectPath,
          });
          setRemoteStatus(persistedStatus);
          return;
        } finally {
          setIsRefreshingRemoteStatus(false);
        }
      }
      case "refresh-only": {
        if (decision.reason !== "clean") {
          console.info(
            "[syncNow] incoming reconciliation deferred — workspace gated or recovered conflicts pending review",
            { reason: decision.reason },
          );
        }
        await syncRemoteStatus(true);
        return;
      }
      case "auto-accept-incoming": {
        const reviewResult = decision.suppressReviewModal
          ? await args.save.compare.openRemoteLatestReview({
              openModalOnRequiresReview: false,
            })
          : await args.save.compare.openRemoteLatestReview();
        const reconciliation = reviewResult?.requiresReconciliationSave;
        if (reconciliation) {
          await args.save.save.saveProjectToDisk({
            prepareRemoteBaseForSave: async () => {
              await prepareRemoteBaseForReconciliation({
                projectPath: args.loadedProject.projectPath,
                trackedBranch: reconciliation.trackedBranch,
                remoteHead: reconciliation.remoteHead,
                relationship: reconciliation.relationship,
                gitProvider: args.gitProvider,
              });
            },
          });
        }
        await syncRemoteStatus(true);
        return;
      }
    }
  }, [
    args.authSessionProvider,
    args.fileSystem,
    args.gitProvider,
    args.interactionGate,
    args.loadedProject.projectPath,
    args.recoveredConflictTracker,
    args.save.compare,
    args.save.save,
    args.settingsManager,
    args.storageRoots,
    remoteStatus,
    syncRemoteStatus,
  ]);

  const reviewIncoming = useCallback(async () => {
    await args.save.compare.openRemoteLatestReview();
  }, [args.save.compare]);

  return {
    status: remoteStatus,
    projectInfo: remoteProjectInfo,
    isRefreshing: isRefreshingRemoteStatus,
    setStatus: setRemoteStatus,
    syncNow,
    reviewIncoming,
  };
}
