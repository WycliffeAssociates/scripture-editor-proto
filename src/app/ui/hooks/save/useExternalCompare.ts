import type { LexicalEditor } from "lexical";
import { useMemo, useRef, useState } from "react";

import { type EditorModeSetting, shapeForSurface } from "@/app/data/editor.ts";
import { acceptRemoteLatestReview } from "@/app/domain/project/acceptRemoteLatestReview.ts";
import { applyIncomingToStore } from "@/app/domain/project/compare/applyIncomingToStore.ts";
import {
  applyIncomingChapter,
  applyIncomingChapterAll,
} from "@/app/domain/project/compare/compareMutations.ts";
import {
  buildCompareResultAsync,
  type CompareMetadataSummary,
} from "@/app/domain/project/compare/compareService.ts";
import { CompareSourceLoader } from "@/app/domain/project/compare/compareSourceLoader.ts";
import type {
  CompareMode,
  CompareSourceKind,
} from "@/app/domain/project/compare/types.ts";
import { COMPARE_SOURCE_KIND } from "@/app/domain/project/compare/types.ts";
import type {
  DiffsByChapter,
  ProjectDiff,
} from "@/app/domain/project/diffTypes.ts";
import {
  buildPrintChangeSet,
  type PrintChangeSet,
  type PrintGranularity,
  type PrintScope,
} from "@/app/domain/project/print/buildPrintChangeSet.ts";
import { hasDiffsByChapter } from "@/app/domain/project/remoteSync/incomingReconciliationPlan.ts";
import {
  type CompareResultState,
  runIncomingReconciliation,
} from "@/app/domain/project/remoteSync/runIncomingReconciliation.ts";
import { applyVersionSnapshotToWorkingFiles } from "@/app/domain/project/versionNavigationService.ts";
import { snapshotToScriptureBookStates } from "@/app/domain/project/versionSnapshotAdapter.ts";
import { allChapterRefs } from "@/app/domain/project/workingFileMutations.ts";
import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { RecoveredConflictTracker } from "@/app/state/RecoveredConflictTracker.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import {
  requireGateOpen,
  type WorkspaceGateStore,
} from "@/app/state/WorkspaceInteractionGate.ts";
import {
  createDiffCalculationRunner,
  yieldToMainThread,
} from "@/app/ui/hooks/diffCalculationRunner.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type {
  GitProvider,
  VersionEntry,
} from "@/core/persistence/GitProvider.ts";
import type { GitRemoteProjectStatus } from "@/core/persistence/gitRemoteModels.ts";
import {
  GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY,
  GIT_REMOTE_RELATIONSHIP_DIVERGED,
} from "@/core/persistence/gitRemoteRelationship.ts";
import type {
  Project,
  ProjectListItem,
} from "@/core/persistence/ScriptureWorkspace.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import type {
  OpenProjectService,
  ReadOnlyOpenProjectService,
} from "@/core/persistence/WorkspaceService.ts";

import {
  buildCurrentProjectCompareMetadata,
  type ChapterRef,
  selectScriptureBookStatesForChapterRefs,
} from "./shared.ts";

const DIFF_CHUNK_SIZE = 8;

/** Outcome of {@link buildPrintChanges}; the UI renders or shows why it can't. */
export type PrintChangesResult =
  | { ok: true; changeSet: PrintChangeSet; baseline: VersionEntry }
  | { ok: false; reason: "no-baseline" }
  | { ok: false; reason: "empty"; baseline: VersionEntry };

export type BuildPrintChangesFn = (opts: {
  /** The saved checkpoint to treat as the baseline (a commit hash). */
  baselineHash: string;
  scope: PrintScope;
  granularity: PrintGranularity;
  includeUsfm: boolean;
}) => Promise<PrintChangesResult>;

/** A saved checkpoint offered as a print baseline. */
export type PrintCheckpoint = {
  hash: string;
  label: string;
};

// Hoisted so version-list mapping doesn't allocate a new formatter per row.
// Locale-undefined falls back to navigator.language.
const VERSION_LABEL_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * External-compare hook for the scripture workspace.
 *
 * This hook loads an external baseline (other project, prior version, zip, or
 * directory), runs chapter-aware diffs against the current in-memory workspace,
 * and exposes apply/refresh helpers for the compare UI.
 */
// TODO: large arg list — consider grouping the workspace nouns/sinks into a
// smaller set of cohesive sub-objects.
export function useExternalCompare(args: {
  workingFilesStore: WorkingFilesStore;
  recoveredConflictTracker: RecoveredConflictTracker;
  interactionGate: WorkspaceGateStore;
  loadedProject: Project;
  projectsService: OpenProjectService & ReadOnlyOpenProjectService;
  fileSystem: FileSystem;
  storageRoots: StorageRoots;
  editorMode: EditorModeSetting;
  usfmOnionService: IUsfmOnionService;
  allProjects: ProjectListItem[];
  currentProjectRoute: string;
  pickedFile: ScriptureBookState | null;
  pickedChapter: ScriptureChapterState | null;
  editorRef: React.RefObject<LexicalEditor | null>;
  history: CustomHistoryHook;
  gitProvider: GitProvider;
  versions: VersionEntry[];
  authSessionProvider: AuthSessionProvider;
  autoAcceptIncomingWork: boolean;
  bumpDirtyVersion: () => void;
  onGitRemoteStatusChanged?: (status: GitRemoteProjectStatus | null) => void;
}) {
  const [mode, setMode] = useState<CompareMode>("unsaved");
  const [sourceKind, setSourceKind] = useState<CompareSourceKind>(
    COMPARE_SOURCE_KIND.EXISTING_PROJECT,
  );
  const [sourceProjectId, setSourceProjectId] = useState("");
  const [sourceVersionHash, setSourceVersionHash] = useState("");
  const [compareResult, setCompareResult] = useState<CompareResultState | null>(
    null,
  );
  const [isCalculating, setIsCalculating] = useState(false);
  const calculationRunnerRef = useRef(
    createDiffCalculationRunner({
      setIsCalculatingDiffs: setIsCalculating,
      delayMs: 200,
    }),
  );
  const compareSourceLoader = new CompareSourceLoader({
    projectsService: args.projectsService,
    fileSystem: args.fileSystem,
    storageRoots: args.storageRoots,
    usfmOnionService: args.usfmOnionService,
    authSessionProvider: args.authSessionProvider,
    gitProvider: args.gitProvider,
  });
  const workingShape = () => shapeForSurface("workingRebuild", args.editorMode);

  async function computeExternalDiffs(
    sourceFiles: ScriptureBookState[],
    metadata: CompareMetadataSummary,
    cleanup?: () => Promise<void>,
  ) {
    const result = await buildCompareResultAsync({
      currentFiles: args.workingFilesStore.read(),
      usfmOnionService: args.usfmOnionService,
      sourceFiles,
      currentMetadata: buildCurrentProjectCompareMetadata(args.loadedProject),
      sourceMetadata: metadata,
      batchSize: DIFF_CHUNK_SIZE,
      onBatchComplete: yieldToMainThread,
    });
    setCompareResult({
      diffsByChapter: result.diffsByChapter,
      warnings: result.warnings,
      metadata,
      cleanup,
      sourceFiles,
      remoteSync: undefined,
    });
  }

  async function rerunForChapters(chapters: ChapterRef[]) {
    if (!compareResult?.sourceFiles || !compareResult.metadata) return;

    const result = await buildCompareResultAsync({
      currentFiles: selectScriptureBookStatesForChapterRefs(
        args.workingFilesStore.read(),
        chapters,
      ),
      sourceFiles: selectScriptureBookStatesForChapterRefs(
        compareResult.sourceFiles,
        chapters,
      ),
      currentMetadata: buildCurrentProjectCompareMetadata(args.loadedProject),
      sourceMetadata: compareResult.metadata,
      usfmOnionService: args.usfmOnionService,
      batchSize: DIFF_CHUNK_SIZE,
      onBatchComplete: yieldToMainThread,
    });

    setCompareResult((prev) => {
      if (!prev) return prev;
      const merged: DiffsByChapter = structuredClone(prev.diffsByChapter);
      for (const { bookCode, chapterNum } of chapters) {
        let book = merged[bookCode];
        if (!book) {
          book = {};
          merged[bookCode] = book;
        }
        book[chapterNum] = result.diffsByChapter[bookCode]?.[chapterNum] ?? [];
      }
      return {
        ...prev,
        diffsByChapter: merged,
      };
    });
  }

  function refresh() {
    if (!compareResult?.sourceFiles || !compareResult.metadata) return;
    const { sourceFiles, metadata, cleanup } = compareResult;
    void calculationRunnerRef.current.run(async () => {
      await computeExternalDiffs(sourceFiles, metadata, cleanup);
    });
  }

  function listCompareChapterRefs(): ChapterRef[] {
    const keys = new Set<string>();
    for (const file of args.workingFilesStore.read()) {
      for (const chapter of file.chapters) {
        keys.add(`${file.bookCode}:${chapter.chapterNumber}`);
      }
    }
    for (const file of compareResult?.sourceFiles ?? []) {
      for (const chapter of file.chapters) {
        keys.add(`${file.bookCode}:${chapter.chapterNumber}`);
      }
    }

    const out: ChapterRef[] = [];
    for (const key of keys) {
      const [bookCode, chapterPart] = key.split(":");
      const chapterNum = Number(chapterPart);
      if (bookCode && !Number.isNaN(chapterNum)) {
        out.push({ bookCode, chapterNum });
      }
    }
    return out;
  }

  const reset = () => {
    if (compareResult?.cleanup) {
      void compareResult.cleanup();
    }
    setCompareResult(null);
    setSourceProjectId("");
    setSourceVersionHash("");
    setSourceKind(COMPARE_SOURCE_KIND.EXISTING_PROJECT);
  };

  // Incoming-source flows are deferred while EITHER:
  //  - the workspace is gated (a recovery Keep/Discard decision is pending, or
  //    a save is in flight), or
  //  - recovered conflicts remain unresolved.
  // Both matter: a baseline-matched restore leaves the tracker EMPTY while the
  // gate is still recovery-decision-pending, and importing then would clobber
  // correctly-recovered work before the user has acknowledged the banner. Gate
  // every public source-loading action at entry; the toolbar mode-entry
  // control is the visible boundary above this net.
  function incomingFlowsBlocked(): boolean {
    return (
      !requireGateOpen(args.interactionGate.get()) ||
      !args.recoveredConflictTracker.isEmpty()
    );
  }

  // Commit imported working state only if the gate is still open at the
  // mutation boundary. Incoming auto-accept awaits network/diff work between
  // its entry check and these commits; a save can flip the gate to `saving`
  // in that window, and committing then would violate the "blocked during
  // save" contract. Returns whether the commit was applied so callers can
  // abort the rest of the reconciliation (and skip remote-accept side effects)
  // rather than mark a remote synced without applying it.
  function commitIncoming(
    input: Parameters<WorkingFilesStore["commit"]>[0],
  ): boolean {
    if (!requireGateOpen(args.interactionGate.get())) return false;
    args.workingFilesStore.commit(input);
    return true;
  }

  // Shared skeleton for the non-remote source loaders. Each one was an
  // identical wrapper around: gate-check → calculation run → release the
  // previous source's temp dir (cleanup-on-swap) → load → reset source
  // bookkeeping → compute diffs. Centralizing it means a temp dir can't leak
  // and a new loader can't forget the gate guard.
  async function runSourceLoad(load: {
    run: () => Promise<{
      parsedFiles: ScriptureBookState[];
      metadata: CompareMetadataSummary;
      cleanup?: () => Promise<void>;
    }>;
    sourceProjectId: string;
    sourceVersionHash: string;
  }) {
    if (incomingFlowsBlocked()) return;
    await calculationRunnerRef.current.run(async () => {
      if (compareResult?.cleanup) {
        await compareResult.cleanup();
      }
      const loaded = await load.run();
      setSourceProjectId(load.sourceProjectId);
      setSourceVersionHash(load.sourceVersionHash);
      await computeExternalDiffs(
        loaded.parsedFiles,
        loaded.metadata,
        loaded.cleanup,
      );
    });
  }

  async function loadFromProject(projectId: string) {
    if (!projectId) return;
    await runSourceLoad({
      sourceProjectId: projectId,
      sourceVersionHash: "",
      run: async () => {
        const loaded = await compareSourceLoader.loadExistingProject(projectId);
        return {
          parsedFiles: loaded.parsedFiles,
          metadata: loaded.metadataSummary,
          cleanup: loaded.cleanup,
        };
      },
    });
  }

  async function loadFromZip(file: File) {
    await runSourceLoad({
      sourceProjectId: "",
      sourceVersionHash: "",
      run: async () => {
        const loaded = await compareSourceLoader.loadFromZipFile(file);
        return {
          parsedFiles: loaded.parsedFiles,
          metadata: loaded.metadataSummary,
          cleanup: loaded.cleanup,
        };
      },
    });
  }

  async function loadFromDirectory(files: FileList) {
    await runSourceLoad({
      sourceProjectId: "",
      sourceVersionHash: "",
      run: async () => {
        const loaded = await compareSourceLoader.loadFromDirectoryFiles(files);
        return {
          parsedFiles: loaded.parsedFiles,
          metadata: loaded.metadataSummary,
          cleanup: loaded.cleanup,
        };
      },
    });
  }

  async function loadFromVersion(commitHash: string) {
    if (!commitHash) return;
    await runSourceLoad({
      sourceProjectId: "",
      sourceVersionHash: commitHash,
      run: async () => {
        const snapshot = await args.gitProvider.readProjectSnapshotAtCommit(
          args.loadedProject.projectPath,
          commitHash,
        );
        const parsedFiles = await snapshotToScriptureBookStates({
          loadedProject: args.loadedProject,
          snapshot,
          usfmOnionService: args.usfmOnionService,
        });
        return {
          parsedFiles,
          metadata: buildCurrentProjectCompareMetadata(args.loadedProject),
        };
      },
    });
  }

  // "Print changes" — UI sugar over the saved-version compare: pick a saved
  // checkpoint, diff the working files against it, and hand the result to the
  // print-document renderer. This runs its OWN snapshot + diff (it does not
  // enter external-compare mode) so printing never disturbs whatever the modal
  // is currently comparing.
  async function buildPrintChanges(opts: {
    baselineHash: string;
    scope: PrintScope;
    granularity: PrintGranularity;
    includeUsfm: boolean;
  }): Promise<PrintChangesResult> {
    const baseline =
      args.versions.find((version) => version.hash === opts.baselineHash) ??
      null;
    if (!baseline) {
      return { ok: false, reason: "no-baseline" };
    }

    const snapshot = await args.gitProvider.readProjectSnapshotAtCommit(
      args.loadedProject.projectPath,
      baseline.hash,
    );
    const oldFiles = await snapshotToScriptureBookStates({
      loadedProject: args.loadedProject,
      snapshot,
      usfmOnionService: args.usfmOnionService,
    });

    const changeSet = await buildPrintChangeSet({
      oldFiles,
      newFiles: args.workingFilesStore.read(),
      usfmOnionService: args.usfmOnionService,
      scope: opts.scope,
      granularity: opts.granularity,
      includeUsfm: opts.includeUsfm,
    });

    if (changeSet.totalChanges === 0) {
      return { ok: false, reason: "empty", baseline };
    }
    return { ok: true, changeSet, baseline };
  }

  async function loadFromRemoteLatest() {
    if (incomingFlowsBlocked()) return undefined;
    return await calculationRunnerRef.current.run(async () => {
      if (compareResult?.cleanup) {
        await compareResult.cleanup();
      }
      const loaded = await compareSourceLoader.loadRemoteLatest(
        args.loadedProject,
      );
      setSourceProjectId("");
      setSourceVersionHash("");
      const result = await buildCompareResultAsync({
        currentFiles: args.workingFilesStore.read(),
        usfmOnionService: args.usfmOnionService,
        sourceFiles: loaded.parsedFiles,
        currentMetadata: buildCurrentProjectCompareMetadata(args.loadedProject),
        sourceMetadata: loaded.metadataSummary,
        batchSize: DIFF_CHUNK_SIZE,
        onBatchComplete: yieldToMainThread,
      });
      if (args.autoAcceptIncomingWork) {
        if (!loaded.remoteSync) {
          setCompareResult({
            diffsByChapter: result.diffsByChapter,
            warnings: result.warnings,
            metadata: loaded.metadataSummary,
            cleanup: loaded.cleanup,
            sourceFiles: loaded.parsedFiles,
            remoteSync: undefined,
          });
          return {
            requiresReview: hasDiffsByChapter(result.diffsByChapter),
          };
        }
        const outcome = await runIncomingReconciliation(
          {
            args,
            commitIncoming,
            incomingFlowsBlocked,
            listCompareChapterRefs,
          },
          {
            sourceFiles: loaded.parsedFiles,
            metadata: loaded.metadataSummary,
            cleanup: loaded.cleanup,
            initialWarnings: result.warnings,
            remoteSync: loaded.remoteSync,
            initialDiffsByChapter: result.diffsByChapter,
          },
        );
        // Apply the executor's outcome ONCE. If the outcome includes a
        // behind-only fast-forward, perform that durable git/status
        // accept first; only then publish the compare state that clears
        // `remoteSync`. If accept throws, the old compare state stays
        // attached so the UI does not forget pending remote work.
        if (outcome.remoteAccept) {
          const nextStatus = await acceptRemoteLatestReview({
            projectPath: args.loadedProject.projectPath,
            trackedBranch: outcome.remoteAccept.trackedBranch,
            remoteHead: outcome.remoteAccept.remoteHead,
            fileSystem: args.fileSystem,
            storageRoots: args.storageRoots,
            gitProvider: args.gitProvider,
          });
          args.onGitRemoteStatusChanged?.(nextStatus);
        }
        if (outcome.nextCompareResult) {
          setCompareResult(outcome.nextCompareResult);
        }
        return {
          requiresReview: outcome.requiresReview,
          requiresReconciliationSave: outcome.requiresReconciliationSave,
        };
      }
      setCompareResult({
        diffsByChapter: result.diffsByChapter,
        warnings: result.warnings,
        metadata: loaded.metadataSummary,
        cleanup: loaded.cleanup,
        sourceFiles: loaded.parsedFiles,
        remoteSync: loaded.remoteSync,
      });
      return {
        requiresReview: hasDiffsByChapter(result.diffsByChapter),
      };
    });
  }

  async function openRemoteLatestReview(
    openDiffModal: () => Promise<void>,
    isDiffModalOpen: boolean,
    options?: {
      openModalOnRequiresReview?: boolean;
    },
  ) {
    // Guard before entering external mode: recovered conflicts must be
    // resolved before any incoming-source review can mutate working state.
    if (incomingFlowsBlocked()) return undefined;
    setMode("external");
    setSourceKind(COMPARE_SOURCE_KIND.REMOTE_LATEST);
    const result = await loadFromRemoteLatest();
    if (
      result?.requiresReview &&
      (options?.openModalOnRequiresReview ?? true) &&
      !isDiffModalOpen
    ) {
      await openDiffModal();
    }
    return result;
  }

  function applyIncomingHunkToCurrent(diff: ProjectDiff) {
    if (!requireGateOpen(args.interactionGate.get())) return;
    if (!compareResult?.sourceFiles) return;
    void (async () => {
      // Scratch-apply then synchronous overlay-from-latest commit
      // (lost-update-safe) through the gate. Bail if the gate closed.
      const historyToken = args.history.captureHistory();
      const applied = await applyIncomingToStore({
        workingFilesStore: args.workingFilesStore,
        interactionGate: args.interactionGate,
        usfmOnionService: args.usfmOnionService,
        fullChapterApplies: [],
        hunkApplies: [diff],
        sourceFiles: compareResult.sourceFiles ?? [],
        shape: workingShape(),
      });
      if (applied.kind !== "committed") return;
      args.history.recordHistory(historyToken, {
        label: `Take Incoming (${diff.semanticSid})`,
        affected: [{ bookCode: diff.bookCode, chapterNum: diff.chapterNum }],
      });
      args.bumpDirtyVersion();
      await rerunForChapters([
        {
          bookCode: diff.bookCode,
          chapterNum: diff.chapterNum,
        },
      ]);
    })();
  }

  function applyIncomingChapterToCurrent(bookCode: string, chapterNum: number) {
    if (!requireGateOpen(args.interactionGate.get())) return;
    if (!compareResult?.sourceFiles) return;
    void (async () => {
      const historyToken = args.history.captureHistory();
      const allRefs = allChapterRefs(args.workingFilesStore.read());
      const draft = args.workingFilesStore.draftWithChapters(allRefs);
      applyIncomingChapter({
        workingFiles: draft,
        sourceFiles: compareResult.sourceFiles ?? [],
        bookCode,
        chapterNum,
        shape: workingShape(),
      });
      // Sync applier (no await between draft and commit), so only the
      // gate recheck is needed at the commit boundary.
      if (
        !commitIncoming({
          patch: { kind: "bulk", files: draft },
          meta: {
            kind: "import",
            action: "applyIncoming",
            scope: { project: true },
            dirtyTextContent: true,
          },
        })
      ) {
        return;
      }
      args.history.recordHistory(historyToken, {
        label: `Take Incoming Chapter (${bookCode} ${chapterNum})`,
        affected: [{ bookCode, chapterNum }],
      });
      args.bumpDirtyVersion();
      await rerunForChapters([{ bookCode, chapterNum }]);
    })();
  }

  function applyIncomingAllToCurrent() {
    if (!requireGateOpen(args.interactionGate.get())) return;
    if (!compareResult?.sourceFiles) return;
    void (async () => {
      const historyToken = args.history.captureHistory();
      const allRefs = allChapterRefs(args.workingFilesStore.read());
      const draft = args.workingFilesStore.draftWithChapters(allRefs);
      applyIncomingChapterAll({
        workingFiles: draft,
        sourceFiles: compareResult.sourceFiles ?? [],
        shape: workingShape(),
      });
      if (
        compareResult.remoteSync?.relationship ===
        GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY
      ) {
        applyVersionSnapshotToWorkingFiles({
          workingFiles: draft,
          sourceFiles: compareResult.sourceFiles ?? [],
          shape: workingShape(),
        });
      }
      // Sync appliers (no await between draft and commit); gate-recheck
      // at the commit boundary and bail before the remote-accept below.
      if (
        !commitIncoming({
          patch: { kind: "bulk", files: draft },
          meta: {
            kind: "import",
            action: "applyIncoming",
            scope: { project: true },
            dirtyTextContent: true,
          },
        })
      ) {
        return;
      }
      args.history.recordHistory(historyToken, {
        label: "Take All Incoming Chapters",
        affected: allRefs,
      });
      args.bumpDirtyVersion();
      if (
        compareResult.remoteSync?.relationship ===
        GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY
      ) {
        const nextStatus = await acceptRemoteLatestReview({
          projectPath: args.loadedProject.projectPath,
          trackedBranch: compareResult.remoteSync.trackedBranch,
          remoteHead: compareResult.remoteSync.remoteHead,
          fileSystem: args.fileSystem,
          storageRoots: args.storageRoots,
          gitProvider: args.gitProvider,
        });
        args.onGitRemoteStatusChanged?.(nextStatus);
        setCompareResult((prev) =>
          prev
            ? {
                ...prev,
                diffsByChapter: {},
                warnings: [],
              }
            : prev,
        );
        return;
      }
      refresh();
    })();
  }

  const availableProjects = useMemo(
    () =>
      args.allProjects.filter(
        (project) => project.folderName !== args.currentProjectRoute,
      ),
    [args.allProjects, args.currentProjectRoute],
  );

  const versionOptions = useMemo(
    () =>
      args.versions.map((version) => ({
        value: version.hash,
        label: VERSION_LABEL_FORMATTER.format(new Date(version.authoredAtIso)),
      })),
    [args.versions],
  );

  // Saved checkpoints offered as print baselines (newest first), each labelled
  // with when it was saved.
  const printCheckpoints = useMemo<PrintCheckpoint[]>(
    () =>
      args.versions.map((version) => ({
        hash: version.hash,
        label: VERSION_LABEL_FORMATTER.format(new Date(version.authoredAtIso)),
      })),
    [args.versions],
  );

  return {
    state: {
      mode,
      sourceKind,
      sourceProjectId,
      sourceVersionHash,
      warnings: compareResult?.warnings ?? [],
      hasComputed: compareResult !== null,
      availableProjects,
      versionOptions,
      printCheckpoints,
      diffsByChapter: compareResult?.diffsByChapter ?? null,
      isCalculating,
      pendingRemotePartialReconciliation:
        (compareResult?.remoteSync?.relationship ===
          GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY ||
          compareResult?.remoteSync?.relationship ===
            GIT_REMOTE_RELATIONSHIP_DIVERGED) &&
        hasDiffsByChapter(compareResult.diffsByChapter)
          ? {
              remoteHead: compareResult.remoteSync.remoteHead,
              trackedBranch: compareResult.remoteSync.trackedBranch,
              relationship: compareResult.remoteSync.relationship,
            }
          : null,
    },
    actions: {
      setMode,
      setSourceKind,
      setSourceProjectId,
      setSourceVersionHash,
      loadFromProject,
      loadFromZip,
      loadFromDirectory,
      loadFromVersion,
      buildPrintChanges,
      loadFromRemoteLatest,
      openRemoteLatestReview,
      applyIncomingHunk: applyIncomingHunkToCurrent,
      applyIncomingChapter: applyIncomingChapterToCurrent,
      applyIncomingAll: applyIncomingAllToCurrent,
      refresh,
      reset,
      rerunForChapters,
    },
  };
}
