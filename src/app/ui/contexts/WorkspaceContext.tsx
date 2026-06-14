import { useLoaderData, useRouter } from "@tanstack/react-router";
import { Deferred, Effect } from "effect";
import type { LexicalEditor } from "lexical";
import { useCallback, useEffect, useRef, useState } from "react";

import { analysisDisabledInMode, shapeForSurface } from "@/app/data/editor.ts";
import type { Settings, SettingsManager } from "@/app/data/settings.ts";
import type { RecoveryReportEntry } from "@/app/domain/api/recoverDirtyBuffers.ts";
import {
  groupFindingsByChapter,
  onionFindingsByChapter,
  sousFindingsToFindings,
} from "@/app/domain/editor/annotations/normalizeFindings.ts";
import { makeDirtyBufferPipeline } from "@/app/domain/editor/pipelines/dirtyBufferPipeline.ts";
import { makeEditorSyncPipeline } from "@/app/domain/editor/pipelines/editorSyncPipeline.ts";
import { makeLintPipeline } from "@/app/domain/editor/pipelines/lintPipeline.ts";
import { makeMirrorPatchProducer } from "@/app/domain/editor/pipelines/mirrorPatchProducer.ts";
import { makeMirrorResultRouter } from "@/app/domain/editor/pipelines/mirrorResultRouter.ts";
import { makeOverlayTickPipeline } from "@/app/domain/editor/pipelines/overlayTickPipeline.ts";
import { makeRecoveredConflictTrackerSubscriber } from "@/app/domain/editor/pipelines/recoveredConflictTrackerSubscriber.ts";
import { makeSaveStatusPipeline } from "@/app/domain/editor/pipelines/saveStatusPipeline.ts";
import { makeSousPipeline } from "@/app/domain/editor/pipelines/sousPipeline.ts";
import { makeStructureMaintenancePipeline } from "@/app/domain/editor/pipelines/structureMaintenancePipeline.ts";
import { makeTokenFixpointPipeline } from "@/app/domain/editor/pipelines/tokenFixpointPipeline.ts";
import type { WorkspaceKernelHandle } from "@/app/domain/mirror/workspaceKernel.ts";
import { bookCodeToTitle } from "@/app/domain/project/bookTitle.ts";
import { revertChapterToLoadedState } from "@/app/domain/project/saveAndRevertService.ts";
import { withWorkingFilesDraftSync } from "@/app/domain/project/workingFileCommand.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { DirtyBufferStore } from "@/app/state/DirtyBufferStore.ts";
import { FindingsStore } from "@/app/state/FindingsStore.ts";
import { LayoutTickStore } from "@/app/state/LayoutTickStore.ts";
import type { RecoveredConflictTracker } from "@/app/state/RecoveredConflictTracker.ts";
import { SaveStatusStore } from "@/app/state/SaveStatusStore.ts";
import { SearchHighlightStore } from "@/app/state/SearchHighlightStore.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";
import { WorkspaceGateStore } from "@/app/state/WorkspaceInteractionGate.ts";
import { WorkspaceModalStore } from "@/app/state/WorkspaceModalStore.ts";
import { WorkspaceModalOutlet } from "@/app/ui/components/blocks/WorkspaceModalOutlet.tsx";
import { WorkspaceContext } from "@/app/ui/contexts/_workspaceContext.ts";
import {
  type UseActionsHook,
  useWorkspaceActions,
} from "@/app/ui/hooks/useActions.tsx";
import {
  type CustomHistoryHook,
  useCustomHistory,
} from "@/app/ui/hooks/useCustomHistory.ts";
import {
  type UseDynamicStylesheetHook,
  useDynamicStylesheet,
} from "@/app/ui/hooks/useDynamicStyles.tsx";
import {
  type UseFindingsReturn,
  useFindings,
} from "@/app/ui/hooks/useFindings.ts";
import { useForkedPipeline } from "@/app/ui/hooks/useForkedPipeline.ts";
import {
  type ReferenceItemHook,
  useReferenceItem,
} from "@/app/ui/hooks/useReferenceItem.tsx";
import { useRemoteSync } from "@/app/ui/hooks/useRemoteSync.ts";
import { type UseSaveReturn, useSave } from "@/app/ui/hooks/useSave.tsx";
import {
  type UseSearchReturn,
  useProjectSearch,
} from "@/app/ui/hooks/useSearch.tsx";
import { useStableInstance } from "@/app/ui/hooks/useStableInstance.ts";
import {
  useWorkspaceState,
  type WorkspaceState,
} from "@/app/ui/hooks/useWorkspaceState.tsx";
import type { LanguageDirection } from "@/core/domain/project/project.ts";
import type {
  GitRemoteProjectInfo,
  GitRemoteProjectStatus,
} from "@/core/persistence/gitRemoteModels.ts";
import type {
  Project,
  ProjectListItem,
} from "@/core/persistence/ScriptureWorkspace.ts";

/**
 * Aggregated workspace context for the scripture route.
 *
 * This is the main app-side handoff from loaded nouns and service seams into the
 * UI layer. Downstream components should read the already-composed workspace,
 * reference, search, lint, save, and history behaviors from here instead of
 * reassembling those concerns ad hoc.
 */
export interface WorkSpaceContextType {
  editorRef: React.RefObject<LexicalEditor | null>;
  referenceEditorRef: React.RefObject<LexicalEditor | null>;
  settingsManager: SettingsManager;
  allProjects: ProjectListItem[];
  currentProjectRoute: string;
  loadedProject: Project;
  project: WorkspaceState;
  actions: UseActionsHook;
  referenceResource: ReferenceItemHook;
  search: UseSearchReturn;
  /** Policy-filtered findings views + the user's sticky filter state. */
  findings: UseFindingsReturn;
  cssStyleSheet: UseDynamicStylesheetHook;
  save: UseSaveReturn;
  history: CustomHistoryHook;
  /**
   * Single source of live current truth for working-files state. The editor's
   * bridge plugin commits here on every update; consumers read via
   * `workingFilesStore.read()` or subscribe via the Effect-side `changes`
   * stream.
   */
  workingFilesStore: WorkingFilesStore;
  /**
   * Coarse crash-recovery safety gate. `recovery-decision-pending` while a
   * restore banner awaits Keep/Discard; `saving` while a save persists. The
   * editor and mutation entry points read this to block input. Held as an
   * observable store so render-time and event-time readers see one live value.
   */
  interactionGate: WorkspaceGateStore;
  /**
   * Chapters restored from a backup whose disk baseline had moved. While
   * non-empty, the external-compare entry control is disabled and saves are
   * forced through review. UI reads it via `useSyncExternalStore`.
   */
  recoveredConflictTracker: RecoveredConflictTracker;
  /**
   * Resolved by `WorkingFilesBridgePlugin` once the Lexical editor mounts.
   * Effect-side commands and pipelines that need to write back into the
   * editor await this instead of polling `editorRef.current`.
   */
  mainEditorDeferred: Deferred.Deferred<LexicalEditor>;
  /**
   * Workspace-scoped layout-tick counter. Bumped by the overlay-tick
   * pipeline after working-files commits, and by window-level
   * resize/scroll listeners. Overlay sinks subscribe via `useLayoutTick`.
   */
  layoutTickStore: LayoutTickStore;
  /**
   * Single source of "what to paint" for the CSS Highlight registry.
   * Search hooks call `set(...)` to publish; `HighlightSink` repaints
   * on every tick + store change so highlights stay aligned with the
   * live editor DOM.
   */
  searchHighlightStore: SearchHighlightStore;
  /**
   * THE findings store: every producer's findings, namespace-partitioned
   * (`onion` / `sous-chef`), book→chapter hierarchical within. Written by
   * the lint + sous pipelines; read via `useSyncExternalStore` selectors.
   */
  findingsStore: FindingsStore;
  /**
   * Workspace modal outlet: decorator actions (and future command surfaces)
   * open modals here via `openModal(Component, props)`; the provider mounts
   * the one `WorkspaceModalOutlet` that renders the slot.
   */
  workspaceModalStore: WorkspaceModalStore;
  remote: {
    status: GitRemoteProjectStatus | null;
    projectInfo: GitRemoteProjectInfo | null;
    isRefreshing: boolean;
    syncNow(): Promise<void>;
    reviewIncoming(): Promise<void>;
  };
  /**
   * Crash-recovery banner state, exposed for the small `<RecoveryBanners />`
   * component to consume. Kept on context (rather than threaded as props
   * through the layout shell) so the banners can mount anywhere inside the
   * provider without prop-drilling — see RecoveryBanners.tsx.
   */
  recovery: {
    restoredBookCodes: string[];
    conflictedBookCodes: string[];
    recoveryReportEntries: RecoveryReportEntry[];
    isRestoredBannerOpen: boolean;
    isRecoveryReportOpen: boolean;
    dismissRecoveryReport(): void;
    keepRecoveredWork(): void;
    discardRecoveredWork(): Promise<void>;
  };
  projectLanguageDirection: LanguageDirection;
  isProcessing: boolean;
  bookCodeToProjectLocalizedTitle({
    bookCode,
    replaceCodeInString,
  }: {
    bookCode: string;
    replaceCodeInString?: string;
  }): string;
}

type ProjectProviderProps = {
  currentProjectRoute: string;
  projectFiles: ScriptureBookState[];
  children: React.ReactNode;
  loadedProject: Project;
  workspaceBaselineStore: WorkspaceBaselineStore;
  recoveredConflictTracker: RecoveredConflictTracker;
  dirtyBufferStore: DirtyBufferStore;
  workspaceKey: string;
  restoredBookCodes: string[];
  conflictedBookCodes: string[];
  recoveryReportEntries: RecoveryReportEntry[];
  /**
   * The workspace kernel the loader built + claimed (mirror feed, platform
   * session, seeded mirror, awaited initial findings). The provider consumes
   * it — pointing its pipelines at `kernel.feed`, committing
   * `kernel.initialFindings` before first paint — and releases it on unmount.
   */
  kernel: WorkspaceKernelHandle;
  queryBookOverride?: string;
  queryChapterOverride?: number;
};

const DIRTY_BUFFER_APP_VERSION =
  (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "unknown";

/**
 * Provider that assembles the live scripture workspace view model.
 *
 * Upstream route loaders have already produced the editable scripture noun and
 * initial parsed state. This provider wires together the hooks that sit on top of
 * that noun so child components can operate without repeated type narrowing or
 * service plumbing.
 */
export const ProjectProvider = ({
  currentProjectRoute,
  projectFiles,
  loadedProject,
  workspaceBaselineStore,
  recoveredConflictTracker,
  dirtyBufferStore,
  workspaceKey,
  restoredBookCodes,
  conflictedBookCodes,
  recoveryReportEntries,
  kernel,
  queryBookOverride,
  queryChapterOverride,
  children,
}: ProjectProviderProps) => {
  const editorRef = useRef<LexicalEditor | null>(null);
  const referenceEditorRef = useRef<LexicalEditor | null>(null);
  const { projects } = useLoaderData({ from: "__root__" });
  const projectLanguageDirection = loadedProject.language.direction;

  // Editor commits push here; consumers read via `workingFilesStore.read()`
  // or subscribe via the Effect-side `changes` stream.
  const workingFilesStore = useStableInstance(
    () => new WorkingFilesStore(projectFiles),
  );
  // Coarse mutation gate. Starts blocked when there is restored work awaiting a
  // Keep/Discard decision, so the user can't edit underneath the banner.
  const interactionGate = useStableInstance(
    () =>
      new WorkspaceGateStore(
        restoredBookCodes.length > 0
          ? { kind: "recovery-decision-pending" }
          : { kind: "open" },
      ),
  );
  // THE findings store (all producers, namespace-partitioned). Seeded
  // synchronously here from the kernel's awaited initial findings — the loader
  // already ran a project-wide lint + sous against the seeded mirror and waited
  // for both, so first paint shows real project findings without typing.
  // Normalization at this boundary keeps the store producer-agnostic (and the
  // chapter-0 bucketing means front-matter findings survive the seed, too).
  // These same passes ALSO flowed through the result router (the live path), so
  // committing them here is idempotent against that; in plain mode the kernel's
  // findings are empty.
  const findingsStore = useStableInstance(() => {
    const store = new FindingsStore();
    for (const [bookCode, issues] of Object.entries(
      kernel.initialFindings.lint,
    )) {
      store.commitBookFindings(
        "onion",
        bookCode,
        onionFindingsByChapter(issues),
      );
    }
    for (const [bookCode, analysis] of Object.entries(
      kernel.initialFindings.sous,
    )) {
      store.commitSousBookFindings(
        bookCode,
        groupFindingsByChapter(sousFindingsToFindings(analysis.findings)),
        analysis.segments,
      );
    }
    return store;
  });
  // One workspace-level modal slot; rendered by the outlet below.
  const workspaceModalStore = useStableInstance(
    () => new WorkspaceModalStore(),
  );
  // Workspace-scoped save-lifecycle store. Initial status follows the
  // working files: dirty if any chapter is dirty (crash-recovery cache),
  // clean otherwise.
  const saveStatusStore = useStableInstance(() => {
    const startsDirty = projectFiles.some((file) =>
      file.chapters.some((chapter) => chapter.dirty),
    );
    return new SaveStatusStore(
      startsDirty ? { kind: "dirty" } : { kind: "clean" },
    );
  });
  // Overlay/mutation sinks subscribe via `useLayoutTick` and re-measure in
  // `useLayoutEffect`.
  const layoutTickStore = useStableInstance(() => new LayoutTickStore());
  // Search hooks publish; the mounted `HighlightSink` repaints from this
  // store on change + layout tick.
  const searchHighlightStore = useStableInstance(
    () => new SearchHighlightStore(),
  );
  // Resolves once the bridge plugin mounts. Effect-side commands and
  // pipelines await this instead of racing the editor reference.
  const mainEditorDeferred = useStableInstance(() =>
    Effect.runSync(Deferred.make<LexicalEditor>()),
  );
  // The mirror feed lives on the kernel (built + seeded by the loader, outside
  // React). The patch producer and the repointed lint/sous/dirty-buffer
  // pipelines write through it; the kernel's platform session(s) are already
  // attached as its sink(s).
  const mirrorFeed = kernel.feed;

  const {
    settingsManager,
    projectsService,
    libraryService,
    fileSystem,
    authSessionProvider,
    storageRoots,
    usfmOnionService,
    gitProvider,
  } = useRouter().options.context;

  // Consume the kernel: wire the result router onto its feed and release the
  // claim on unmount. The kernel already spawned the session, seeded the mirror
  // (from loader data), awaited engine readiness, and ran the initial findings
  // pass — all before this component mounted; those findings were committed
  // synchronously into `findingsStore` above, so first paint already shows
  // them. What stays the provider's job is the LIVE wiring: the result router
  // (later passes land in the stores through it) and the forked pipelines
  // below.
  //
  // The working-files store is reset to this project's files so the live
  // patch producer reads the right content; it and the kernel's seed both start
  // at generation 0 (each a fresh store over the same loader `projectFiles`),
  // so the seed and the first live commits order coherently.
  useEffect(() => {
    // Claim the kernel for this mount and release on unmount. The claim is
    // re-entrant: a StrictMode unmount/remount releases then re-claims, and the
    // re-claim cancels the pending grace dispose — without this the throwaway
    // mount's release would tear the worker set down ~grace later, orphaning the
    // feed the live pipelines still write through (findings silently stop).
    const claim = kernel.claim();
    workingFilesStore.reset(projectFiles);
    const stopRouter = makeMirrorResultRouter({
      feed: mirrorFeed,
      workingFilesStore,
      workspaceBaselineStore,
      findingsStore,
      dirtyBufferStore,
      workspaceKey,
    });
    return () => {
      stopRouter();
      claim.release();
    };
  }, [
    kernel,
    mirrorFeed,
    workspaceKey,
    projectFiles,
    dirtyBufferStore,
    workingFilesStore,
    workspaceBaselineStore,
    findingsStore,
  ]);

  // Fork the patch producer: tokenizes changed chapters once per commit and
  // fans the delta to the feed's sinks.
  useForkedPipeline(
    () =>
      makeMirrorPatchProducer({
        workingFilesStore,
        workspaceBaselineStore,
        feed: mirrorFeed,
      }),
    [workingFilesStore, workspaceBaselineStore, mirrorFeed],
  );
  // Workspace-scoped reactive pipelines. These are *effects* the workspace
  // owns for lifecycle, but the kernel doesn't hand-roll each fork/interrupt —
  // `useForkedPipeline` codifies that. (Not every effect has to live inline in
  // the kernel; this keeps the wiring declarative.)
  //
  // The analysis pipelines (lint, sous, dev re-lex alarm, structure
  // maintenance) fork together below, gated by `analysisDisabled` so plain
  // mode is the bytes-only escape hatch — see the gated region after
  // `project`. The infra pipelines here (save-status, overlay-tick,
  // dirty-buffer autosave, recovered-conflict, editor-sync) run in every mode.
  //
  // Save-status: flips SaveStatusStore to `dirty` on every text-changing commit.
  useForkedPipeline(
    () => makeSaveStatusPipeline({ workingFilesStore, saveStatusStore }),
    [workingFilesStore, saveStatusStore],
  );

  // Overlay-tick: bumps `LayoutTickStore` once per quiet 16ms after commits
  // settle so overlay sinks can re-measure without each wiring its own
  // MutationObserver. Window-level resize/scroll bumps below cover non-commit
  // layout signals.
  useForkedPipeline(
    () => makeOverlayTickPipeline({ workingFilesStore, layoutTickStore }),
    [workingFilesStore, layoutTickStore],
  );

  // Crash-recovery dirty-buffer: writes per-book USFM backups while books are
  // dirty, clears them when saved/reverted. See `makeDirtyBufferPipeline` for
  // the per-book debounce + ceiling + retry.
  useForkedPipeline(
    () =>
      makeDirtyBufferPipeline({
        workingFilesStore,
        feed: mirrorFeed,
        appVersion: DIRTY_BUFFER_APP_VERSION,
      }),
    [workingFilesStore, mirrorFeed],
  );

  // Recovered-conflict tracker subscriber: clears tracker entries as their
  // chapters are observed clean (save success, revert, etc.).
  useForkedPipeline(
    () =>
      makeRecoveredConflictTrackerSubscriber({
        workingFilesStore,
        tracker: recoveredConflictTracker,
      }),
    [workingFilesStore, recoveredConflictTracker],
  );

  // Window-level resize/scroll → layout tick. Plain DOM listeners; the
  // store coalesces (consumers debounce via rAF if they want).
  useEffect(() => {
    const onChange = () => layoutTickStore.bump();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, {
      capture: true,
      passive: true,
    });
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, { capture: true });
    };
  }, [layoutTickStore]);

  const cssStyleSheet = useDynamicStylesheet();
  const project = useWorkspaceState(
    settingsManager,
    projectFiles,
    queryBookOverride,
    queryChapterOverride,
  );

  // Plain mode opts out of all analysis/repair (see `analysisDisabledInMode`).
  // Threaded into the gated fork deps below so flipping mode tears down and
  // re-forks the analysis fibers.
  const analysisDisabled = analysisDisabledInMode(
    project.appSettings.editorMode,
  );

  // Refs read by the structure + editor-sync pipelines at fire time. Kept in
  // sync below so edits made after the fibers fork still see current
  // settings/book/chapter.
  const appSettingsRef = useRef<Settings>(project.appSettings);
  appSettingsRef.current = project.appSettings;
  const visibleBookCodeRef = useRef<string>(project.pickedFile.bookCode);
  visibleBookCodeRef.current = project.pickedFile.bookCode;
  const visibleChapterRef = useRef<number>(
    project.pickedChapter?.chapterNumber ?? project.currentChapter,
  );
  visibleChapterRef.current =
    project.pickedChapter?.chapterNumber ?? project.currentChapter;

  // Editor-sync: the commit-driven entry path of the editor-sync chokepoint.
  // Programmatic commits (fix-its, imports, reverts) touching the visible
  // chapter render their committed content into the editor; view-driven
  // swaps (navigation, mode switch) call `setEditorContent` directly.
  useForkedPipeline(
    () =>
      makeEditorSyncPipeline({
        workingFilesStore,
        mainEditorDeferred,
        getVisibleBookCode: () => visibleBookCodeRef.current,
        getVisibleChapter: () => visibleChapterRef.current,
        getEditorShape: () =>
          shapeForSurface("mainEditor", appSettingsRef.current.editorMode),
        layoutTickStore,
      }),
    [workingFilesStore, mainEditorDeferred, layoutTickStore],
  );

  // Fork the structure-maintenance pipeline as a workspace-scoped fiber.
  // Filters `userEdit && dirtyTextContent`, debounces, awaits the editor
  // Deferred, then runs structure + metadata passes. Writebacks publish as
  // `kind: "structuralFixup"` (filtered by every other pipeline, including
  // this one) which breaks the feedback loop.
  useForkedPipeline(
    () =>
      makeStructureMaintenancePipeline({
        workingFilesStore,
        mainEditorDeferred,
        getAppSettings: () => appSettingsRef.current,
        getVisibleBookCode: () => visibleBookCodeRef.current,
      }),
    [workingFilesStore, mainEditorDeferred],
  );

  // --- Analysis pipelines: gated off in plain mode (the bytes-only escape
  // hatch). `analysisDisabled` rides each deps array so a mode flip interrupts
  // and re-forks these fibers. Structure-maintenance above gates itself at
  // fire time (it already read mode there for view); these three are
  // mode-naive, so they gate here at the fork site instead.
  //
  // Lint: subscribes to `workingFilesStore.changes`, debounces, switchMaps
  // to one batched lint pass, commits each book into the findings store's
  // onion slice. See `makeLintPipeline` for the filter.
  useForkedPipeline(
    () =>
      analysisDisabled
        ? Effect.void
        : makeLintPipeline({
            workingFilesStore,
            feed: mirrorFeed,
          }),
    [analysisDisabled, workingFilesStore, mirrorFeed],
  );

  // Dev-only I2 re-lex fixpoint alarm: flags any commit whose token stream
  // no longer matches a fresh lex of its own bytes. Diagnostics only — it
  // never mutates state (see makeTokenFixpointPipeline).
  useForkedPipeline(
    () =>
      import.meta.env.DEV && !analysisDisabled
        ? makeTokenFixpointPipeline({
            workingFilesStore,
            usfmOnionService,
          })
        : Effect.void,
    [analysisDisabled, workingFilesStore, usfmOnionService],
  );

  // sous content findings: a PARALLEL subscriber to the same store the lint
  // pipeline rides (NOT a tee on lint), on its own calmer debounce. Commits
  // findings + the segment-map sidecar into the sous slice.
  useForkedPipeline(
    () =>
      analysisDisabled
        ? Effect.void
        : makeSousPipeline({
            workingFilesStore,
            feed: mirrorFeed,
          }),
    [analysisDisabled, workingFilesStore, mirrorFeed],
  );
  const history = useCustomHistory({
    workingFilesStore,
    interactionGate,
    editorRef,
    currentFileBibleIdentifier: project.pickedFile.bookCode,
    currentChapter:
      project.pickedChapter?.chapterNumber || project.currentChapter,
    getEditorShape: () =>
      shapeForSurface("mainEditor", appSettingsRef.current.editorMode),
  });
  const remoteStatusSetterRef = useRef<
    (status: GitRemoteProjectStatus | null) => void
  >(() => {});
  const save = useSave({
    workingFilesStore,
    workspaceBaselineStore,
    recoveredConflictTracker,
    interactionGate,
    saveStatusStore,
    editorRef: editorRef,
    pickedFile: project.pickedFile,
    pickedChapter: project.pickedChapter || null,
    loadedProject,
    history,
    projectsService,
    fileSystem,
    storageRoots,
    gitProvider,
    editorMode: project.appSettings.editorMode,
    allProjects: projects,
    currentProjectRoute,
    onGitRemoteStatusChanged: (status) => remoteStatusSetterRef.current(status),
  });
  const remote = useRemoteSync({
    loadedProject,
    fileSystem,
    storageRoots,
    settingsManager,
    authSessionProvider,
    gitProvider,
    interactionGate,
    recoveredConflictTracker,
    save,
  });
  remoteStatusSetterRef.current = remote.setStatus;

  const findings = useFindings({
    findingsStore,
    visibleBookCode: project.pickedFile.bookCode,
    visibleChapter:
      project.pickedChapter?.chapterNumber || project.currentChapter,
    editorMode: project.appSettings.editorMode,
  });

  const referenceResource = useReferenceItem({
    projectsService,
    libraryService,
    fileSystem,
    pickedFileIdentifier: project.pickedFile.bookCode,
    pickedChapterNumber: project.pickedChapter?.chapterNumber || 0,
    editorMode: project.appSettings.editorMode,
    gitProvider,
  });

  const actions = useWorkspaceActions({
    editorRef,
    mainEditorDeferred,
    workingFilesStore,
    layoutTickStore,
    interactionGate,
    loadedProject,
    currentChapter:
      project.pickedChapter?.chapterNumber || project.currentChapter,
    currentFileBibleIdentifier: project.pickedFile.bookCode,
    setCurrentChapter: project.setCurrentChapter,
    setCurrentFileBibleIdentifier: project.setCurrentFileBibleIdentifier,
    updateAppSettings: project.updateAppSettings,
    appSettings: project.appSettings,
    pickedFile: project.pickedFile,
    toggleDiffModal: save.diff.open,
    referenceResource,
    setIsProcessing: project.setIsProcessing,
    setFormatMatchReport: project.setFormatMatchReport,
    setIsFormatMatchSuggestionsOpen: project.setIsFormatMatchSuggestionsOpen,
    targetMarkerPreservationMode: project.targetMarkerPreservationMode,
    history,
  });
  const search = useProjectSearch({
    workingFilesStore,
    searchHighlightStore,
    referenceFiles: referenceResource.referenceScriptureQuery.data?.parsedFiles,
    switchBookOrChapter: actions.switchBookOrChapter,
    editorRef,
    referenceEditorRef,
    pickedFile: project.pickedFile,
    pickedChapter: project.pickedChapter,
    history,
  });

  // Thin wrapper binding the pure `bookCodeToTitle` (see ./bookTitle.ts) to this
  // project's book list — the only thing the context actually adds is scope to
  // `loadedProject`.
  function bookCodeToProjectLocalizedTitle(args: {
    bookCode: string;
    replaceCodeInString?: string;
  }) {
    return bookCodeToTitle(loadedProject.books, args);
  }

  // Crash-recovery banner state. The restored-work banner blocks the gate
  // until the user decides; the report banner is informational.
  const [isRestoredBannerOpen, setIsRestoredBannerOpen] = useState(
    restoredBookCodes.length > 0,
  );
  const [isRecoveryReportOpen, setIsRecoveryReportOpen] = useState(
    recoveryReportEntries.length > 0,
  );

  // Keep: accept restored work as the latest state. The tracker keeps its
  // entries (so first save still forces review for true conflicts).
  const keepRecoveredWork = useCallback(() => {
    interactionGate.set({ kind: "open" });
    setIsRestoredBannerOpen(false);
  }, [interactionGate]);

  // Discard: revert the restored chapters back to their disk baseline and drop
  // the tracker. Wrapped in `history.runTransaction` for undoability. The
  // commit is `kind: "import"` + `action: "discardRecoveredWork"` (an
  // ordinary programmatic content mutation, same class as a version revert);
  // the lint/sous/save-status pipelines react to it like any content commit,
  // and the dirty-buffer pipeline then observes the chapters clean and
  // clears the backups.
  const dismissRecoveryReport = useCallback(() => {
    setIsRecoveryReportOpen(false);
  }, []);

  const discardRecoveredWork = useCallback(async () => {
    const refs: { bookCode: string; chapterNum: number }[] = [];
    for (const file of workingFilesStore.read()) {
      if (!restoredBookCodes.includes(file.bookCode)) continue;
      for (const chapter of file.chapters) {
        if (chapter.dirty) {
          refs.push({
            bookCode: file.bookCode,
            chapterNum: chapter.chapterNumber,
          });
        }
      }
    }
    const historyToken = history.captureHistory();
    const outcome = withWorkingFilesDraftSync({
      workingFilesStore,
      commitMeta: {
        kind: "import",
        action: "discardRecoveredWork",
        scope: { project: true },
        dirtyTextContent: true,
      },
      mutate: (draft) => {
        for (const ref of refs) {
          const chapter = draft.chapterForWrite(ref);
          if (chapter) revertChapterToLoadedState(chapter);
        }
      },
    });
    if (outcome.kind === "committed") {
      history.recordHistory(historyToken, {
        label: "Discard recovered work",
        affected: outcome.committedChapters,
      });
    }
    recoveredConflictTracker.clearAll();
    interactionGate.set({ kind: "open" });
    setIsRestoredBannerOpen(false);
  }, [
    workingFilesStore,
    restoredBookCodes,
    recoveredConflictTracker,
    interactionGate,
    history,
  ]);

  return (
    <WorkspaceContext.Provider
      value={{
        editorRef,
        referenceEditorRef,
        settingsManager,
        allProjects: projects,
        currentProjectRoute,
        loadedProject,
        project,
        actions,
        referenceResource,
        search,
        findings,
        cssStyleSheet,
        save,
        history,
        remote: {
          status: remote.status,
          projectInfo: remote.projectInfo,
          isRefreshing: remote.isRefreshing,
          syncNow: remote.syncNow,
          reviewIncoming: remote.reviewIncoming,
        },
        recovery: {
          restoredBookCodes,
          conflictedBookCodes,
          recoveryReportEntries,
          isRestoredBannerOpen,
          isRecoveryReportOpen,
          dismissRecoveryReport,
          keepRecoveredWork,
          discardRecoveredWork,
        },
        projectLanguageDirection,
        isProcessing: project.isProcessing,
        bookCodeToProjectLocalizedTitle,
        workingFilesStore,
        interactionGate,
        recoveredConflictTracker,
        mainEditorDeferred,
        layoutTickStore,
        searchHighlightStore,
        findingsStore,
        workspaceModalStore,
      }}
    >
      {children}
      <WorkspaceModalOutlet store={workspaceModalStore} />
    </WorkspaceContext.Provider>
  );
};
