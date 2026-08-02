import { useRouter } from "@tanstack/react-router";
import type { LexicalEditor } from "lexical";
import { useEffect, useMemo, useState } from "react";

import type { EditorModeSetting } from "@/app/data/editor.ts";
import { publishResidentBraid } from "@/app/domain/mirror/braidHost.ts";
import { writeBraidWarmCache } from "@/app/domain/mirror/braidWarmCache.ts";
import type { MirrorFeed } from "@/app/domain/mirror/MirrorFeed.ts";
import { acceptRemoteLatestReview } from "@/app/domain/project/acceptRemoteLatestReview.ts";
import { applyCompareProjectionToStore } from "@/app/domain/project/compare/applyProjection.ts";
import { CompareSourceLoader } from "@/app/domain/project/compare/compareSourceLoader.ts";
import {
  buildApplySaveOptions,
  replaceCompareSource,
  requiresIncomingFlowGuard,
} from "@/app/domain/project/compare/reviewOrchestration.ts";
import { buildCompareSourcePair } from "@/app/domain/project/compare/sourceDescriptors.ts";
import {
  createCompareSourceDescriptor,
  createSavedCompareSourceDescriptor,
  createWorkingCompareSourceDescriptor,
} from "@/app/domain/project/compare/sourceMaterials.ts";
import {
  COMPARE_SOURCE_KIND,
  type CompareSide,
  type CompareSourceDescriptor,
} from "@/app/domain/project/compare/types.ts";
import { prepareRemoteBaseForReconciliation } from "@/app/domain/project/prepareRemoteBaseForReconciliation.ts";
import {
  buildPrintChangeSet,
  type PrintChangeSet,
  type PrintGranularity,
  type PrintScope,
} from "@/app/domain/project/print/buildPrintChangeSet.ts";
import {
  hasCompareChanges,
  listChangedChapterRefs,
} from "@/app/domain/project/remoteSync/incomingReconciliationPlan.ts";
import { runIncomingReconciliation } from "@/app/domain/project/remoteSync/runIncomingReconciliation.ts";
import type { SuccessfulDiskSaveReceipt } from "@/app/domain/project/savePipeline.ts";
import { snapshotToScriptureBookStates } from "@/app/domain/project/versionSnapshotAdapter.ts";
import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { RecoveredConflictTracker } from "@/app/state/RecoveredConflictTracker.ts";
import type { SaveStatusStore } from "@/app/state/SaveStatusStore.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";
import {
  requireGateOpen,
  type WorkspaceGateStore,
} from "@/app/state/WorkspaceInteractionGate.ts";
import { useCompareSession } from "@/app/ui/hooks/save/useCompareSession.ts";
import { useSaveAndRevert } from "@/app/ui/hooks/save/useSaveAndRevert.ts";
import { useVersionHistory } from "@/app/ui/hooks/save/useVersionHistory.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type {
  GitProvider,
  VersionEntry,
} from "@/core/persistence/GitProvider.ts";
import type { GitRemoteProjectStatus } from "@/core/persistence/gitRemoteModels.ts";
import type {
  Project,
  ProjectListItem,
} from "@/core/persistence/ScriptureWorkspace.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import type {
  OpenProjectService,
  ReadOnlyOpenProjectService,
} from "@/core/persistence/WorkspaceService.ts";

type UseSaveProps = {
  workingFilesStore: WorkingFilesStore;
  workspaceBaselineStore: WorkspaceBaselineStore;
  recoveredConflictTracker: RecoveredConflictTracker;
  interactionGate: WorkspaceGateStore;
  saveStatusStore: SaveStatusStore;
  editorRef: React.RefObject<LexicalEditor | null>;
  pickedFile: ScriptureBookState | null;
  pickedChapter: ScriptureChapterState | null;
  loadedProject: Project;
  history: CustomHistoryHook;
  projectsService: OpenProjectService & ReadOnlyOpenProjectService;
  fileSystem: FileSystem;
  storageRoots: StorageRoots;
  gitProvider: GitProvider;
  editorMode: EditorModeSetting;
  allProjects: ProjectListItem[];
  currentProjectRoute: string;
  mirrorFeed?: MirrorFeed;
  onGitRemoteStatusChanged?: (status: GitRemoteProjectStatus | null) => void;
  onSuccessfulDiskSave?: (receipt: SuccessfulDiskSaveReceipt) => void;
};

export type PrintChangesResult =
  | { ok: true; changeSet: PrintChangeSet; baseline: VersionEntry }
  | { ok: false; reason: "no-baseline" }
  | { ok: false; reason: "empty"; baseline: VersionEntry };

export type BuildPrintChangesFn = (opts: {
  baselineHash: string;
  scope: PrintScope;
  granularity: PrintGranularity;
  includeUsfm: boolean;
}) => Promise<PrintChangesResult>;

export type PrintCheckpoint = { hash: string; label: string };
export type UseSaveReturn = ReturnType<typeof useSave>;

const VERSION_LABEL_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/** Compose save, frozen compare, projection Apply, version, and remote flows. */
export function useSave(args: UseSaveProps) {
  const { usfmOnionService, settingsManager, authSessionProvider } =
    useRouter().options.context;
  const [, setDirtyVersion] = useState(0);
  const bumpDirtyVersion = () => setDirtyVersion((value) => value + 1);

  const versions = useVersionHistory({
    loadedProject: args.loadedProject,
    gitProvider: args.gitProvider,
    workingFilesStore: args.workingFilesStore,
    interactionGate: args.interactionGate,
    pickedFile: args.pickedFile,
    pickedChapter: args.pickedChapter,
    editorRef: args.editorRef,
    history: args.history,
    editorMode: args.editorMode,
    usfmOnionService,
    bumpDirtyVersion,
  });

  const residentFeed = args.mirrorFeed;
  const saveAndRevert = useSaveAndRevert({
    ...args,
    settingsManager,
    authSessionProvider,
    isViewingOlderVersion: versions.state.isViewingOlderVersion,
    selectedVersionHash: versions.state.selectedHash,
    refreshVersions: versions.actions.refresh,
    onSavedVersion: (hash) => {
      versions.actions.setLatestHash(hash);
      versions.actions.setSelectedHash(hash);
    },
    bumpDirtyVersion,
    publishBraid: residentFeed
      ? (generation) =>
          publishResidentBraid({
            feed: residentFeed,
            generation,
          })
      : undefined,
    onSuccessfulDiskSave: (receipt) => {
      if (receipt.braidPublication) {
        void writeBraidWarmCache({
          fileSystem: args.fileSystem,
          cacheRoot: args.storageRoots.cacheRoot,
          workspaceKey: args.loadedProject.folderName,
          publication: receipt.braidPublication,
          project: args.loadedProject,
        });
      }
      args.onSuccessfulDiskSave?.(receipt);
    },
  });

  const compareSession = useCompareSession({
    workingFilesStore: args.workingFilesStore,
    usfmOnionService,
  });
  const sourceLoader = useMemo(
    () =>
      new CompareSourceLoader({
        projectsService: args.projectsService,
        fileSystem: args.fileSystem,
        storageRoots: args.storageRoots,
        usfmOnionService,
        authSessionProvider,
        gitProvider: args.gitProvider,
      }),
    [
      args.fileSystem,
      args.gitProvider,
      args.projectsService,
      args.storageRoots,
      authSessionProvider,
      usfmOnionService,
    ],
  );

  const workingSource = useMemo(
    () =>
      createWorkingCompareSourceDescriptor({
        workingFilesStore: args.workingFilesStore,
        project: args.loadedProject,
      }),
    [args.loadedProject, args.workingFilesStore],
  );
  const savedSource = useMemo(
    () =>
      createSavedCompareSourceDescriptor({
        workingFilesStore: args.workingFilesStore,
        project: args.loadedProject,
      }),
    [args.loadedProject, args.workingFilesStore],
  );

  function incomingFlowsBlocked() {
    return (
      !requireGateOpen(args.interactionGate.get()) ||
      !args.recoveredConflictTracker.isEmpty()
    );
  }

  async function openSources(
    left: CompareSourceDescriptor,
    right: CompareSourceDescriptor,
  ) {
    const sources = buildCompareSourcePair({ left, right });
    if (requiresIncomingFlowGuard(sources) && incomingFlowsBlocked()) {
      return;
    }
    versions.actions.close();
    await compareSession.actions.open({ left, right });
  }

  async function openSavedWorkingReview() {
    await versions.actions.ensureLoaded();
    await openSources(savedSource, workingSource);
  }

  async function replaceSource(
    side: CompareSide,
    descriptor: CompareSourceDescriptor,
  ) {
    const active = compareSession.state;
    const sources = replaceCompareSource({
      activeSources:
        active.status === "active" ? active.session.snapshot.sources : null,
      side,
      descriptor,
      defaultLeft: savedSource,
      defaultRight: workingSource,
      savedFallback: savedSource,
    });
    await openSources(sources.left, sources.right);
  }

  async function applyReview() {
    const activeBeforeApply = compareSession.state;
    if (activeBeforeApply.status !== "active") {
      throw new Error("No comparison session is open.");
    }
    if (
      requiresIncomingFlowGuard(activeBeforeApply.session.snapshot.sources) &&
      incomingFlowsBlocked()
    ) {
      throw new Error(
        "Apply refused because incoming reconciliation is currently blocked.",
      );
    }
    const context = compareSession.actions.beginApply();
    try {
      const historyToken = args.history.captureHistory();
      const committed = applyCompareProjectionToStore({
        workingFilesStore: args.workingFilesStore,
        interactionGate: args.interactionGate,
        snapshotFiles: context.workingFilesSnapshot,
        artifact: context.artifact,
        currentRevision: context.revision,
      });
      if (committed.kind !== "committed") {
        throw new Error(`Apply refused because ${committed.reason}.`);
      }
      args.history.recordHistory(historyToken, {
        label: "Apply reviewed changes",
        affected: [...committed.applied.changedChapters],
      });
      bumpDirtyVersion();

      const active = compareSession.state;
      if (active.status !== "active") {
        throw new Error("The active comparison closed during Apply.");
      }
      const sources = active.session.snapshot.sources;
      const persistenceOptions = buildApplySaveOptions({
        sources,
        applied: committed.applied,
      });
      const remoteMaterial = [
        active.resources.left,
        active.resources.right,
      ].find((material) => material.remoteSync);
      const remoteSync = remoteMaterial?.remoteSync;
      const saveResult = await saveAndRevert.actions.saveProjectToDisk({
        ...persistenceOptions,
        prepareRemoteBaseForSave: remoteSync
          ? async () => {
              await prepareRemoteBaseForReconciliation({
                projectPath: args.loadedProject.projectPath,
                trackedBranch: remoteSync.trackedBranch,
                remoteHead: remoteSync.remoteHead,
                relationship: remoteSync.relationship,
                gitProvider: args.gitProvider,
              });
            }
          : undefined,
      });
      if (saveResult.kind !== "saved") {
        throw new Error(`Apply persisted with result ${saveResult.kind}.`);
      }
      compareSession.actions.completeApply(context);
    } catch (error) {
      compareSession.actions.failApply(context, error);
      throw error;
    }
  }

  async function openRemoteLatestReview(options?: {
    openModalOnRequiresReview?: boolean;
  }) {
    if (incomingFlowsBlocked()) return undefined;
    const remote = sourceLoader.createRemoteLatestDescriptor({
      loadedProject: args.loadedProject,
    });
    await openSources(workingSource, remote);
    const active = compareSession.state;
    if (active.status !== "active") return undefined;
    const requiresReview = hasCompareChanges(active.session.snapshot);
    if (!settingsManager.get("autoAcceptIncomingWork") || !requiresReview) {
      if (!requiresReview && options?.openModalOnRequiresReview === false) {
        await compareSession.actions.close();
      }
      return { requiresReview };
    }

    const remoteMaterial = active.resources.right;
    if (!remoteMaterial.remoteSync) return { requiresReview };
    const outcome = await runIncomingReconciliation(
      {
        args: {
          workingFilesStore: args.workingFilesStore,
          interactionGate: args.interactionGate,
          loadedProject: args.loadedProject,
          fileSystem: args.fileSystem,
          storageRoots: args.storageRoots,
          usfmOnionService,
          gitProvider: args.gitProvider,
          history: args.history,
          editorRef: args.editorRef,
          pickedFile: args.pickedFile,
          pickedChapter: args.pickedChapter,
          editorMode: args.editorMode,
          bumpDirtyVersion,
          onGitRemoteStatusChanged: args.onGitRemoteStatusChanged,
        },
        commitIncoming: (input) => {
          if (!requireGateOpen(args.interactionGate.get())) return false;
          args.workingFilesStore.commit(input);
          return true;
        },
        incomingFlowsBlocked,
        listCompareChapterRefs: () =>
          listChangedChapterRefs(active.session.snapshot),
      },
      {
        sourceFiles: remoteMaterial.files,
        metadata: remoteMaterial.metadata ?? {},
        cleanup: remoteMaterial.cleanup,
        remoteSync: remoteMaterial.remoteSync,
        initialSnapshot: active.session.snapshot,
      },
    );
    if (outcome.remoteAccept) {
      const status = await acceptRemoteLatestReview({
        projectPath: args.loadedProject.projectPath,
        trackedBranch: outcome.remoteAccept.trackedBranch,
        remoteHead: outcome.remoteAccept.remoteHead,
        fileSystem: args.fileSystem,
        storageRoots: args.storageRoots,
        gitProvider: args.gitProvider,
      });
      args.onGitRemoteStatusChanged?.(status);
    }
    await compareSession.actions.close();
    if (
      outcome.requiresReview &&
      (options?.openModalOnRequiresReview ?? true)
    ) {
      await openSources(workingSource, remote);
    }
    return {
      requiresReview: outcome.requiresReview,
      requiresReconciliationSave: outcome.requiresReconciliationSave,
    };
  }

  const availableProjects = useMemo(
    () =>
      args.allProjects.filter(
        (project) => project.folderName !== args.currentProjectRoute,
      ),
    [args.allProjects, args.currentProjectRoute],
  );
  const versionOptions = versions.state.entries.map((entry) => ({
    value: entry.hash,
    label: `${entry.subject || "Saved version"} · ${VERSION_LABEL_FORMATTER.format(new Date(entry.authoredAtIso))}`,
  }));

  const buildPrintChanges: BuildPrintChangesFn = async (options) => {
    const baseline =
      versions.state.entries.find(
        (entry) => entry.hash === options.baselineHash,
      ) ?? null;
    if (!baseline) return { ok: false, reason: "no-baseline" };
    const snapshot = await args.gitProvider.readProjectSnapshotAtCommit(
      args.loadedProject.projectPath,
      baseline.hash,
    );
    const oldFiles = await snapshotToScriptureBookStates({
      loadedProject: args.loadedProject,
      snapshot,
      usfmOnionService,
    });
    const currentFiles = args.workingFilesStore.read();
    const oldSource = createCompareSourceDescriptor({
      id: `print:${baseline.hash}`,
      label: baseline.subject || "Saved version",
      locator: {
        kind: COMPARE_SOURCE_KIND.PREVIOUS_VERSION,
        projectId:
          args.loadedProject.projectId ?? args.loadedProject.folderName,
        oid: baseline.hash,
      },
      reload: async () => ({ files: oldFiles }),
    });
    const currentSource = createCompareSourceDescriptor({
      id: "print:current",
      label: "Current",
      locator: {
        kind: COMPARE_SOURCE_KIND.SAVED,
        projectId:
          args.loadedProject.projectId ?? args.loadedProject.folderName,
      },
      reload: async () => ({ files: currentFiles }),
    });
    const changeSet = await buildPrintChangeSet({
      oldFiles,
      newFiles: currentFiles,
      sources: buildCompareSourcePair({
        left: oldSource,
        right: currentSource,
      }),
      usfmOnionService,
      scope: options.scope,
      granularity: options.granularity,
      includeUsfm: options.includeUsfm,
    });
    return changeSet.totalChanges === 0
      ? { ok: false, reason: "empty", baseline }
      : { ok: true, changeSet, baseline };
  };

  useEffect(() => {
    if (typeof window === "undefined" || !saveAndRevert.state.hasUnsavedChanges)
      return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveAndRevert.state.hasUnsavedChanges]);

  const saveReview = async () => {
    if (
      settingsManager.get("autoAcceptOwnWorkOnSave") &&
      args.recoveredConflictTracker.isEmpty()
    ) {
      await saveAndRevert.actions.saveProjectToDisk({
        reviewedRecoveredWork: true,
      });
      return;
    }
    await openSavedWorkingReview();
  };

  return {
    diff: {
      state: compareSession.state,
      open: saveReview,
      close: compareSession.actions.close,
      refresh: compareSession.actions.refresh,
      apply: applyReview,
      setUnitDecision: compareSession.actions.setUnitDecision,
      setPresenceDecision: compareSession.actions.setPresenceDecision,
      stampChapter: compareSession.actions.stampChapter,
      stampAll: compareSession.actions.stampAll,
    },
    save: {
      saveProjectToDisk: saveAndRevert.actions.saveProjectToDisk,
      hasUnsavedChanges: saveAndRevert.state.hasUnsavedChanges,
    },
    revert: { all: saveAndRevert.actions.revertAll },
    versions: {
      isOpen: versions.state.isOpen,
      entries: versions.state.entries,
      isLoading: versions.state.isLoading,
      isSwitching: versions.state.isSwitchingVersion,
      selectedHash: versions.state.selectedHash,
      latestHash: versions.state.latestHash,
      isViewingOlderVersion: versions.state.isViewingOlderVersion,
      open: () =>
        versions.actions.open({
          hasUnsavedChanges: saveAndRevert.state.hasUnsavedChanges,
        }),
      close: versions.actions.close,
      ensureLoaded: versions.actions.ensureLoaded,
      loadMore: versions.actions.loadMore,
      select: (hash: string) =>
        versions.actions.select({
          hash,
          hasUnsavedChanges: saveAndRevert.state.hasUnsavedChanges,
        }),
      backToLatest: () =>
        versions.actions.backToLatest({
          hasUnsavedChanges: saveAndRevert.state.hasUnsavedChanges,
        }),
      dirtyPrompt: {
        isOpen: versions.state.isDirtyPromptOpen,
        dismiss: versions.actions.dismissDirtyPrompt,
        discardAndContinue: () =>
          versions.actions.discardAndContinue(async () => {
            await saveAndRevert.actions.discardAllChanges();
          }),
        saveAndContinue: () =>
          versions.actions.saveAndContinue(() => {
            void openSavedWorkingReview();
          }),
      },
    },
    compare: {
      availableProjects,
      versionOptions,
      printCheckpoints: versions.state.entries.map((entry) => ({
        hash: entry.hash,
        label: `${entry.subject || "Saved version"} · ${VERSION_LABEL_FORMATTER.format(new Date(entry.authoredAtIso))}`,
      })),
      buildPrintChanges,
      openRemoteLatestReview,
      selectWorking: (side: CompareSide) => replaceSource(side, workingSource),
      selectSaved: (side: CompareSide) => replaceSource(side, savedSource),
      selectProject: (side: CompareSide, projectId: string) => {
        const project = availableProjects.find(
          (candidate) =>
            candidate.projectId === projectId ||
            candidate.folderName === projectId,
        );
        return replaceSource(
          side,
          sourceLoader.createExistingProjectDescriptor({
            projectId,
            label: project?.displayName ?? "Project",
          }),
        );
      },
      selectVersion: (side: CompareSide, oid: string) =>
        replaceSource(
          side,
          sourceLoader.createPreviousVersionDescriptor({
            loadedProject: args.loadedProject,
            oid,
            label:
              versionOptions.find((option) => option.value === oid)?.label ??
              "Saved version",
          }),
        ),
      selectRemote: (side: CompareSide) =>
        replaceSource(
          side,
          sourceLoader.createRemoteLatestDescriptor({
            loadedProject: args.loadedProject,
          }),
        ),
      selectZip: (side: CompareSide, file: File) =>
        replaceSource(side, sourceLoader.createZipFileDescriptor({ file })),
      selectDirectory: (side: CompareSide, files: FileList) =>
        replaceSource(side, sourceLoader.createDirectoryDescriptor({ files })),
    },
  };
}
