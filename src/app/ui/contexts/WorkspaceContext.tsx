import { useLoaderData, useRouter } from "@tanstack/react-router";
import { Deferred, Effect } from "effect";
import type { LexicalEditor } from "lexical";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Settings, SettingsManager } from "@/app/data/settings.ts";
import type { RecoveryReportEntry } from "@/app/domain/api/recoverDirtyBuffers.ts";
import { makeDirtyBufferPipeline } from "@/app/domain/editor/pipelines/dirtyBufferPipeline.ts";
import { makeLintPipeline } from "@/app/domain/editor/pipelines/lintPipeline.ts";
import { makeOverlayTickPipeline } from "@/app/domain/editor/pipelines/overlayTickPipeline.ts";
import { makeRecoveredConflictTrackerSubscriber } from "@/app/domain/editor/pipelines/recoveredConflictTrackerSubscriber.ts";
import { makeSaveStatusPipeline } from "@/app/domain/editor/pipelines/saveStatusPipeline.ts";
import { makeStructureMaintenancePipeline } from "@/app/domain/editor/pipelines/structureMaintenancePipeline.ts";
import { bookCodeToTitle } from "@/app/domain/project/bookTitle.ts";
import { revertChapterToLoadedState } from "@/app/domain/project/saveAndRevertService.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { DirtyBufferStore } from "@/app/state/DirtyBufferStore.ts";
import { LayoutTickStore } from "@/app/state/LayoutTickStore.ts";
import { LintStore } from "@/app/state/LintStore.ts";
import type { RecoveredConflictTracker } from "@/app/state/RecoveredConflictTracker.ts";
import { SaveStatusStore } from "@/app/state/SaveStatusStore.ts";
import { SearchHighlightStore } from "@/app/state/SearchHighlightStore.ts";
import {
    findChapterInDraft,
    WorkingFilesStore,
} from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";
import { WorkspaceGateStore } from "@/app/state/WorkspaceInteractionGate.ts";
import { WorkspaceContext } from "@/app/ui/contexts/_workspaceContext.ts";
import { relintBookFiles } from "@/app/ui/hooks/linting.ts";
import type { LintMessagesByBook } from "@/app/ui/hooks/lintState.ts";
import { syncEditorToPickedChapter } from "@/app/ui/hooks/save/shared.ts";
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
import { useForkedPipeline } from "@/app/ui/hooks/useForkedPipeline.ts";
import { type UseLintReturn, useLint } from "@/app/ui/hooks/useLint.tsx";
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
    lint: UseLintReturn;
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
    initialLintErrorsByBook: LintMessagesByBook;
    children: React.ReactNode;
    loadedProject: Project;
    workspaceBaselineStore: WorkspaceBaselineStore;
    recoveredConflictTracker: RecoveredConflictTracker;
    dirtyBufferStore: DirtyBufferStore;
    workspaceKey: string;
    restoredBookCodes: string[];
    conflictedBookCodes: string[];
    recoveryReportEntries: RecoveryReportEntry[];
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
    initialLintErrorsByBook,
    loadedProject,
    workspaceBaselineStore,
    recoveredConflictTracker,
    dirtyBufferStore,
    workspaceKey,
    restoredBookCodes,
    conflictedBookCodes,
    recoveryReportEntries,
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
    // Workspace-scoped lint snapshot store. Seeded once from the route loader.
    const lintStore = useStableInstance(
        () => new LintStore(initialLintErrorsByBook),
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
    // Workspace-scoped reactive pipelines. These are *effects* the workspace
    // owns for lifecycle, but the kernel doesn't hand-roll each fork/interrupt —
    // `useForkedPipeline` codifies that. (Not every effect has to live inline in
    // the kernel; this keeps the wiring declarative.)
    //
    // Lint: subscribes to `workingFilesStore.changes`, debounces, switchMaps to
    // `lintExisting`, writes into LintStore. See `makeLintPipeline` for the filter.
    useForkedPipeline(
        () =>
            makeLintPipeline({
                workingFilesStore,
                lintStore,
                usfmOnionService,
            }),
        [workingFilesStore, lintStore, usfmOnionService],
    );

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
                workspaceBaselineStore,
                dirtyBufferStore,
                workspaceKey,
                appVersion: DIRTY_BUFFER_APP_VERSION,
            }),
        [
            workingFilesStore,
            workspaceBaselineStore,
            dirtyBufferStore,
            workspaceKey,
        ],
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

    // Refs read by the structure pipeline at fire time. Kept in sync below so
    // edits made after the fiber forks still see current settings/book.
    const appSettingsRef = useRef<Settings>(project.appSettings);
    appSettingsRef.current = project.appSettings;
    const visibleBookCodeRef = useRef<string>(project.pickedFile.bookCode);
    visibleBookCodeRef.current = project.pickedFile.bookCode;

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
    const history = useCustomHistory({
        workingFilesStore,
        interactionGate,
        editorRef,
        currentFileBibleIdentifier: project.pickedFile.bookCode,
        currentChapter:
            project.pickedChapter?.chapterNumber || project.currentChapter,
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
        editorMode: settingsManager.get("editorMode"),
        allProjects: projects,
        currentProjectRoute,
        onGitRemoteStatusChanged: (status) =>
            remoteStatusSetterRef.current(status),
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

    const lint = useLint({
        lintStore,
        visibleBookCode: project.pickedFile.bookCode,
        visibleChapter:
            project.pickedChapter?.chapterNumber || project.currentChapter,
    });

    const referenceResource = useReferenceItem({
        projectsService,
        libraryService,
        fileSystem,
        pickedFileIdentifier: project.pickedFile.bookCode,
        pickedChapterNumber: project.pickedChapter?.chapterNumber || 0,
        gitProvider,
    });

    const actions = useWorkspaceActions({
        editorRef,
        mainEditorDeferred,
        workingFilesStore,
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
        updateDiffMapForChapter: save.diff.refreshChapter,
        commitBookLintResults: lint.commitBookLintResults,
        referenceResource,
        setIsProcessing: project.setIsProcessing,
        setFormatMatchReport: project.setFormatMatchReport,
        setIsFormatMatchSuggestionsOpen:
            project.setIsFormatMatchSuggestionsOpen,
        targetMarkerPreservationMode: project.targetMarkerPreservationMode,
        history,
    });
    const search = useProjectSearch({
        workingFilesStore,
        searchHighlightStore,
        referenceFiles:
            referenceResource.referenceScriptureQuery.data?.parsedFiles,
        switchBookOrChapter: actions.switchBookOrChapter,
        editorRef,
        referenceEditorRef,
        pickedFile: project.pickedFile,
        pickedChapter: project.pickedChapter,
        history,
    });

    // Keep lint state in sync after history replay (undo/redo), including
    // entries that touch chapters outside the currently visible editor.
    useEffect(() => {
        return history.registerPostUndoRedoAction((event) => {
            void (async () => {
                const touchedBooks = new Set(
                    event.touchedChapters.map((chapter) => chapter.bookCode),
                );
                const currentFiles = workingFilesStore.read();
                const touchedFiles: ScriptureBookState[] = [];
                for (const bookCode of touchedBooks) {
                    const file = currentFiles.find(
                        (candidate) => candidate.bookCode === bookCode,
                    );
                    if (file) touchedFiles.push(file);
                }

                if (!touchedFiles.length) return;

                const lintResultsByBook = await relintBookFiles(
                    touchedFiles,
                    usfmOnionService,
                );

                for (const file of touchedFiles) {
                    lint.commitBookLintResults({
                        [file.bookCode]: lintResultsByBook[file.bookCode] ?? [],
                    });
                }
            })();
        });
    }, [history, lint, usfmOnionService, workingFilesStore]);

    // Thin wrapper binding the pure `bookCodeToTitle` (see ./bookTitle.ts) to this
    // project's book list — the only thing the context actually adds is scope to
    // `loadedProject`.
    function bookCodeToProjectLocalizedTitle(args: {
        bookCode: string;
        replaceCodeInString?: string;
    }) {
        return bookCodeToTitle(loadedProject.books, args);
    }

    // Replace store state wholesale when the route swaps in a fresh project.
    // No commit event is published — this is a structural reload, not an edit.
    // Subscribers that need to react listen for the route-level load instead.
    useEffect(() => {
        workingFilesStore.reset(projectFiles);
    }, [projectFiles, workingFilesStore]);

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
    // commit is `kind: "import"` (an ordinary programmatic content mutation —
    // the same class as a version revert), NOT "undo": `undo`/`redo` are
    // reserved for actual history replay, and lint filters them on the
    // assumption that the post-undo/redo listener re-lints. `runTransaction`
    // does NOT fire that listener, so an "undo" commit here would leave
    // recovered-content diagnostics stale. As an ordinary content commit, the
    // lint + save-status pipelines react normally. The dirty-buffer pipeline
    // then observes the chapters clean and clears the backups.
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
        await history.runTransaction({
            label: "Discard recovered work",
            candidates: refs,
            run: async () => {
                const draft = workingFilesStore.draftWithChapters(refs);
                for (const ref of refs) {
                    const chapter = findChapterInDraft(
                        draft,
                        ref.bookCode,
                        ref.chapterNum,
                    );
                    if (chapter) revertChapterToLoadedState(chapter);
                }
                // Push the reverted state into the visible editor. Without this
                // the store reverts but the mounted Lexical instance keeps
                // showing the recovered content (off-screen chapters refresh on
                // navigation, since they re-read the store). Mirrors the normal
                // revert paths in useSaveAndRevert.
                syncEditorToPickedChapter({
                    editorRef,
                    workingFiles: draft,
                    pickedFile: project.pickedFile,
                    pickedChapter: project.pickedChapter || null,
                });
                workingFilesStore.commit(
                    { kind: "bulk", files: draft },
                    {
                        kind: "import",
                        scope: { project: true },
                        dirtyTextContent: true,
                    },
                );
            },
        });
        recoveredConflictTracker.clearAll();
        interactionGate.set({ kind: "open" });
        setIsRestoredBannerOpen(false);
    }, [
        workingFilesStore,
        restoredBookCodes,
        recoveredConflictTracker,
        interactionGate,
        history,
        project.pickedFile,
        project.pickedChapter,
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
                lint,
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
            }}
        >
            {children}
        </WorkspaceContext.Provider>
    );
};
