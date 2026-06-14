import { useQueryClient } from "@tanstack/react-query";
import type { LexicalEditor } from "lexical";
import { useState } from "react";

import type { EditorModeSetting } from "@/app/data/editor.ts";
import { applyVersionSnapshotToWorkingFiles } from "@/app/domain/project/versionNavigationService.ts";
import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import {
  requireGateOpen,
  type WorkspaceGateStore,
} from "@/app/state/WorkspaceInteractionGate.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type {
  GitProvider,
  VersionEntry,
} from "@/core/persistence/GitProvider.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";

import { fetchVersionPreview } from "./versionQueries.ts";

const VERSIONS_PAGE_SIZE = 50;

type PendingVersionAction =
  | { type: "open" }
  | { type: "switch"; hash: string }
  | { type: "latest" };

/**
 * Version-history hook for the current editable scripture workspace.
 *
 * It pages git history, loads prior snapshots into scripture workspace state,
 * and coordinates the "discard unsaved changes first" prompts that appear when
 * the user tries to view older versions mid-edit.
 */
export function useVersionHistory(args: {
  loadedProject: Project;
  gitProvider: GitProvider;
  workingFilesStore: WorkingFilesStore;
  interactionGate: WorkspaceGateStore;
  pickedFile: ScriptureBookState | null;
  pickedChapter: ScriptureChapterState | null;
  editorRef: React.RefObject<LexicalEditor | null>;
  history: CustomHistoryHook;
  editorMode: EditorModeSetting;
  usfmOnionService: IUsfmOnionService;
  bumpDirtyVersion: () => void;
}) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [entries, setEntries] = useState<VersionEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitchingVersion, setIsSwitchingVersion] = useState(false);
  const [offset, setOffset] = useState(0);
  const [latestHash, setLatestHash] = useState<string | null>(null);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [isDirtyPromptOpen, setIsDirtyPromptOpen] = useState(false);
  const [pendingAction, setPendingAction] =
    useState<PendingVersionAction | null>(null);

  const isViewingOlderVersion = Boolean(
    selectedHash && latestHash && selectedHash !== latestHash,
  );

  async function applyHash(hash: string) {
    // Version switching commits incoming snapshot state directly; refuse
    // while the workspace is gated (recovery decision pending / saving).
    if (!requireGateOpen(args.interactionGate.get())) return;
    if (isSwitchingVersion) return;
    setIsSwitchingVersion(true);
    try {
      const preview = await fetchVersionPreview({
        queryClient,
        projectPath: args.loadedProject.projectPath,
        commitHash: hash,
        loadedProject: args.loadedProject,
        gitProvider: args.gitProvider,
        usfmOnionService: args.usfmOnionService,
      });
      // Mutation-boundary recheck: the entry gate-check passed, but the
      // preview fetch above awaits the network and a save can flip the gate
      // to `saving` in that window. Bail before any commit/state update so
      // version content can't land during a save.
      if (!requireGateOpen(args.interactionGate.get())) return;
      // applyVersionSnapshotToWorkingFiles mutates every chapter of
      // every book (applyIncomingChapterAll + markFilesAsSaved both
      // walk all chapters). Draft every chapter writable so those
      // mutations land on the structural-shared draft, not the store.
      const workingFiles = args.workingFilesStore.read();
      const allRefs = workingFiles.flatMap((file) =>
        file.chapters.map((chapter) => ({
          bookCode: file.bookCode,
          chapterNum: chapter.chapterNumber,
        })),
      );
      const draft = args.workingFilesStore.draftWithChapters(allRefs);
      // No history entry: loading a previous version resets undo (clearHistory
      // below), so recording the swap would only be wiped immediately.
      applyVersionSnapshotToWorkingFiles({
        workingFiles: draft,
        sourceFiles: preview.parsedFiles,
      });
      args.workingFilesStore.commit({
        patch: { kind: "bulk", files: draft },
        meta: {
          kind: "import",
          action: "versionRevert",
          scope: { project: true },
          dirtyTextContent: true,
        },
      });
      args.bumpDirtyVersion();
      args.history.clearHistory();
      setSelectedHash(hash);
    } finally {
      setIsSwitchingVersion(false);
    }
  }

  async function refresh() {
    setIsLoading(true);
    try {
      const next = await args.gitProvider.listHistory(
        args.loadedProject.projectPath,
        {
          limit: VERSIONS_PAGE_SIZE,
          offset: 0,
        },
      );
      setEntries(next);
      setOffset(next.length);
      const nextLatestHash = next[0]?.hash ?? null;
      setLatestHash(nextLatestHash);
      setSelectedHash((prev) => {
        if (!nextLatestHash) return null;
        if (!prev) return nextLatestHash;
        return next.some((entry) => entry.hash === prev)
          ? prev
          : nextLatestHash;
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function ensureLoaded() {
    if (entries.length > 0) return;
    await refresh();
  }

  async function loadMore() {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const next = await args.gitProvider.listHistory(
        args.loadedProject.projectPath,
        {
          limit: VERSIONS_PAGE_SIZE,
          offset,
        },
      );
      setEntries((prev) => [...prev, ...next]);
      setOffset((prev) => prev + next.length);
    } finally {
      setIsLoading(false);
    }
  }

  function close() {
    setIsOpen(false);
  }

  async function open(args2: { hasUnsavedChanges: boolean }) {
    if (args2.hasUnsavedChanges) {
      setPendingAction({ type: "open" });
      setIsDirtyPromptOpen(true);
      return;
    }
    await refresh();
    setIsOpen(true);
  }

  async function select(args2: { hash: string; hasUnsavedChanges: boolean }) {
    if (!args2.hash || args2.hash === selectedHash) return;
    if (args2.hasUnsavedChanges) {
      setPendingAction({ type: "switch", hash: args2.hash });
      setIsDirtyPromptOpen(true);
      return;
    }
    await applyHash(args2.hash);
  }

  async function backToLatest(args2: { hasUnsavedChanges: boolean }) {
    if (!latestHash || selectedHash === latestHash) return;
    if (args2.hasUnsavedChanges) {
      setPendingAction({ type: "latest" });
      setIsDirtyPromptOpen(true);
      return;
    }
    await applyHash(latestHash);
  }

  function dismissDirtyPrompt() {
    setIsDirtyPromptOpen(false);
    setPendingAction(null);
  }

  async function discardAndContinue(
    discardUnsavedChanges: () => Promise<void>,
  ) {
    const action = pendingAction;
    dismissDirtyPrompt();
    await discardUnsavedChanges();
    if (!action) return;
    if (action.type === "open") {
      await refresh();
      setIsOpen(true);
      return;
    }
    if (action.type === "switch") {
      await applyHash(action.hash);
      return;
    }
    if (action.type === "latest" && latestHash) {
      await applyHash(latestHash);
    }
  }

  function saveAndContinue(openSaveReview: () => void) {
    dismissDirtyPrompt();
    setIsOpen(false);
    openSaveReview();
  }

  return {
    state: {
      isOpen,
      entries,
      isLoading,
      isSwitchingVersion,
      latestHash,
      selectedHash,
      isViewingOlderVersion,
      isDirtyPromptOpen,
    },
    actions: {
      open,
      close,
      refresh,
      ensureLoaded,
      loadMore,
      select,
      backToLatest,
      dismissDirtyPrompt,
      discardAndContinue,
      saveAndContinue,
      setLatestHash,
      setSelectedHash,
    },
  };
}
