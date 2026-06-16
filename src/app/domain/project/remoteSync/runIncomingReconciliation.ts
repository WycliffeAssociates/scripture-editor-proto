// runIncomingReconciliation.ts
//
// The incoming-source reconciliation EXECUTOR. Reconciliation policy lives next
// to the cloud lifecycle (not inside a modal hook) and can be exercised without
// mounting React.
//
// It owns the auto-accept decision + mutation orchestration for a freshly loaded
// remote-latest source: the diverged-disjoint fast path, the behind-only
// whole-workspace snapshot apply, the dirty-semantic-SID safe-hunk split, and
// the manual-review fallback. Every store write goes through the SAME validated
// boundary the rest of the codebase uses (`applyIncomingToStore` /
// `runIncomingMutation` / the gate-checked `commitIncoming`), so the
// lost-update / stale-workspace / gate-recheck invariants hold.
//
// The executor owns every STORE mutation inline but does NOT touch React state
// or perform the git fast-forward directly: it returns a single
// `IncomingReconciliationOutcome` and the hook applies it once
// (`setCompareResult` + `acceptRemoteLatestReview`). That "command returns next
// state, hook applies once" split is what makes the never-accept-while-review
// invariant structural (see `finalizeOutcome`) rather than a per-branch guard.
// The gate/ref helpers shared with the hook's other actions are passed as
// `deps`; everything the body reads off the workspace nouns is on `deps.args`.

import type { LexicalEditor } from "lexical";

import type { EditorModeSetting } from "@/app/data/editor.ts";
import {
  applyIncomingToStore,
  runIncomingMutation,
} from "@/app/domain/project/compare/applyIncomingToStore.ts";
import {
  buildCompareResultAsync,
  type CompareMetadataSummary,
} from "@/app/domain/project/compare/compareService.ts";
import type { CompareWarning } from "@/app/domain/project/compare/types.ts";
import type { DiffsByChapter } from "@/app/domain/project/diffTypes.ts";
import {
  buildAutoAcceptIncomingPlan,
  buildBookTextByCodeFromScriptureFiles,
  buildBookTextByCodeFromSnapshot,
  buildChapterKey,
  collectChangedBookCodes,
  type DirtySemanticSidMap,
  hasDiffsByChapter,
  listChangedChapterRefs,
  splitRemoteDiffsByDirtySemanticSid,
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

/** The compare-result state the reconciliation publishes back to the hook. */
export type CompareResultState = {
  diffsByChapter: DiffsByChapter;
  warnings: CompareWarning[];
  metadata?: CompareMetadataSummary;
  cleanup?: () => Promise<void>;
  sourceFiles?: ScriptureBookState[];
  remoteSync?: {
    remoteHead: string;
    localHead: string | null;
    mergeBase: string | null;
    trackedBranch: string;
    relationship: GitRemoteRelationshipKind;
  };
};

/** The subset of the workspace nouns the reconciliation reads. */
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

/**
 * A behind-only fast-forward handoff: the local head MAY be advanced to
 * `remoteHead`. The hook performs the git accept (`acceptRemoteLatestReview`)
 * + status update. INVARIANT (enforced by `finalizeOutcome`): only ever present
 * when no review state remains — partial behind-only acceptance keeps
 * `remoteSync` attached and adopts remote latest on the NEXT save instead.
 */
type RemoteFastForward = { trackedBranch: string; remoteHead: string };

export type IncomingReconciliationInput = {
  sourceFiles: ScriptureBookState[];
  metadata: CompareMetadataSummary;
  cleanup?: () => Promise<void>;
  initialWarnings: CompareWarning[];
  remoteSync: {
    remoteHead: string;
    localHead: string | null;
    mergeBase: string | null;
    trackedBranch: string;
    relationship: GitRemoteRelationshipKind;
  };
  initialDiffsByChapter: DiffsByChapter;
};

/**
 * The single outcome the executor returns. The hook applies it once:
 * `setCompareResult(nextCompareResult)` (if present), then performs
 * `remoteAccept` (if present). The executor owns every STORE mutation inline and
 * does not touch React state or git-accept directly — that "command returns next
 * state, hook applies once" split is what makes the never-accept-while-review
 * invariant structural rather than a per-branch guard.
 *
 * `nextCompareResult` is omitted on the early-bail paths (gate blocked / stale)
 * so the hook leaves the existing compare state untouched.
 */
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

/**
 * Construct the outcome so the safety invariant holds BY CONSTRUCTION:
 *
 *  - `requiresReview` is derived from the next diffs unless explicitly
 *    overridden (the diverged-disjoint handoff forces it false: the
 *    reconciliation-save flow, not the review modal, resolves it).
 *  - `remoteAccept` (behind-only fast-forward) is DROPPED whenever review
 *    remains. You cannot mark remote accepted while the user still has diffs to
 *    review — partial acceptance leaves `remoteSync` attached so the next save
 *    adopts remote latest.
 *  - `remoteSync` is cleared on the next compare result IFF we fast-forwarded
 *    (nothing pending); otherwise it stays attached.
 */
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
    hasDiffsByChapter(args.nextCompareResult.diffsByChapter);
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

/**
 * Build the per-chapter dirty-semantic-SID map for the workspace's dirty
 * chapters — the input to `splitRemoteDiffsByDirtySemanticSid`. Awaits the USFM
 * diff engine on a private token scope (no store draft held), so it is safe to
 * call before the synchronous commit phase.
 */
async function buildDirtySemanticSidsByChapter(
  args: Pick<
    IncomingReconciliationArgs,
    "workingFilesStore" | "usfmOnionService"
  >,
  chapterRefs: ChapterRef[],
): Promise<DirtySemanticSidMap> {
  const dirtyScope: {
    bookCode: string;
    chapterNum: number;
    baselineTokens: ScriptureChapterState["sourceTokens"];
    currentTokens: ScriptureChapterState["currentTokens"];
  }[] = [];
  for (const { bookCode, chapterNum } of chapterRefs) {
    const currentChapter = args.workingFilesStore
      .read()
      .find((file) => file.bookCode === bookCode)
      ?.chapters.find((chapter) => chapter.chapterNumber === chapterNum);
    if (!currentChapter?.dirty) continue;
    dirtyScope.push({
      bookCode,
      chapterNum,
      baselineTokens: currentChapter.sourceTokens,
      currentTokens: currentChapter.currentTokens,
    });
  }

  if (!dirtyScope.length) {
    return new Map();
  }

  const diffsByScope = await args.usfmOnionService.diffScope(
    dirtyScope.map((entry) => ({
      baselineTokens: entry.baselineTokens,
      currentTokens: entry.currentTokens,
    })),
  );

  const dirtySemanticSidsByChapter = new Map<string, Set<string>>();
  for (const [index, scopeEntry] of dirtyScope.entries()) {
    const dirtySemanticSids = new Set<string>();
    for (const diff of diffsByScope[index] ?? []) {
      if (diff.status !== "unchanged") {
        dirtySemanticSids.add(diff.semanticSid);
      }
    }
    if (!dirtySemanticSids.size) continue;
    dirtySemanticSidsByChapter.set(
      buildChapterKey(scopeEntry.bookCode, scopeEntry.chapterNum),
      dirtySemanticSids,
    );
  }

  return dirtySemanticSidsByChapter;
}

/**
 * Reconcile a freshly loaded remote-latest source into the workspace under the
 * auto-accept policy. See the file header for the contract. Returns whether the
 * caller must still open the review modal (and, for diverged-disjoint, the
 * reconciliation-save handoff).
 */
export async function runIncomingReconciliation(
  deps: IncomingReconciliationDeps,
  argsForAuto: IncomingReconciliationInput,
): Promise<IncomingReconciliationOutcome> {
  const { args, commitIncoming, incomingFlowsBlocked, listCompareChapterRefs } =
    deps;

  // Mutation-boundary recheck: the source load that precedes this call
  // awaits the network, and a save can flip the gate to `saving` in that
  // window. The entry checks on the public actions only guard at action
  // start, so recheck here before the auto-accept mutation phase begins.
  // (`commitIncoming` below is the deeper net for the internal awaits.)
  if (incomingFlowsBlocked()) {
    return { requiresReview: false };
  }

  async function maybeAutoAcceptDivergedDisjoint() {
    if (
      argsForAuto.remoteSync.relationship !== GIT_REMOTE_RELATIONSHIP_DIVERGED
    ) {
      return null;
    }
    if (
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

    const localChangedBooks = collectChangedBookCodes({
      baseByBook,
      targetByBook: localByBook,
    });
    const remoteChangedBooks = collectChangedBookCodes({
      baseByBook,
      targetByBook: remoteByBook,
    });
    const dirtyWorkspaceBooks = collectChangedBookCodes({
      baseByBook: localByBook,
      targetByBook: workingByBook,
    });
    const locallyProtectedBooks = new Set([
      ...Array.from(localChangedBooks),
      ...Array.from(dirtyWorkspaceBooks),
    ]);

    if (remoteChangedBooks.size === 0) {
      return null;
    }

    const hasOverlap = Array.from(locallyProtectedBooks).some((bookCode) =>
      remoteChangedBooks.has(bookCode),
    );
    if (hasOverlap) {
      return null;
    }

    // Apply the incoming snapshot to every book EXCEPT the locally-protected
    // ones. Protected books are never overwritten, so they keep their local
    // content and baseline for free — no pre-image capture or splice-back. We
    // still check them out (to flip dirty) so the local edits read dirty
    // against the project baseline the reconciliation advances to.
    const allRefs = args.workingFilesStore.read().flatMap((file) =>
      file.chapters.map((chapter) => ({
        bookCode: file.bookCode,
        chapterNum: chapter.chapterNumber,
      })),
    );
    const workingDraft = args.workingFilesStore.draftWithChapters(allRefs);
    applyVersionSnapshotToWorkingFiles({
      workingFiles: workingDraft,
      sourceFiles: argsForAuto.sourceFiles,
      excludeBookCodes: locallyProtectedBooks,
    });
    const locallyProtectedChapters: ChapterRef[] = [];
    for (const file of workingDraft) {
      if (!locallyProtectedBooks.has(file.bookCode)) continue;
      for (const chapter of file.chapters) {
        chapter.dirty = true;
        locallyProtectedChapters.push({
          bookCode: file.bookCode,
          chapterNum: chapter.chapterNumber,
        });
      }
    }
    // Gate closed mid-flight → don't apply; fall through to manual review.
    if (
      !commitIncoming({
        patch: { kind: "bulk", files: workingDraft },
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

    const refreshed = await buildCompareResultAsync({
      currentFiles: args.workingFilesStore.read(),
      usfmOnionService: args.usfmOnionService,
      sourceFiles: argsForAuto.sourceFiles,
      currentMetadata: buildCurrentProjectCompareMetadata(args.loadedProject),
      sourceMetadata: argsForAuto.metadata,
      batchSize: DIFF_CHUNK_SIZE,
      onBatchComplete: yieldToMainThread,
    });
    const changedChapters = listChangedChapterRefs(refreshed.diffsByChapter);

    const touchedChapterMap = new Map<string, ChapterRef>();
    for (const chapterRef of [
      ...changedChapters,
      ...locallyProtectedChapters,
    ]) {
      touchedChapterMap.set(
        buildChapterKey(chapterRef.bookCode, chapterRef.chapterNum),
        chapterRef,
      );
    }
    args.bumpDirtyVersion();

    // Diverged-disjoint: applied non-overlapping remote books, preserved
    // local. The reconciliation-SAVE flow (not the review modal) resolves
    // this, so requiresReview is forced false and remoteSync stays attached.
    return finalizeOutcome({
      nextCompareResult: {
        diffsByChapter: refreshed.diffsByChapter,
        warnings: refreshed.warnings,
        metadata: argsForAuto.metadata,
        cleanup: argsForAuto.cleanup,
        sourceFiles: argsForAuto.sourceFiles,
        remoteSync: argsForAuto.remoteSync,
      },
      requiresReviewOverride: false,
      requiresReconciliationSave: {
        trackedBranch: argsForAuto.remoteSync.trackedBranch,
        remoteHead: argsForAuto.remoteSync.remoteHead,
        relationship: argsForAuto.remoteSync.relationship,
      },
    });
  }

  const divergedDisjointAutoAccept = await maybeAutoAcceptDivergedDisjoint();
  if (divergedDisjointAutoAccept) {
    return divergedDisjointAutoAccept;
  }

  if (
    argsForAuto.remoteSync.relationship === GIT_REMOTE_RELATIONSHIP_DIVERGED
  ) {
    // Diverged (non-disjoint): never fast-forward inline — the review modal
    // resolves it. remoteSync stays attached; requiresReview tracks the diffs.
    return finalizeOutcome({
      nextCompareResult: {
        diffsByChapter: argsForAuto.initialDiffsByChapter,
        warnings: argsForAuto.initialWarnings,
        metadata: argsForAuto.metadata,
        cleanup: argsForAuto.cleanup,
        sourceFiles: argsForAuto.sourceFiles,
        remoteSync: argsForAuto.remoteSync,
      },
    });
  }

  // Capture WORKSPACE state identity BEFORE the dirty-sid await: the
  // behind-only branch below applies a whole-workspace version snapshot
  // (touches every chapter, incl. any created during the await), so its
  // validation scope must be the workspace, not a fixed ref set. The
  // store's structural sharing replaces the read() array on any
  // state-changing commit; selectionOnly preserves it. Same contract as
  // runIncomingMutation's `workspace` scope, but the governing await is
  // here, upstream of the branch.
  const preReconcileState = args.workingFilesStore.read();
  const dirtySemanticSidsByChapter = await buildDirtySemanticSidsByChapter(
    args,
    listCompareChapterRefs(),
  );
  const { blockedDiffsByChapter, autoAcceptedDiffs } =
    splitRemoteDiffsByDirtySemanticSid({
      diffsByChapter: argsForAuto.initialDiffsByChapter,
      dirtySemanticSidsByChapter,
    });
  const { fullChapterApplies, hunkApplies } = buildAutoAcceptIncomingPlan({
    initialDiffsByChapter: argsForAuto.initialDiffsByChapter,
    blockedDiffsByChapter,
  });

  if (
    argsForAuto.remoteSync.relationship ===
      GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY &&
    !hasDiffsByChapter(blockedDiffsByChapter)
  ) {
    // Any state-changing commit during the dirty-sid await (a content
    // edit OR a newly added chapter/book) or a closed gate → abort
    // before the workspace snapshot apply + accept; don't clobber that
    // work or mark synced. Validation + draft + apply + commit are
    // synchronous from here, so no further await can sneak in.
    if (
      args.workingFilesStore.read() !== preReconcileState ||
      !requireGateOpen(args.interactionGate.get())
    ) {
      return { requiresReview: false };
    }
    // Discovery flow: applyVersionSnapshotToWorkingFiles walks every
    // chapter of every book. Draft every existing chapter writable.
    const behindRefs = allChapterRefs(args.workingFilesStore.read());
    const behindDraft = args.workingFilesStore.draftWithChapters(behindRefs);
    applyVersionSnapshotToWorkingFiles({
      workingFiles: behindDraft,
      sourceFiles: argsForAuto.sourceFiles,
    });
    args.workingFilesStore.commit({
      patch: { kind: "bulk", files: behindDraft },
      meta: {
        kind: "import",
        action: "incomingReconciliation",
        scope: { project: true },
        dirtyTextContent: true,
      },
    });
    args.bumpDirtyVersion();
    // Behind-only with a fully clean apply (no blocked diffs): the whole-
    // workspace snapshot landed, so there is nothing left to review. Hand
    // the fast-forward to the hook; finalizeOutcome clears remoteSync since
    // there is nothing pending — consistent with the other behind-only accept
    // paths.
    return finalizeOutcome({
      nextCompareResult: {
        diffsByChapter: {},
        warnings: [],
        metadata: argsForAuto.metadata,
        cleanup: argsForAuto.cleanup,
        sourceFiles: argsForAuto.sourceFiles,
        remoteSync: argsForAuto.remoteSync,
      },
      behindOnlyFastForward: {
        trackedBranch: argsForAuto.remoteSync.trackedBranch,
        remoteHead: argsForAuto.remoteSync.remoteHead,
      },
    });
  }

  if (!autoAcceptedDiffs.length) {
    // Nothing auto-applied. For behind-only we OFFER a fast-forward, but
    // finalizeOutcome drops it whenever blockedDiffsByChapter is non-empty:
    // a behind-only with blocked (dirty-overlapping) diffs still requires
    // review, so we must NOT mark remote accepted and must KEEP remoteSync
    // attached — the next save adopts remote latest.
    return finalizeOutcome({
      nextCompareResult: {
        diffsByChapter: blockedDiffsByChapter,
        warnings: argsForAuto.initialWarnings,
        metadata: argsForAuto.metadata,
        cleanup: argsForAuto.cleanup,
        sourceFiles: argsForAuto.sourceFiles,
        remoteSync: argsForAuto.remoteSync,
      },
      behindOnlyFastForward:
        argsForAuto.remoteSync.relationship ===
        GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY
          ? {
              trackedBranch: argsForAuto.remoteSync.trackedBranch,
              remoteHead: argsForAuto.remoteSync.remoteHead,
            }
          : undefined,
    });
  }

  const touchedChapterKeys = new Set([
    ...fullChapterApplies.map((chapter) =>
      buildChapterKey(chapter.bookCode, chapter.chapterNum),
    ),
    ...hunkApplies.map((diff) =>
      buildChapterKey(diff.bookCode, diff.chapterNum),
    ),
  ]);
  const touchedChapters: ChapterRef[] = [];
  for (const key of touchedChapterKeys) {
    const [bookCode, chapterPart] = key.split(":");
    const chapterNum = Number(chapterPart);
    if (bookCode && !Number.isNaN(chapterNum)) {
      touchedChapters.push({ bookCode, chapterNum });
    }
  }

  // Scratch-apply then synchronous overlay-from-latest commit: no commit
  // landing during the hunk awaits can be clobbered, and the gate is rechecked
  // at the synchronous commit boundary.
  const historyToken = args.history.captureHistory();
  const autoAcceptResult = await applyIncomingToStore({
    workingFilesStore: args.workingFilesStore,
    interactionGate: args.interactionGate,
    usfmOnionService: args.usfmOnionService,
    fullChapterApplies,
    hunkApplies,
    sourceFiles: argsForAuto.sourceFiles,
  });

  // Gate closed during the apply awaits → nothing committed; bail before
  // the remote-accept side effect so we don't mark synced without applying.
  if (autoAcceptResult.kind !== "committed") {
    return { requiresReview: false };
  }
  args.history.recordHistory(historyToken, {
    label: "Auto Accept Incoming Changes",
    affected: touchedChapters,
  });

  args.bumpDirtyVersion();

  // Post-apply refreshed diff + behind-only clean normalization, through
  // the validated boundary: a user edit during the refreshed-diff await
  // must not be reverted by the snapshot apply, and remote-accept must not
  // proceed on a stale decision. The snapshot write happens only inside
  // `commit` (after identity validation); accept runs only if it committed.
  const normalizeResult = await runIncomingMutation({
    workingFilesStore: args.workingFilesStore,
    interactionGate: args.interactionGate,
    // Whole-workspace snapshot replacement → workspace scope (catches
    // chapters created during the refreshed-diff await, not just a
    // fixed ref set).
    scope: { kind: "workspace" },
    compute: () =>
      buildCompareResultAsync({
        currentFiles: args.workingFilesStore.read(),
        usfmOnionService: args.usfmOnionService,
        sourceFiles: argsForAuto.sourceFiles,
        currentMetadata: buildCurrentProjectCompareMetadata(args.loadedProject),
        sourceMetadata: argsForAuto.metadata,
        batchSize: DIFF_CHUNK_SIZE,
        onBatchComplete: yieldToMainThread,
      }),
    commit: (refreshedResult, latest) => {
      if (
        argsForAuto.remoteSync.relationship ===
          GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY &&
        !hasDiffsByChapter(refreshedResult.diffsByChapter)
      ) {
        const cleanRefs = latest.flatMap((file) =>
          file.chapters.map((chapter) => ({
            bookCode: file.bookCode,
            chapterNum: chapter.chapterNumber,
          })),
        );
        const cleanDraft = args.workingFilesStore.draftWithChapters(cleanRefs);
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
  const normalized = normalizeResult.kind === "committed";

  // Offer the fast-forward only if the normalize mutation actually committed
  // (not stale/gate-aborted). finalizeOutcome then drops it unless the
  // refreshed diff is empty — i.e. only when the clean-snapshot normalization
  // above truly emptied the review state. `normalized` is true even when the
  // commit callback was a no-op (refreshed diffs remained), so gating accept on
  // `normalized` alone would wrongly mark remote accepted while review remains.
  return finalizeOutcome({
    nextCompareResult: {
      diffsByChapter: refreshed.diffsByChapter,
      warnings: refreshed.warnings,
      metadata: argsForAuto.metadata,
      cleanup: argsForAuto.cleanup,
      sourceFiles: argsForAuto.sourceFiles,
      remoteSync: argsForAuto.remoteSync,
    },
    behindOnlyFastForward:
      argsForAuto.remoteSync.relationship ===
        GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY && normalized
        ? {
            trackedBranch: argsForAuto.remoteSync.trackedBranch,
            remoteHead: argsForAuto.remoteSync.remoteHead,
          }
        : undefined,
  });
}
