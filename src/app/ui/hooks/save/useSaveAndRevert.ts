import type { LexicalEditor } from "lexical";
import { useSyncExternalStore } from "react";

import type { EditorModeSetting } from "@/app/data/editor.ts";
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
import {
  withWorkingFilesDraft,
  withWorkingFilesDraftSync,
} from "@/app/domain/project/workingFileCommand.ts";
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

  // Sync: the whole revert runs through the sync recording-draft door
  // (`withWorkingFilesDraftSync`) in one stack frame — nothing here awaits.
  function discardAllChanges() {
    if (!requireGateOpen(args.interactionGate.get())) return;
    // Discovery pass: only dirty chapters need reverting.
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
    args.setUnsavedDiffsByChapter({});
    args.bumpDirtyVersion();
    return withWorkingFilesDraftSync({
      workingFilesStore: args.workingFilesStore,
      commitMeta: {
        kind: "import",
        action: "revertAll",
        scope: { project: true },
        dirtyTextContent: true,
      },
      mutate: (draft) => {
        for (const ref of dirtyRefs) {
          const chapter = draft.chapterForWrite(ref);
          if (chapter) revertChapterToLoadedState(chapter);
        }
      },
    });
  }

  function revertDiff(diffToRevert: ProjectDiff) {
    if (!requireGateOpen(args.interactionGate.get())) return;
    void (async () => {
      // Async: the diff-block revert awaits the onion service, so this rides
      // the validated seam (a concurrent commit to the chapter aborts it
      // rather than clobbering) — not the sync door.
      const historyToken = args.history.captureHistory();
      const outcome = await withWorkingFilesDraft({
        workingFilesStore: args.workingFilesStore,
        interactionGate: args.interactionGate,
        commitMeta: {
          kind: "import",
          action: "revertHunk",
          dirtyTextContent: true,
        },
        mutate: async (draft) => {
          const chapter = draft.chapterForWrite({
            bookCode: diffToRevert.bookCode,
            chapterNum: diffToRevert.chapterNum,
          });
          if (!chapter) return;
          await revertChapterDiffByBlockId({
            chapter,
            diffBlockId: diffToRevert.uniqueKey,
            usfmOnionService: args.usfmOnionService,
          });
        },
      });
      if (outcome.kind === "committed") {
        args.history.recordHistory(historyToken, {
          label: `Revert Change (${diffToRevert.semanticSid})`,
          affected: outcome.committedChapters,
        });
      }
      await args.rerunCompareForChapters([
        {
          bookCode: diffToRevert.bookCode,
          chapterNum: diffToRevert.chapterNum,
        },
      ]);
    })();
  }

  function revertChapter(bookCode: string, chapterNum: number) {
    if (!requireGateOpen(args.interactionGate.get())) return;
    void (async () => {
      const historyToken = args.history.captureHistory();
      const outcome = withWorkingFilesDraftSync({
        workingFilesStore: args.workingFilesStore,
        commitMeta: {
          kind: "import",
          action: "revertChapter",
          dirtyTextContent: true,
        },
        mutate: (draft) => {
          const chapter = draft.chapterForWrite({ bookCode, chapterNum });
          if (chapter) revertChapterToLoadedState(chapter);
        },
      });
      if (outcome.kind === "committed") {
        args.history.recordHistory(historyToken, {
          label: `Revert Chapter Changes (${bookCode} ${chapterNum})`,
          affected: outcome.committedChapters,
        });
      }
      await args.rerunCompareForChapters([{ bookCode, chapterNum }]);
    })();
  }

  function revertAll() {
    if (!requireGateOpen(args.interactionGate.get())) return;
    void (async () => {
      const historyToken = args.history.captureHistory();
      const outcome = await discardAllChanges();
      if (outcome?.kind === "committed") {
        args.history.recordHistory(historyToken, {
          label: "Revert All Changes",
          affected: outcome.committedChapters,
        });
      }
    })();
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
