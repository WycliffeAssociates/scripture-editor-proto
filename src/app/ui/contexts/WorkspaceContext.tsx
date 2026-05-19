import { useLoaderData, useRouter } from "@tanstack/react-router";
import { Deferred, Effect, Fiber } from "effect";
import type { LexicalEditor } from "lexical";
import { createContext, useCallback, useEffect, useRef, useState } from "react";
import type { Settings, SettingsManager } from "@/app/data/settings.ts";
import { makeLintPipeline } from "@/app/domain/editor/pipelines/lintPipeline.ts";
import { makeOverlayTickPipeline } from "@/app/domain/editor/pipelines/overlayTickPipeline.ts";
import { makeSaveStatusPipeline } from "@/app/domain/editor/pipelines/saveStatusPipeline.ts";
import { makeStructureMaintenancePipeline } from "@/app/domain/editor/pipelines/structureMaintenancePipeline.ts";
import {
    GIT_REMOTE_OPEN_STATUS_NOT_LINKED,
    type GitRemoteOpenStatusResult,
    hydrateGitRemoteStatusOnOpen,
} from "@/app/domain/project/gitRemoteOpenStatus.ts";
import {
    PUBLISH_AFTER_SAVE_PUBLISHED,
    publishLinkedProjectNow,
} from "@/app/domain/project/gitRemotePublishCoordinator.ts";
import { prepareRemoteBaseForReconciliation } from "@/app/domain/project/prepareRemoteBaseForReconciliation.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import { LayoutTickStore } from "@/app/state/LayoutTickStore.ts";
import { LintStore } from "@/app/state/LintStore.ts";
import { SaveStatusStore } from "@/app/state/SaveStatusStore.ts";
import { SearchHighlightStore } from "@/app/state/SearchHighlightStore.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import { relintBookFiles } from "@/app/ui/hooks/linting.ts";
import type { LintMessagesByBook } from "@/app/ui/hooks/lintState.ts";
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
import { type UseLintReturn, useLint } from "@/app/ui/hooks/useLint.tsx";
import {
    type ReferenceItemHook,
    useReferenceItem,
} from "@/app/ui/hooks/useReferenceItem.tsx";
import { type UseSaveReturn, useSave } from "@/app/ui/hooks/useSave.tsx";
import {
    type UseSearchReturn,
    useProjectSearch,
} from "@/app/ui/hooks/useSearch.tsx";
import {
    useWorkspaceState,
    type WorkspaceState,
} from "@/app/ui/hooks/useWorkspaceState.tsx";
import type { LanguageDirection } from "@/core/domain/project/project.ts";
import {
    GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW,
    GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH,
    GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE,
    type GitRemoteProjectInfo,
    type GitRemoteProjectStatus,
} from "@/core/persistence/gitRemoteModels.ts";
import { readGitRemoteProjectStatus } from "@/core/persistence/gitRemoteStore.ts";
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
    queryBookOverride?: string;
    queryChapterOverride?: number;
};
const WorkspaceContext = createContext<WorkSpaceContextType | undefined>(
    undefined,
);

export { WorkspaceContext };

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
    queryBookOverride,
    queryChapterOverride,
    children,
}: ProjectProviderProps) => {
    const editorRef = useRef<LexicalEditor | null>(null);
    const referenceEditorRef = useRef<LexicalEditor | null>(null);
    const { projects } = useLoaderData({ from: "__root__" });
    const projectLanguageDirection = loadedProject.language.direction;

    // The editor's bridge plugin commits here on every update; all consumers
    // read via `workingFilesStore.read()` (or subscribe via the Effect-side
    // `changes` stream).
    const workingFilesStoreRef = useRef<WorkingFilesStore | null>(null);
    if (workingFilesStoreRef.current === null) {
        workingFilesStoreRef.current = new WorkingFilesStore(projectFiles);
    }
    const workingFilesStore = workingFilesStoreRef.current;

    // Workspace-scoped lint snapshot store. Seeded once from the route loader.
    const lintStoreRef = useRef<LintStore | null>(null);
    if (lintStoreRef.current === null) {
        lintStoreRef.current = new LintStore(initialLintErrorsByBook);
    }
    const lintStore = lintStoreRef.current;

    // Workspace-scoped save-lifecycle store. Initial status follows the
    // working files: dirty if any chapter is dirty (e.g., crash-recovery load
    // from cache); clean otherwise.
    const saveStatusStoreRef = useRef<SaveStatusStore | null>(null);
    if (saveStatusStoreRef.current === null) {
        const startsDirty = projectFiles.some((file) =>
            file.chapters.some((chapter) => chapter.dirty),
        );
        saveStatusStoreRef.current = new SaveStatusStore(
            startsDirty ? { kind: "dirty" } : { kind: "clean" },
        );
    }
    const saveStatusStore = saveStatusStoreRef.current;

    // Workspace-scoped layout-tick counter. Overlay/mutation sinks subscribe
    // via `useLayoutTick` and re-measure in `useLayoutEffect`.
    const layoutTickStoreRef = useRef<LayoutTickStore | null>(null);
    if (layoutTickStoreRef.current === null) {
        layoutTickStoreRef.current = new LayoutTickStore();
    }
    const layoutTickStore = layoutTickStoreRef.current;

    // Workspace-scoped search highlight store. Search hooks publish; the
    // mounted `HighlightSink` repaints from it on store change + layout tick.
    const searchHighlightStoreRef = useRef<SearchHighlightStore | null>(null);
    if (searchHighlightStoreRef.current === null) {
        searchHighlightStoreRef.current = new SearchHighlightStore();
    }
    const searchHighlightStore = searchHighlightStoreRef.current;

    // Deferred<LexicalEditor> — resolves once the bridge plugin mounts. The
    // structure pipeline (and future Effect.gen commands like chapter-swap)
    // await this so they don't race the editor reference.
    const mainEditorDeferredRef =
        useRef<Deferred.Deferred<LexicalEditor> | null>(null);
    if (mainEditorDeferredRef.current === null) {
        mainEditorDeferredRef.current = Effect.runSync(
            Deferred.make<LexicalEditor>(),
        );
    }
    const mainEditorDeferred = mainEditorDeferredRef.current;

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
    // Fork the lint pipeline as a workspace-scoped fiber. Subscribes to
    // `workingFilesStore.changes`, debounces, switchMaps to `lintExisting`,
    // writes results into LintStore. See `makeLintPipeline` for the filter.
    useEffect(() => {
        const pipeline = makeLintPipeline({
            workingFilesStore,
            lintStore,
            usfmOnionService,
        });
        const fiber = Effect.runFork(pipeline);
        return () => {
            Effect.runFork(Fiber.interrupt(fiber));
        };
    }, [workingFilesStore, lintStore, usfmOnionService]);

    // Fork the save-status pipeline as a workspace-scoped fiber. Flips
    // SaveStatusStore to `dirty` on every text-changing commit. See
    // `makeSaveStatusPipeline` for the filter.
    useEffect(() => {
        const pipeline = makeSaveStatusPipeline({
            workingFilesStore,
            saveStatusStore,
        });
        const fiber = Effect.runFork(pipeline);
        return () => {
            Effect.runFork(Fiber.interrupt(fiber));
        };
    }, [workingFilesStore, saveStatusStore]);

    // Fork the overlay-tick pipeline. Bumps `LayoutTickStore` once per quiet
    // 16ms after commits settle so overlay sinks can re-measure without each
    // wiring its own MutationObserver. Window-level resize/scroll bumps below
    // cover the non-commit layout signals.
    useEffect(() => {
        const pipeline = makeOverlayTickPipeline({
            workingFilesStore,
            layoutTickStore,
        });
        const fiber = Effect.runFork(pipeline);
        return () => {
            Effect.runFork(Fiber.interrupt(fiber));
        };
    }, [workingFilesStore, layoutTickStore]);

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
    useEffect(() => {
        const pipeline = makeStructureMaintenancePipeline({
            workingFilesStore,
            mainEditorDeferred,
            getAppSettings: () => appSettingsRef.current,
            getVisibleBookCode: () => visibleBookCodeRef.current,
        });
        const fiber = Effect.runFork(pipeline);
        return () => {
            Effect.runFork(Fiber.interrupt(fiber));
        };
    }, [workingFilesStore, mainEditorDeferred]);
    const history = useCustomHistory({
        workingFilesStore,
        editorRef,
        currentFileBibleIdentifier: project.pickedFile.bookCode,
        currentChapter:
            project.pickedChapter?.chapterNumber || project.currentChapter,
    });
    const [remoteStatus, setRemoteStatus] =
        useState<GitRemoteProjectStatus | null>(null);
    const [remoteProjectInfo, setRemoteProjectInfo] =
        useState<GitRemoteProjectInfo | null>(null);
    const [isRefreshingRemoteStatus, setIsRefreshingRemoteStatus] =
        useState(false);
    const save = useSave({
        workingFilesStore,
        saveStatusStore,
        // setWorkingFiles,
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
        onGitRemoteStatusChanged: setRemoteStatus,
        // saveCurrentDirtyLexical: actions.saveCurrentDirtyLexical,
    });

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
        loadedProject,
        currentChapter:
            project.pickedChapter?.chapterNumber || project.currentChapter,
        currentFileBibleIdentifier: project.pickedFile.bookCode,
        setCurrentChapter: project.setCurrentChapter,
        setCurrentFileBibleIdentifier: project.setCurrentFileBibleIdentifier,
        updateAppSettings: project.updateAppSettings,
        appSettings: project.appSettings,
        // workingFiles,
        // setWorkingFiles,
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

    const applyHydratedRemoteResult = useCallback(
        (result: GitRemoteOpenStatusResult) => {
            if (result.kind === GIT_REMOTE_OPEN_STATUS_NOT_LINKED) {
                setRemoteStatus(null);
                setRemoteProjectInfo(null);
                return;
            }
            setRemoteStatus(result.status);
            setRemoteProjectInfo(
                "remoteInfo" in result ? result.remoteInfo : null,
            );
        },
        [],
    );

    const syncRemoteStatus = useCallback(
        async (forceSync = false) => {
            setIsRefreshingRemoteStatus(true);
            try {
                const result = await hydrateGitRemoteStatusOnOpen({
                    projectPath: loadedProject.projectPath,
                    loadedProject,
                    fileSystem,
                    storageRoots,
                    settingsManager,
                    authSessionProvider,
                    gitProvider,
                    forceSync,
                });
                applyHydratedRemoteResult(result);
                return result;
            } finally {
                setIsRefreshingRemoteStatus(false);
            }
        },
        [
            applyHydratedRemoteResult,
            authSessionProvider,
            fileSystem,
            gitProvider,
            loadedProject.projectPath,
            settingsManager,
            storageRoots,
            loadedProject,
        ],
    );

    // Keep lint state in sync after history replay (undo/redo), including
    // entries that touch chapters outside the currently visible editor.
    useEffect(() => {
        void syncRemoteStatus().catch((error) => {
            console.error(
                "Failed to hydrate remote project status on open",
                error,
            );
        });
    }, [syncRemoteStatus]);

    useEffect(() => {
        return history.registerPostUndoRedoAction((event) => {
            void (async () => {
                const touchedBooks = new Set(
                    event.touchedChapters.map((chapter) => chapter.bookCode),
                );
                const currentFiles = workingFilesStore.read();
                const touchedFiles = [...touchedBooks]
                    .map((bookCode) =>
                        currentFiles.find(
                            (candidate) => candidate.bookCode === bookCode,
                        ),
                    )
                    .filter((file): file is ScriptureBookState =>
                        Boolean(file),
                    );

                if (!touchedFiles.length) return;

                const TRACE = import.meta.env.DEV;
                const t0 = TRACE ? performance.now() : 0;
                const lintResultsByBook = await relintBookFiles(
                    touchedFiles,
                    usfmOnionService,
                );
                if (TRACE) {
                    // eslint-disable-next-line no-console
                    console.log(
                        `[history] postUndoRedo relintBookFiles (${touchedFiles.length} book(s)): ${(
                            performance.now() - t0
                        ).toFixed(1)}ms`,
                    );
                }

                for (const file of touchedFiles) {
                    lint.commitBookLintResults({
                        [file.bookCode]: lintResultsByBook[file.bookCode] ?? [],
                    });
                }
            })();
        });
    }, [history, lint, usfmOnionService]);

    function bookCodeToProjectLocalizedTitle({
        bookCode,
        replaceCodeInString,
    }: {
        bookCode: string;
        replaceCodeInString?: string;
    }) {
        const file = loadedProject.books.find(
            (file) => file.bookCode === bookCode,
        );
        if (!file) return bookCode;
        if (replaceCodeInString) {
            return replaceCodeInString.replace(bookCode, file.title);
        }
        return file.title;
    }

    // Replace store state wholesale when the route swaps in a fresh project.
    // No commit event is published — this is a structural reload, not an edit.
    // Subscribers that need to react listen for the route-level load instead.
    useEffect(() => {
        workingFilesStore.reset(projectFiles);
    }, [projectFiles, workingFilesStore]);

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
                    status: remoteStatus,
                    projectInfo: remoteProjectInfo,
                    isRefreshing: isRefreshingRemoteStatus,
                    syncNow: async () => {
                        if (
                            remoteStatus?.kind ===
                            GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH
                        ) {
                            setIsRefreshingRemoteStatus(true);
                            try {
                                const publishResult =
                                    await publishLinkedProjectNow({
                                        projectPath: loadedProject.projectPath,
                                        fileSystem,
                                        storageRoots,
                                        authSessionProvider,
                                        gitProvider,
                                    });
                                if (
                                    publishResult.kind !==
                                    PUBLISH_AFTER_SAVE_PUBLISHED
                                ) {
                                    await syncRemoteStatus(true);
                                    return;
                                }

                                const persistedStatus =
                                    await readGitRemoteProjectStatus({
                                        fileSystem,
                                        storageRoots,
                                        projectPath: loadedProject.projectPath,
                                    });
                                setRemoteStatus(persistedStatus);
                                return;
                            } finally {
                                setIsRefreshingRemoteStatus(false);
                            }
                        }
                        if (
                            (remoteStatus?.kind ===
                                GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE ||
                                remoteStatus?.kind ===
                                    GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW) &&
                            settingsManager.get("autoAcceptIncomingWork")
                        ) {
                            const suppressReviewModal =
                                remoteStatus?.kind ===
                                GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE;
                            const reviewResult = suppressReviewModal
                                ? await save.compare.openRemoteLatestReview({
                                      openModalOnRequiresReview: false,
                                  })
                                : await save.compare.openRemoteLatestReview();
                            const reconciliation =
                                reviewResult?.requiresReconciliationSave;
                            if (reconciliation) {
                                await save.save.saveProjectToDisk({
                                    prepareRemoteBaseForSave: async () => {
                                        await prepareRemoteBaseForReconciliation(
                                            {
                                                projectPath:
                                                    loadedProject.projectPath,
                                                trackedBranch:
                                                    reconciliation.trackedBranch,
                                                remoteHead:
                                                    reconciliation.remoteHead,
                                                relationship:
                                                    reconciliation.relationship,
                                                gitProvider,
                                            },
                                        );
                                    },
                                });
                            }
                            await syncRemoteStatus(true);
                            return;
                        }
                        await syncRemoteStatus(true);
                    },
                    reviewIncoming: async () => {
                        await save.compare.openRemoteLatestReview();
                    },
                },
                projectLanguageDirection,
                isProcessing: project.isProcessing,
                bookCodeToProjectLocalizedTitle,
                workingFilesStore,
                mainEditorDeferred,
                layoutTickStore,
                searchHighlightStore,
            }}
        >
            {children}
        </WorkspaceContext.Provider>
    );
};
