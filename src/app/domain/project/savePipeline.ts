// savePipeline.ts
//
// The save lifecycle as a first-class, UI-free orchestration — "save" is a named
// command boundary next to the other domain lifecycles (cloud, incoming
// reconciliation), testable without mounting React.
//
// Ordered phases (delineated by `// Phase:` comments in `runSavePipeline`):
//   check preconditions → capture snapshot → prepare save base → persist books
//   → create version checkpoint → publish after save → rebase persisted clean.
//
// Deterministic ordering is the point — a new post-save concern (e.g. a
// burrito-manifest checksum update) slots in as a phase at the right point, not
// as a fan-out subscriber. The phases are comment-delineated sections rather
// than separate functions because they share three accumulators
// (saveError / persistedBooks / savedVersionHash); splitting them would mean
// threading that state through with no real payoff.
//
// Invariant — "saved to disk" != "versioned": a git checkpoint failure does NOT
// retain dirty or fail the save. The bytes are on disk, the user is warned, and
// the books are marked clean regardless.

import type { SettingsManager } from "@/app/data/settings.ts";
import { resolveGitCommitAuthorForProject } from "@/app/domain/project/gitCommitAuthorResolver.ts";
import {
  type PublishAfterSaveResult,
  publishLinkedProjectAfterSave,
} from "@/app/domain/project/gitRemotePublishCoordinator.ts";
import type { WorkspaceCommandBlockReason } from "@/app/domain/project/remoteSync/commandResults.ts";
import {
  BOOK_PERSISTENCE_ACTION_DELETE_EXISTING,
  BOOK_PERSISTENCE_ACTION_SAVE_EXISTING,
  buildBookPersistencePlan,
  buildBooksSavePayload,
  rebaseChapterToCapturedSave,
} from "@/app/domain/project/saveAndRevertService.ts";
import { withWorkingFilesDraftSync } from "@/app/domain/project/workingFileCommand.ts";
import {
  getDirtyFiles,
  listDirtyChapterRefs,
} from "@/app/domain/project/workingFileMutations.ts";
import type { ScriptureChapterState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { RecoveredConflictTracker } from "@/app/state/RecoveredConflictTracker.ts";
import type { SaveStatusStore } from "@/app/state/SaveStatusStore.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";
import {
  requireGateOpen,
  type WorkspaceGateStore,
} from "@/app/state/WorkspaceInteractionGate.ts";
import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type { GitRemoteProjectStatus } from "@/core/persistence/gitRemoteModels.ts";
import { readGitRemoteProjectStatus } from "@/core/persistence/gitRemoteStore.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

/**
 * Post-disk substates the caller renders. The pipeline is UI-free: instead of
 * firing toasts mid-flow, it reports what happened so `useSaveAndRevert` (the UI
 * boundary) renders the success toast + the checkpoint/publish warnings. "saved
 * to disk" is independent of "versioned" (checkpoint) and "published" — each can
 * succeed or fail on its own, which is exactly why they are distinct substates.
 */
export type SaveCheckpointOutcome =
  | { kind: "created"; hash: string }
  | { kind: "failed" };
export type SavePublishOutcome =
  | PublishAfterSaveResult
  | { kind: "failed" }
  | { kind: "skipped" }; // no checkpoint was created → nothing to publish

/**
 * Outcome of a save attempt.
 *
 * `blocked` is returned WITHOUT touching disk when a command precondition fails;
 * its `reason` distinguishes a closed gate (save already in flight) from
 * unreviewed recovered conflicts the caller did not attest. `failed` is a
 * pre-write failure (base restore / remote-base prep threw) where NOTHING
 * persisted — distinct from `partial`, which carries the books that did persist
 * before a mid-loop write failure.
 */
export type SaveResult =
  | {
      kind: "saved";
      persistedBookCodes: string[];
      // null when there was nothing to save (no checkpoint attempted).
      checkpoint: SaveCheckpointOutcome | null;
      publish: SavePublishOutcome | null;
    }
  | { kind: "partial"; persistedBookCodes: string[]; error: unknown }
  | { kind: "failed"; error: unknown }
  | { kind: "blocked"; reason: WorkspaceCommandBlockReason };

/** The workspace nouns + sinks the save pipeline orchestrates. */
export type SavePipelineDeps = {
  workingFilesStore: WorkingFilesStore;
  workspaceBaselineStore: WorkspaceBaselineStore;
  recoveredConflictTracker: RecoveredConflictTracker;
  interactionGate: WorkspaceGateStore;
  saveStatusStore: SaveStatusStore;
  loadedProject: Project;
  gitProvider: GitProvider;
  settingsManager: SettingsManager;
  authSessionProvider: AuthSessionProvider;
  fileSystem: FileSystem;
  storageRoots: StorageRoots;
  isViewingOlderVersion: boolean;
  selectedVersionHash: string | null;
  refreshVersions: () => Promise<void>;
  onSavedVersion: (hash: string) => void;
  bumpDirtyVersion: () => void;
  onGitRemoteStatusChanged?: (status: GitRemoteProjectStatus | null) => void;
  prepareRemoteBaseForSave?: () => Promise<void>;
};

export type SaveOptions = {
  prepareRemoteBaseForSave?: () => Promise<void>;
  /** Book codes the caller explicitly chose to remove from the project. */
  deletedBookCodes?: readonly string[];
  /** Existing books whose chapter membership changed even if remaining chapters are clean. */
  structurallyChangedBookCodes?: readonly string[];
  /**
   * Attestation that the user reviewed (or reverted) their recovered
   * conflicts. Issued ONLY from the local-unsaved-review modal path. When
   * the tracker is non-empty and this is not `true`, the save is refused
   * at the command boundary with `{ kind: "blocked", reason:
   * "recovered-review-required" }`.
   */
  reviewedRecoveredWork?: boolean;
};

/**
 * Save phase 0 — command preconditions, evaluated before any disk I/O.
 *
 * - Gate closed → a save is already in flight (or a recovery decision is
 *   pending); a second Cmd+S must not persist over it.
 * - Unreviewed recovered conflicts without attestation → forced-review floor;
 *   UX (modal routing) layers above this, this is the enforcement floor.
 *
 * Returns the blocking reason, or `null` when the save may proceed.
 */
function checkSavePreconditions(
  args: SavePipelineDeps,
  options?: SaveOptions,
): WorkspaceCommandBlockReason | null {
  if (!requireGateOpen(args.interactionGate.get())) return "gate-closed";
  if (
    !args.recoveredConflictTracker.isEmpty() &&
    options?.reviewedRecoveredWork !== true
  ) {
    return "recovered-review-required";
  }
  return null;
}

/**
 * Run the save lifecycle. See the file header for the phase order + invariants.
 */
export async function runSavePipeline(
  args: SavePipelineDeps,
  options?: SaveOptions,
): Promise<SaveResult> {
  // Phase: check preconditions. Refuse before any disk I/O and report
  // *which* precondition failed so a "save did nothing" report is diagnosable.
  const blockReason = checkSavePreconditions(args, options);
  if (blockReason) return { kind: "blocked", reason: blockReason };

  // Block other workspace mutation while the save snapshot is in flight.
  args.interactionGate.set({ kind: "saving" });
  try {
    args.saveStatusStore.setSaving();
    const currentFiles = args.workingFilesStore.read();
    // Two shapes off that one snapshot, for two different consumers:
    // `dirtyChapterRefs` is a flat "BOOK chapter" list that rides along as the
    // version checkpoint's changed-chapters metadata; `filesToSave` is the dirty
    // book objects we serialize to disk. `toSave` then shapes those into the
    // per-book payload. Same source state, different downstream needs.
    const dirtyChapterRefs = listDirtyChapterRefs(currentFiles).map(
      ({ bookCode, chapterNum }) => `${bookCode} ${chapterNum}`,
    );
    const pendingStructural = args.workingFilesStore.pendingStructuralChanges();
    const deletedBookCodes = [
      ...new Set([
        ...pendingStructural.deletedBookCodes,
        ...(options?.deletedBookCodes ?? []),
      ]),
    ];
    const structurallyChangedBookCodes = new Set(
      [
        ...pendingStructural.structurallyChangedBookCodes,
        ...(options?.structurallyChangedBookCodes ?? []),
      ].filter((bookCode) => !deletedBookCodes.includes(bookCode)),
    );
    for (const bookCode of structurallyChangedBookCodes) {
      if (!currentFiles.some((file) => file.bookCode === bookCode)) {
        throw new Error(
          `Cannot persist structurally changed missing book ${bookCode}`,
        );
      }
    }
    const changedScopes = [
      ...new Set([
        ...dirtyChapterRefs,
        ...deletedBookCodes.map((bookCode) => `${bookCode} *`),
        ...[...structurallyChangedBookCodes].map((bookCode) => `${bookCode} *`),
      ]),
    ];
    const dirtyFiles = getDirtyFiles(currentFiles);
    const filesToSave = currentFiles.filter(
      (file) =>
        structurallyChangedBookCodes.has(file.bookCode) ||
        dirtyFiles.includes(file),
    );
    const toSave = buildBooksSavePayload(
      filesToSave,
      structurallyChangedBookCodes,
    );
    const persistencePlan = buildBookPersistencePlan({
      existingBooks: args.loadedProject.books,
      payload: toSave,
      deletedBookCodes,
    });

    // Freeze per-chapter tokens at the SAME synchronous instant the save
    // payload is built (no await in between). The persisted bytes derive
    // from these tokens; rebasing the saved baseline to this capture (not
    // to live `currentTokens`) is what keeps the in-memory "saved" state
    // honest if anything mutates a chapter while the save awaits below.
    const capturedTokensByChapter = new Map<
      string,
      { tokens: ScriptureChapterState["currentTokens"] }
    >();
    for (const file of filesToSave) {
      for (const chapter of file.chapters) {
        capturedTokensByChapter.set(
          `${file.bookCode}:${chapter.chapterNumber}`,
          {
            tokens: structuredClone(chapter.currentTokens),
          },
        );
      }
    }

    let savedVersionHash: string | null = null;
    // Post-disk substates reported back to the caller (which renders the
    // toasts). Null until the save-with-books path attempts a checkpoint.
    let checkpoint: SaveCheckpointOutcome | null = null;
    let publish: SavePublishOutcome | null = null;

    // Phase: prepare the save base (restore older version / advance the
    // remote base for reconciliation). These run BEFORE any book write.
    // Guarded so a throw here doesn't strand the status store in `saving`:
    // nothing is on disk yet, so fail loud with status + a typed result.
    try {
      if (args.isViewingOlderVersion && args.selectedVersionHash) {
        await args.gitProvider.restoreTrackedFilesFromCommit(
          args.loadedProject.projectPath,
          args.selectedVersionHash,
        );
      }

      // Optional pre-write step, supplied only by the sync-now flow when it
      // auto-accepted DISJOINT remote work and handed back a "reconciliation
      // save" (see useRemoteSync's "auto-accept-incoming"): before writing, move
      // the local git base onto the remote head so this save's checkpoint
      // continues remote history instead of forking it again. It's injected
      // rather than called directly so this pipeline stays unaware of
      // reconciliation policy — normal saves pass nothing and skip it.
      const prepareRemoteBaseForSave =
        options?.prepareRemoteBaseForSave ?? args.prepareRemoteBaseForSave;
      if (prepareRemoteBaseForSave) {
        await prepareRemoteBaseForSave();
      }
    } catch (prepareError) {
      console.error(
        "Save aborted: preparing the save base failed before any write.",
        prepareError,
      );
      args.saveStatusStore.setFailed(prepareError);
      return { kind: "failed", error: prepareError };
    }

    // Phase: persist books. Per-book persistence honesty: track which books
    // actually landed on disk (stop-on-first-failure preserved). MD5 is
    // precomputed BEFORE the write so a hashing failure aborts without
    // leaving the baseline claiming bytes that were never written; the
    // baseline is only advanced after the write succeeds.
    let saveError: unknown = null;
    const persistedBooks = new Set<string>();
    for (const action of persistencePlan) {
      let preComputedMd5: string | null = null;
      if (action.kind !== BOOK_PERSISTENCE_ACTION_DELETE_EXISTING) {
        try {
          preComputedMd5 = await args.workspaceBaselineStore.computeMd5(
            action.contents,
          );
        } catch (md5Error) {
          saveError = md5Error;
          break;
        }
      }
      try {
        if (action.kind === BOOK_PERSISTENCE_ACTION_SAVE_EXISTING) {
          await args.loadedProject.saveBook(action.storageKey, action.contents);
        } else if (action.kind === BOOK_PERSISTENCE_ACTION_DELETE_EXISTING) {
          await args.loadedProject.removeBook(action.storageKey);
        } else {
          await args.loadedProject.addBook(action.bookCode, {
            contents: action.contents,
          });
        }
      } catch (writeError) {
        saveError = writeError;
        break;
      }
      persistedBooks.add(action.bookCode);
      if (action.kind === BOOK_PERSISTENCE_ACTION_DELETE_EXISTING) {
        args.workspaceBaselineStore.setAbsent(action.bookCode);
      } else {
        args.workspaceBaselineStore.setPresent(
          action.bookCode,
          preComputedMd5 as string,
        );
      }
    }

    if (saveError) {
      console.error(saveError);
      args.saveStatusStore.setFailed(saveError);
    } else if (persistencePlan.length > 0) {
      // Books are on disk. The caller renders the success toast from
      // `persistedBookCodes`.
      // Phase: create version checkpoint. Failure is a WARNING, not a save
      // failure — bytes are already on disk (saved != versioned). It's
      // surfaced as `checkpoint: { kind: "failed" }` for the caller.
      try {
        const commitAuthor = await resolveGitCommitAuthorForProject({
          projectPath: args.loadedProject.projectPath,
          fileSystem: args.fileSystem,
          storageRoots: args.storageRoots,
          authSessionProvider: args.authSessionProvider,
        });
        const committed = await args.gitProvider.commitAll(
          args.loadedProject.projectPath,
          {
            op: "save",
            timestampIso: new Date().toISOString(),
            changedChapters: changedScopes,
          },
          commitAuthor,
        );
        savedVersionHash = committed.hash;
        checkpoint = { kind: "created", hash: committed.hash };
      } catch (commitErr) {
        console.error("Version checkpoint creation failed:", commitErr);
        checkpoint = { kind: "failed" };
      }
      // Phase: publish after save (only if a checkpoint was created).
      // Reported as `publish` substate; a failure is a WARNING the caller
      // renders. No checkpoint ⇒ `skipped` (set below).
      if (savedVersionHash) {
        try {
          publish = await publishLinkedProjectAfterSave({
            projectPath: args.loadedProject.projectPath,
            localHead: savedVersionHash,
            fileSystem: args.fileSystem,
            storageRoots: args.storageRoots,
            settingsManager: args.settingsManager,
            authSessionProvider: args.authSessionProvider,
            gitProvider: args.gitProvider,
          });
        } catch (publishErr) {
          console.error("Remote publish after save failed:", publishErr);
          publish = { kind: "failed" };
        } finally {
          args.onGitRemoteStatusChanged?.(
            await readGitRemoteProjectStatus({
              fileSystem: args.fileSystem,
              storageRoots: args.storageRoots,
              projectPath: args.loadedProject.projectPath,
            }),
          );
        }
      } else {
        // No checkpoint (it failed) → there is nothing to publish.
        publish = { kind: "skipped" };
      }
      await args.refreshVersions();
      if (savedVersionHash) {
        args.onSavedVersion(savedVersionHash);
      }
    }
    // Phase: rebase persisted books clean. The bytes are on disk, but in memory
    // each chapter still reads as dirty against its old baseline. So for every
    // book that actually persisted, advance its baseline to what we just wrote —
    // to the tokens CAPTURED up front, not live `currentTokens` (a keystroke
    // during the save's awaits must stay dirty, not get silently swallowed) —
    // which flips `dirty` back to false. Books that failed to persist keep their
    // dirty state. The recovered-conflict tracker isn't touched here; its
    // subscriber watches these chapters go clean and clears them.
    // Check out and rebase only the chapters we captured tokens for (the
    // persisted ones); the measured scope is exactly those chapters, not the
    // whole project.
    withWorkingFilesDraftSync({
      workingFilesStore: args.workingFilesStore,
      commitMeta: {
        kind: "metadataOnly",
        action: "saveCleanMark",
        dirtyTextContent: false,
      },
      mutate: (draft) => {
        for (const file of args.workingFilesStore.read()) {
          if (!persistedBooks.has(file.bookCode)) continue;
          for (const { chapterNumber } of file.chapters) {
            const captured = capturedTokensByChapter.get(
              `${file.bookCode}:${chapterNumber}`,
            );
            if (!captured) continue;
            const chapter = draft.chapterForWrite({
              bookCode: file.bookCode,
              chapterNum: chapterNumber,
            });
            if (!chapter) continue;
            Object.assign(
              chapter,
              rebaseChapterToCapturedSave(chapter, captured),
            );
          }
        }
      },
    });
    const resolvedDeletedBookCodes = deletedBookCodes.filter((bookCode) =>
      persistedBooks.has(bookCode),
    );
    const resolvedStructurallyChangedBookCodes = [
      ...structurallyChangedBookCodes,
    ].filter((bookCode) => persistedBooks.has(bookCode));
    if (
      resolvedDeletedBookCodes.length > 0 ||
      resolvedStructurallyChangedBookCodes.length > 0
    ) {
      // Deletion-only saves have no surviving chapter to rebase, so resolve
      // their durable intent with an explicit metadata commit. Failed book
      // actions are deliberately absent and remain retryable.
      args.workingFilesStore.commit({
        patch: { kind: "bulk", files: args.workingFilesStore.read() },
        meta: {
          kind: "metadataOnly",
          action: "saveCleanMark",
          scope: { project: true },
          dirtyTextContent: false,
          resolvedStructuralChanges: {
            deletedBookCodes: resolvedDeletedBookCodes,
            structurallyChangedBookCodes: resolvedStructurallyChangedBookCodes,
          },
        },
      });
    }
    args.bumpDirtyVersion();
    if (!saveError) {
      args.saveStatusStore.setSaved();
    }

    return saveError
      ? {
          kind: "partial",
          persistedBookCodes: [...persistedBooks],
          error: saveError,
        }
      : {
          kind: "saved",
          persistedBookCodes: [...persistedBooks],
          checkpoint,
          publish,
        };
  } finally {
    args.interactionGate.set({ kind: "open" });
  }
}
