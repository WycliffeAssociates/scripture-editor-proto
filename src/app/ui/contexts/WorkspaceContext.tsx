import { useLoaderData, useRouter } from "@tanstack/react-router";
import type { LexicalEditor } from "lexical";
import { createContext, useCallback, useEffect, useRef, useState } from "react";
import type { SettingsManager } from "@/app/data/settings.ts";
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
     * Single source of live current truth for working-files state. Stage 1A
     * shadow-mirrors `mutWorkingFilesRef`; Stage 1B migrates consumers off the
     * pull-based path; Stage 1C deletes the ref entirely.
     */
    workingFilesStore: WorkingFilesStore;
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

    // Keep a mutable copy for performance intensive operations: It should always end up being "latest", and then we can call setWorkingFiles back to this ref's value after mutations;
    const mutWorkingFilesRef = useRef(projectFiles);

    // Stage 1A: parallel push-based store. The editor's bridge plugin commits
    // here on every update; consumers read via `workingFilesStore.read()`
    // instead of pulling via `saveCurrentDirtyLexical()`.
    const workingFilesStoreRef = useRef<WorkingFilesStore | null>(null);
    if (workingFilesStoreRef.current === null) {
        workingFilesStoreRef.current = new WorkingFilesStore(projectFiles);
    }
    const workingFilesStore = workingFilesStoreRef.current;

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
    const cssStyleSheet = useDynamicStylesheet();
    const project = useWorkspaceState(
        settingsManager,
        projectFiles,
        queryBookOverride,
        queryChapterOverride,
    );
    const history = useCustomHistory({
        mutWorkingFilesRef: mutWorkingFilesRef.current,
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
        mutWorkingFilesRef: mutWorkingFilesRef.current,
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
        initialLintErrorsByBook,
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
        mutWorkingFilesRef: mutWorkingFilesRef.current,
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
                const touchedFiles = [...touchedBooks]
                    .map((bookCode) =>
                        mutWorkingFilesRef.current.find(
                            (candidate) => candidate.bookCode === bookCode,
                        ),
                    )
                    .filter((file): file is ScriptureBookState =>
                        Boolean(file),
                    );

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

    // sync props to state: Be sure all dirty work is saved before navigating away or closing app
    useEffect(() => {
        mutWorkingFilesRef.current = projectFiles;
        // Mirror into the store without publishing a commit event — this is a
        // structural reload, not an edit. Subscribers that need to react to a
        // fresh project listen for the route-level load instead.
        workingFilesStore.reset(projectFiles);
    }, [projectFiles, workingFilesStore]);

    // keep ref in sync when React commits new state
    // useEffect(() => {
    //     // won't fire needlesslely when workingFiles is already set to the value of workingFilesRef.current; only if props changes
    //     mutWorkingFilesRef.current = workingFiles;
    // }, [workingFiles]);
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
                                ? await save.compare.openRemoteLatestReview(
                                      actions.saveCurrentDirtyLexical,
                                      {
                                          openModalOnRequiresReview: false,
                                      },
                                  )
                                : await save.compare.openRemoteLatestReview(
                                      actions.saveCurrentDirtyLexical,
                                  );
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
                        await save.compare.openRemoteLatestReview(
                            actions.saveCurrentDirtyLexical,
                        );
                    },
                },
                projectLanguageDirection,
                isProcessing: project.isProcessing,
                bookCodeToProjectLocalizedTitle,
                workingFilesStore,
            }}
        >
            {children}
        </WorkspaceContext.Provider>
    );
};
