import type { LexicalEditor } from "lexical";

import type { EditorModeSetting } from "@/app/data/editor.ts";
import {
  applyIncomingToStore,
  runIncomingMutation,
} from "@/app/domain/project/compare/applyIncomingToStore.ts";
import { buildCompareResultAsync } from "@/app/domain/project/compare/compareService.ts";
import { projectCompareRevision } from "@/app/domain/project/compare/projection.ts";
import { buildCompareSourcePair } from "@/app/domain/project/compare/sourceDescriptors.ts";
import {
  COMPARE_SOURCE_KIND,
  type CompareMetadataSummary,
  type CompareRemoteSync,
  type CompareResult,
  type CompareSourceDescriptor,
} from "@/app/domain/project/compare/types.ts";
import {
  buildAutoAcceptIncomingDecisionPlan,
  buildBookTextByCodeFromScriptureFiles,
  buildBookTextByCodeFromSnapshot,
  buildChapterKey,
  buildDivergedAutoAcceptScopePlan,
  collectChangedBookCodes,
  collectChangedSkeletonSemanticAddresses,
  type DirtySemanticSidMap,
  hasCompareChanges,
  hasWholeBookOrChapterDeletion,
  listChangedChapterRefs,
} from "@/app/domain/project/remoteSync/incomingReconciliationPlan.ts";
import { applyVersionSnapshotToWorkingFiles } from "@/app/domain/project/versionNavigationService.ts";
import {
  allChapterRefs,
  type ChapterRef,
} from "@/app/domain/project/workingFileMutations.ts";
import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import {
  requireGateOpen,
  type WorkspaceGateStore,
} from "@/app/state/WorkspaceInteractionGate.ts";
import { yieldToMainThread } from "@/app/ui/hooks/diffCalculationRunner.ts";
import { buildCurrentProjectCompareMetadata } from "@/app/ui/hooks/save/shared.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type { GitRemoteProjectStatus } from "@/core/persistence/gitRemoteModels.ts";
import {
  GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY,
  GIT_REMOTE_RELATIONSHIP_DIVERGED,
  type GitRemoteRelationshipKind,
} from "@/core/persistence/gitRemoteRelationship.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

const DIFF_CHUNK_SIZE = 8;
/** Composition policy only. The planner supports all four configured scopes. */
const DIVERGED_AUTO_ACCEPT_SCOPE = "book" as const;

export type CompareResultState = {
  snapshot: CompareResult;
  cleanup?: () => Promise<void>;
  remoteSync?: CompareRemoteSync;
};

export type IncomingReconciliationArgs = {
  workingFilesStore: WorkingFilesStore;
  interactionGate: WorkspaceGateStore;
  loadedProject: Project;
  fileSystem: FileSystem;
  storageRoots: StorageRoots;
  usfmOnionService: IUsfmOnionService;
  gitProvider: GitProvider;
  history: CustomHistoryHook;
  editorRef: React.RefObject<LexicalEditor | null>;
  pickedFile: ScriptureBookState | null;
  pickedChapter: ScriptureChapterState | null;
  editorMode: EditorModeSetting;
  bumpDirtyVersion: () => void;
  onGitRemoteStatusChanged?: (status: GitRemoteProjectStatus | null) => void;
};

export type IncomingReconciliationDeps = {
  args: IncomingReconciliationArgs;
  commitIncoming: (
    input: Parameters<WorkingFilesStore["commit"]>[0],
  ) => boolean;
  incomingFlowsBlocked: () => boolean;
  listCompareChapterRefs: () => ChapterRef[];
};

type RemoteFastForward = { trackedBranch: string; remoteHead: string };

export type IncomingReconciliationInput = {
  sourceFiles: ScriptureBookState[];
  metadata: CompareMetadataSummary;
  cleanup?: () => Promise<void>;
  remoteSync: CompareRemoteSync;
  initialSnapshot: CompareResult;
};

export type IncomingReconciliationOutcome = {
  nextCompareResult?: CompareResultState;
  requiresReview: boolean;
  remoteAccept?: RemoteFastForward;
  requiresReconciliationSave?: {
    trackedBranch: string;
    remoteHead: string;
    relationship: GitRemoteRelationshipKind;
  };
};

export function finalizeOutcome(args: {
  nextCompareResult: CompareResultState;
  requiresReviewOverride?: boolean;
  behindOnlyFastForward?: RemoteFastForward;
  requiresReconciliationSave?: {
    trackedBranch: string;
    remoteHead: string;
    relationship: GitRemoteRelationshipKind;
  };
}): IncomingReconciliationOutcome {
  const requiresReview =
    args.requiresReviewOverride ??
    hasCompareChanges(args.nextCompareResult.snapshot);
  const remoteAccept = requiresReview ? undefined : args.behindOnlyFastForward;
  const nextCompareResult = remoteAccept
    ? { ...args.nextCompareResult, remoteSync: undefined }
    : args.nextCompareResult;
  return {
    nextCompareResult,
    requiresReview,
    remoteAccept,
    requiresReconciliationSave: args.requiresReconciliationSave,
  };
}

function comparisonDescriptor(args: {
  kind: "saved" | "working" | "remoteLatest";
  writable?: boolean;
  projectId: string;
}): CompareSourceDescriptor {
  const locator =
    args.kind === "remoteLatest"
      ? ({
          kind: COMPARE_SOURCE_KIND.REMOTE_LATEST,
          projectId: args.projectId,
        } as const)
      : args.kind === "working"
        ? ({
            kind: COMPARE_SOURCE_KIND.WORKING,
            projectId: args.projectId,
          } as const)
        : ({
            kind: COMPARE_SOURCE_KIND.SAVED,
            projectId: args.projectId,
          } as const);
  return {
    id: `${args.kind}:${args.projectId}`,
    label: args.kind,
    locator,
    writable: args.writable ?? false,
    reload: async () => ({ files: [] }),
  };
}

function baselineFiles(files: ScriptureBookState[]): ScriptureBookState[] {
  return files.map((file) => ({
    ...file,
    chapters: file.chapters.map((chapter) => ({
      ...chapter,
      currentTokens: chapter.sourceTokens,
      dirty: false,
    })),
  }));
}

async function buildDirtySemanticSidsByChapter(
  args: Pick<
    IncomingReconciliationArgs,
    "workingFilesStore" | "usfmOnionService" | "loadedProject"
  >,
): Promise<DirtySemanticSidMap> {
  const currentFiles = args.workingFilesStore.read();
  const projectId =
    args.loadedProject.projectId ?? args.loadedProject.folderName;
  const dirtySnapshot = await buildCompareResultAsync({
    leftFiles: baselineFiles(currentFiles),
    rightFiles: currentFiles,
    sources: buildCompareSourcePair({
      left: comparisonDescriptor({ kind: "saved", projectId }),
      right: comparisonDescriptor({
        kind: "working",
        writable: true,
        projectId,
      }),
    }),
    usfmOnionService: args.usfmOnionService,
    batchSize: DIFF_CHUNK_SIZE,
    onBatchComplete: yieldToMainThread,
  });
  const dirty = new Map<string, Set<string>>();
  for (const ref of listChangedChapterRefs(dirtySnapshot)) {
    const chapter = dirtySnapshot.chapters[ref.bookCode]?.[ref.chapterNum];
    if (!chapter) continue;
    const addresses = collectChangedSkeletonSemanticAddresses(chapter.skeleton);
    if (addresses.size)
      dirty.set(buildChapterKey(ref.bookCode, ref.chapterNum), addresses);
  }
  return dirty;
}

async function rebuildIncomingSnapshot(args: {
  reconciliation: IncomingReconciliationArgs;
  input: IncomingReconciliationInput;
}) {
  const writableSide = args.input.initialSnapshot.sources.writableSide;
  if (writableSide === null) {
    throw new Error("Incoming reconciliation requires a writable source.");
  }
  const working = args.reconciliation.workingFilesStore.read();
  return await buildCompareResultAsync({
    leftFiles: writableSide === "left" ? working : args.input.sourceFiles,
    rightFiles: writableSide === "right" ? working : args.input.sourceFiles,
    sources: args.input.initialSnapshot.sources,
    leftMetadata:
      writableSide === "left"
        ? buildCurrentProjectCompareMetadata(args.reconciliation.loadedProject)
        : args.input.metadata,
    rightMetadata:
      writableSide === "right"
        ? buildCurrentProjectCompareMetadata(args.reconciliation.loadedProject)
        : args.input.metadata,
    usfmOnionService: args.reconciliation.usfmOnionService,
    batchSize: DIFF_CHUNK_SIZE,
    onBatchComplete: yieldToMainThread,
  });
}

function resultState(
  input: IncomingReconciliationInput,
  snapshot: CompareResult,
): CompareResultState {
  return {
    snapshot,
    cleanup: input.cleanup,
    remoteSync: input.remoteSync,
  };
}

export async function runIncomingReconciliation(
  deps: IncomingReconciliationDeps,
  argsForAuto: IncomingReconciliationInput,
): Promise<IncomingReconciliationOutcome> {
  const { args, commitIncoming, incomingFlowsBlocked } = deps;
  if (incomingFlowsBlocked()) return { requiresReview: false };

  async function maybeAutoAcceptDivergedDisjoint() {
    if (
      argsForAuto.remoteSync.relationship !==
        GIT_REMOTE_RELATIONSHIP_DIVERGED ||
      !argsForAuto.remoteSync.localHead ||
      !argsForAuto.remoteSync.mergeBase
    ) {
      return null;
    }
    let baseSnapshot: Map<string, string>;
    let localSnapshot: Map<string, string>;
    let remoteSnapshot: Map<string, string>;
    try {
      [baseSnapshot, localSnapshot, remoteSnapshot] = await Promise.all([
        args.gitProvider.readProjectSnapshotAtCommit(
          args.loadedProject.projectPath,
          argsForAuto.remoteSync.mergeBase,
        ),
        args.gitProvider.readProjectSnapshotAtCommit(
          args.loadedProject.projectPath,
          argsForAuto.remoteSync.localHead,
        ),
        args.gitProvider.readProjectSnapshotAtCommit(
          args.loadedProject.projectPath,
          argsForAuto.remoteSync.remoteHead,
        ),
      ]);
    } catch {
      return null;
    }

    const baseByBook = buildBookTextByCodeFromSnapshot(baseSnapshot);
    const localByBook = buildBookTextByCodeFromSnapshot(localSnapshot);
    const remoteByBook = buildBookTextByCodeFromSnapshot(remoteSnapshot);
    const workingByBook = buildBookTextByCodeFromScriptureFiles(
      args.workingFilesStore.read(),
    );
    const remoteChangedBooks = collectChangedBookCodes({
      baseByBook,
      targetByBook: remoteByBook,
    });
    if (
      remoteChangedBooks.size === 0 ||
      hasWholeBookOrChapterDeletion({ baseByBook, remoteByBook })
    ) {
      return null;
    }

    const scopePlan = buildDivergedAutoAcceptScopePlan({
      baseByBook,
      localByBook,
      remoteByBook,
      scope: DIVERGED_AUTO_ACCEPT_SCOPE,
    });
    const dirtyWorkspaceBooks = collectChangedBookCodes({
      baseByBook: localByBook,
      targetByBook: workingByBook,
    });
    const remoteOverlapsDirty = [...dirtyWorkspaceBooks].some((bookCode) =>
      scopePlan.remoteChangedAddresses.has(bookCode),
    );
    if (
      scopePlan.hasOverlap ||
      remoteOverlapsDirty ||
      scopePlan.acceptedAddresses.size === 0
    ) {
      return null;
    }

    // At the currently composed book scope, protected addresses are book codes.
    // Keeping this translation here makes changing the enum a planner-policy
    // change rather than leaking Git concepts into the projection engine.
    const locallyProtectedBooks = new Set([
      ...scopePlan.protectedAddresses,
      ...dirtyWorkspaceBooks,
    ]);
    const allRefs = allChapterRefs(args.workingFilesStore.read());
    const draft = args.workingFilesStore.draftWithChapters(allRefs);
    applyVersionSnapshotToWorkingFiles({
      workingFiles: draft,
      sourceFiles: argsForAuto.sourceFiles,
      excludeBookCodes: locallyProtectedBooks,
    });
    const locallyProtectedChapters: ChapterRef[] = [];
    for (const file of draft) {
      if (!locallyProtectedBooks.has(file.bookCode)) continue;
      for (const chapter of file.chapters) {
        chapter.dirty = true;
        locallyProtectedChapters.push({
          bookCode: file.bookCode,
          chapterNum: chapter.chapterNumber,
        });
      }
    }
    const historyToken = args.history.captureHistory();
    if (
      !commitIncoming({
        patch: { kind: "bulk", files: draft },
        meta: {
          kind: "import",
          action: "incomingReconciliation",
          scope: { project: true },
          dirtyTextContent: true,
        },
      })
    ) {
      return null;
    }
    args.history.recordHistory(historyToken, {
      label: "Auto Accept Incoming Changes",
      affected: allRefs,
    });
    args.bumpDirtyVersion();
    const refreshed = await rebuildIncomingSnapshot({
      reconciliation: args,
      input: argsForAuto,
    });
    return finalizeOutcome({
      nextCompareResult: resultState(argsForAuto, refreshed),
      requiresReviewOverride: false,
      requiresReconciliationSave: {
        trackedBranch: argsForAuto.remoteSync.trackedBranch,
        remoteHead: argsForAuto.remoteSync.remoteHead,
        relationship: argsForAuto.remoteSync.relationship,
      },
    });
  }

  const diverged = await maybeAutoAcceptDivergedDisjoint();
  if (diverged) return diverged;
  if (
    argsForAuto.remoteSync.relationship === GIT_REMOTE_RELATIONSHIP_DIVERGED
  ) {
    return finalizeOutcome({
      nextCompareResult: resultState(argsForAuto, argsForAuto.initialSnapshot),
    });
  }

  const preReconcileState = args.workingFilesStore.read();
  const dirtySemanticSidsByChapter =
    await buildDirtySemanticSidsByChapter(args);
  const plan = buildAutoAcceptIncomingDecisionPlan({
    snapshot: argsForAuto.initialSnapshot,
    dirtySemanticSidsByChapter,
  });

  if (
    argsForAuto.remoteSync.relationship ===
      GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY &&
    plan.blockedUnitCount === 0
  ) {
    if (
      args.workingFilesStore.read() !== preReconcileState ||
      !requireGateOpen(args.interactionGate.get())
    ) {
      return { requiresReview: false };
    }
    const refs = allChapterRefs(args.workingFilesStore.read());
    const draft = args.workingFilesStore.draftWithChapters(refs);
    applyVersionSnapshotToWorkingFiles({
      workingFiles: draft,
      sourceFiles: argsForAuto.sourceFiles,
    });
    const historyToken = args.history.captureHistory();
    args.workingFilesStore.commit({
      patch: { kind: "bulk", files: draft },
      meta: {
        kind: "import",
        action: "incomingReconciliation",
        scope: { project: true },
        dirtyTextContent: true,
      },
    });
    args.history.recordHistory(historyToken, {
      label: "Auto Accept Incoming Changes",
      affected: refs,
    });
    args.bumpDirtyVersion();
    const refreshed = await rebuildIncomingSnapshot({
      reconciliation: args,
      input: argsForAuto,
    });
    return finalizeOutcome({
      nextCompareResult: resultState(argsForAuto, refreshed),
      behindOnlyFastForward: {
        trackedBranch: argsForAuto.remoteSync.trackedBranch,
        remoteHead: argsForAuto.remoteSync.remoteHead,
      },
    });
  }

  if (plan.autoAcceptedUnitCount === 0) {
    return finalizeOutcome({
      nextCompareResult: resultState(argsForAuto, argsForAuto.initialSnapshot),
    });
  }

  const artifact = await projectCompareRevision({
    snapshot: argsForAuto.initialSnapshot,
    decisions: plan.decisions,
    revision: 0,
    usfmOnionService: args.usfmOnionService,
  });
  const historyToken = args.history.captureHistory();
  const autoAcceptResult = await applyIncomingToStore({
    workingFilesStore: args.workingFilesStore,
    interactionGate: args.interactionGate,
    artifact,
  });
  if (autoAcceptResult.kind !== "committed") return { requiresReview: false };
  args.history.recordHistory(historyToken, {
    label: "Auto Accept Incoming Changes",
    affected: [...plan.touchedChapters],
  });
  args.bumpDirtyVersion();

  const normalizeResult = await runIncomingMutation({
    workingFilesStore: args.workingFilesStore,
    interactionGate: args.interactionGate,
    scope: { kind: "workspace" },
    compute: () =>
      rebuildIncomingSnapshot({ reconciliation: args, input: argsForAuto }),
    commit: (refreshed) => {
      if (
        argsForAuto.remoteSync.relationship ===
          GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY &&
        !hasCompareChanges(refreshed)
      ) {
        const refs = allChapterRefs(args.workingFilesStore.read());
        const cleanDraft = args.workingFilesStore.draftWithChapters(refs);
        applyVersionSnapshotToWorkingFiles({
          workingFiles: cleanDraft,
          sourceFiles: argsForAuto.sourceFiles,
        });
        args.workingFilesStore.commit({
          patch: { kind: "bulk", files: cleanDraft },
          meta: {
            kind: "import",
            action: "incomingReconciliation",
            scope: { project: true },
            dirtyTextContent: true,
          },
        });
      }
    },
  });
  const refreshed = normalizeResult.computed;
  return finalizeOutcome({
    nextCompareResult: resultState(argsForAuto, refreshed),
    behindOnlyFastForward:
      argsForAuto.remoteSync.relationship ===
        GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY &&
      normalizeResult.kind === "committed"
        ? {
            trackedBranch: argsForAuto.remoteSync.trackedBranch,
            remoteHead: argsForAuto.remoteSync.remoteHead,
          }
        : undefined,
  });
}
