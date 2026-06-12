import type { CompareMetadataSummary } from "@/app/domain/project/compare/compareService.ts";
import { snapshotToScriptureBookStates } from "@/app/domain/project/versionSnapshotAdapter.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import { GIT_REMOTE_DEFAULT_NAME } from "@/core/persistence/gitConstants.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type { GitRemoteProjectInfo } from "@/core/persistence/gitRemoteModels.ts";
import type { GitRemoteRelationshipKind } from "@/core/persistence/gitRemoteRelationship.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";

/**
 * Convert a fetched remote git state into the scripture compare-source shape.
 *
 * The remote transport layer knows about refs, auth, and heads. The compare
 * layer only wants parsed scripture files plus lightweight metadata. This
 * bridge keeps that translation reusable and testable.
 */
export async function buildRemoteLatestCompareSource(args: {
  loadedProject: Project;
  remoteInfo: GitRemoteProjectInfo;
  auth: { username: string; token: string };
  gitProvider: Pick<
    GitProvider,
    "fetchRemoteHeads" | "readProjectSnapshotAtCommit"
  >;
  usfmOnionService: IUsfmOnionService;
}): Promise<{
  parsedFiles: Awaited<ReturnType<typeof snapshotToScriptureBookStates>>;
  metadataSummary: CompareMetadataSummary;
  remoteSync: {
    remoteHead: string;
    localHead: string | null;
    mergeBase: string | null;
    trackedBranch: string;
    relationship: GitRemoteRelationshipKind;
  };
}> {
  const inspection = await args.gitProvider.fetchRemoteHeads({
    projectPath: args.loadedProject.projectPath,
    remoteName: GIT_REMOTE_DEFAULT_NAME,
    branch: args.remoteInfo.trackedBranch,
    auth: args.auth,
  });
  if (!inspection.remoteHead) {
    throw new Error("Linked project does not have a fetched remote head");
  }

  const snapshot = await args.gitProvider.readProjectSnapshotAtCommit(
    args.loadedProject.projectPath,
    inspection.remoteHead,
  );
  const parsedFiles = await snapshotToScriptureBookStates({
    loadedProject: args.loadedProject,
    snapshot,
    usfmOnionService: args.usfmOnionService,
  });

  return {
    parsedFiles,
    metadataSummary: {
      projectId: args.loadedProject.projectId ?? args.loadedProject.folderName,
      languageId: args.loadedProject.language.code,
      languageDirection: args.loadedProject.language.direction,
    },
    remoteSync: {
      remoteHead: inspection.remoteHead,
      localHead: inspection.localHead,
      mergeBase: inspection.mergeBase,
      trackedBranch: args.remoteInfo.trackedBranch,
      relationship: inspection.relationship.kind,
    },
  };
}
