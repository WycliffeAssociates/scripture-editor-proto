import type { LexicalEditor } from "lexical";
import { useSyncExternalStore } from "react";

import { type EditorModeSetting, shapeForSurface } from "@/app/data/editor.ts";
import type { SettingsManager } from "@/app/data/settings.ts";
import type {
  DiffsByChapter,
  ProjectDiff,
} from "@/app/domain/project/diffTypes.ts";
import {
  revertChapterDiffByBlockId,
  revertChapterToLoadedState,
} from "@/app/domain/project/saveAndRevertService.ts";
import {
  runSavePipeline,
  type SaveOptions,
  type SaveResult,
} from "@/app/domain/project/savePipeline.ts";
import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { RecoveredConflictTracker } from "@/app/state/RecoveredConflictTracker.ts";
import type { SaveStatusStore } from "@/app/state/SaveStatusStore.ts";
import {
  findChapterInDraft,
  type WorkingFilesStore,
} from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";
import {
  requireGateOpen,
  type WorkspaceGateStore,
} from "@/app/state/WorkspaceInteractionGate.ts";
import {
  showErrorNotification,
  showNotificationSuccess,
} from "@/app/ui/components/primitives/notifications.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type { GitRemoteProjectStatus } from "@/core/persistence/gitRemoteModels.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

import type { ChapterRef } from "./shared.ts";

// `SaveResult` is re-exported so existing importers of this hook keep working
// while the orchestration lives in the domain layer.
export type { SaveResult };

/**
 * Save/revert hook for the editable scripture workspace.
 *
 * This is the hook that crosses from in-memory scripture state back to managed
 * disk through the loaded project noun, then optionally records a git checkpoint
 * and keeps the diff/history UI aligned with the new saved state.
 */
// TODO: heavy dependency surface — consider splitting save and revert into
// separate hooks sharing a smaller deps object.
export function useSaveAndRevert(args: {
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
  gitProvider: GitProvider;
  settingsManager: SettingsManager;
  authSessionProvider: AuthSessionProvider;
  fileSystem: FileSystem;
  storageRoots: StorageRoots;
  usfmOnionService: IUsfmOnionService;
  editorMode: EditorModeSetting;
  isViewingOlderVersion: boolean;
  selectedVersionHash: string | null;
  refreshVersions: () => Promise<void>;
  onSavedVersion: (hash: string) => void;
  clearUnsavedDiffs: () => void;
  setUnsavedDiffsByChapter: (next: DiffsByChapter) => void;
  bumpDirtyVersion: () => void;
  rerunCompareForChapters: (chapters: ChapterRef[]) => Promise<void>;
  onGitRemoteStatusChanged?: (status: GitRemoteProjectStatus | null) => void;
  prepareRemoteBaseForSave?: () => Promise<void>;
}) {
  // Re-derive `hasUnsavedChanges` on every store commit. Subscribing here
  // (instead of in the parent) keeps the dirty-aware UI honest without
  // depending on parent re-renders.
  const files = useSyncExternalStore(
    args.workingFilesStore.subscribe.bind(args.workingFilesStore),
    args.workingFilesStore.getSnapshot.bind(args.workingFilesStore),
  );
  const hasUnsavedChanges = files.some((file) =>
    file.chapters.some((chapter) => chapter.dirty),
  );

  const workingShape = () => shapeForSurface("workingRebuild", args.editorMode);

  // Save is orchestrated by the UI-free `runSavePipeline`; this hook hands it
  // the workspace nouns/sinks (the hook `args` is a superset of
  // `SavePipelineDeps`) and is the UI boundary that renders the pipeline's
  // reported substates (success toast + checkpoint/publish warnings). Keeping
  // the toasts here — not in the pipeline — is what makes the pipeline
  // testable without mounting the notification system.
  async function saveProjectToDisk(options?: SaveOptions): Promise<SaveResult> {
    const result = await runSavePipeline(args, options);
    if (result.kind === "saved" && result.persistedBookCodes.length > 0) {
      showNotificationSuccess({
        notification: {
          title: "Project Saved",
          message: `Saved ${result.persistedBookCodes.length} book(s) successfully`,
        },
      });
      // Saved-to-disk ≠ versioned ≠ published: surface each downstream
      // failure as its own warning (the bytes are already safe on disk).
      if (result.checkpoint?.kind === "failed") {
        showErrorNotification({
          notification: {
            title: "Version History Warning",
            message:
              "Your changes were saved, but a local version checkpoint could not be created.",
          },
        });
      }
      if (result.publish?.kind === "failed") {
        showErrorNotification({
          notification: {
            title: "Couldn't send your changes",
            message:
              "Your changes were saved here, but they couldn't be sent to the shared project.",
          },
        });
      }
    }
    return result;
  }

  async function discardAllChanges() {
    if (!requireGateOpen(args.interactionGate.get())) return;
    // Discovery pass: only dirty chapters need reverting. revertAllChanges'
    // previous "walk every chapter" implementation was structurally
    // incompatible with the draft pattern (would mutate chapters that
    // share refs with the store).
    const dirtyRefs: ChapterRef[] = [];
    for (const file of args.workingFilesStore.read()) {
      for (const chapter of file.chapters) {
        if (chapter.dirty) {
          dirtyRefs.push({
            bookCode: file.bookCode,
            chapterNum: chapter.chapterNumber,
          });
        }
      }
    }
    const draft = args.workingFilesStore.draftWithChapters(dirtyRefs);
    for (const ref of dirtyRefs) {
      const chapter = findChapterInDraft(draft, ref.bookCode, ref.chapterNum);
      if (chapter) revertChapterToLoadedState(chapter, workingShape());
    }
    args.setUnsavedDiffsByChapter({});
    args.bumpDirtyVersion();
    args.workingFilesStore.commit({
      patch: { kind: "bulk", files: draft },
      meta: {
        kind: "import",
        action: "revertAll",
        scope: { project: true },
        dirtyTextContent: true,
      },
    });
  }

  function revertDiff(diffToRevert: ProjectDiff) {
    if (!requireGateOpen(args.interactionGate.get())) return;
    void args.history.runTransaction({
      label: `Revert Change (${diffToRevert.semanticSid})`,
      candidates: [
        {
          bookCode: diffToRevert.bookCode,
          chapterNum: diffToRevert.chapterNum,
        },
      ],
      run: async () => {
        const draft = args.workingFilesStore.draftWithChapters([
          {
            bookCode: diffToRevert.bookCode,
            chapterNum: diffToRevert.chapterNum,
          },
        ]);
        const changedChapter = findChapterInDraft(
          draft,
          diffToRevert.bookCode,
          diffToRevert.chapterNum,
        );
        if (!changedChapter) return;

        await revertChapterDiffByBlockId({
          chapter: changedChapter,
          diffBlockId: diffToRevert.uniqueKey,
          usfmOnionService: args.usfmOnionService,
          shape: workingShape(),
        });
        args.workingFilesStore.commit({
          patch: {
            kind: "chapter",
            bookCode: diffToRevert.bookCode,
            chapter: diffToRevert.chapterNum,
            lexicalState: changedChapter.lexicalState,
          },
          meta: {
            kind: "import",
            action: "revertHunk",
            scope: {
              chapters: [
                {
                  bookCode: diffToRevert.bookCode,
                  chapterNum: diffToRevert.chapterNum,
                },
              ],
            },
            dirtyTextContent: true,
          },
        });
        await args.rerunCompareForChapters([
          {
            bookCode: diffToRevert.bookCode,
            chapterNum: diffToRevert.chapterNum,
          },
        ]);
      },
    });
  }

  function revertChapter(bookCode: string, chapterNum: number) {
    if (!requireGateOpen(args.interactionGate.get())) return;
    void args.history.runTransaction({
      label: `Revert Chapter Changes (${bookCode} ${chapterNum})`,
      candidates: [{ bookCode, chapterNum }],
      run: async () => {
        const draft = args.workingFilesStore.draftWithChapters([
          { bookCode, chapterNum },
        ]);
        const changedChapter = findChapterInDraft(draft, bookCode, chapterNum);
        if (!changedChapter) return;
        revertChapterToLoadedState(changedChapter, workingShape());
        args.workingFilesStore.commit({
          patch: {
            kind: "chapter",
            bookCode,
            chapter: chapterNum,
            lexicalState: changedChapter.lexicalState,
          },
          meta: {
            kind: "import",
            action: "revertChapter",
            scope: { chapters: [{ bookCode, chapterNum }] },
            dirtyTextContent: true,
          },
        });
        await args.rerunCompareForChapters([{ bookCode, chapterNum }]);
      },
    });
  }

  function revertAll() {
    if (!requireGateOpen(args.interactionGate.get())) return;
    const candidates = args.workingFilesStore.read().flatMap((file) =>
      file.chapters.map((chapter) => ({
        bookCode: file.bookCode,
        chapterNum: chapter.chapterNumber,
      })),
    );
    void args.history.runTransaction({
      label: "Revert All Changes",
      candidates,
      run: discardAllChanges,
    });
  }

  return {
    state: {
      hasUnsavedChanges,
    },
    actions: {
      saveProjectToDisk,
      revertDiff,
      revertChapter,
      revertAll,
      discardAllChanges,
    },
  };
}
