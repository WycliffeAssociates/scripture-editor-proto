import { useRouter } from "@tanstack/react-router";
import type { LexicalEditor } from "lexical";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EditorModeSetting } from "@/app/data/editor.ts";
import { prepareRemoteBaseForReconciliation } from "@/app/domain/project/prepareRemoteBaseForReconciliation.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import { useDiffModalState } from "@/app/ui/hooks/save/useDiffModalState.ts";
import { useExternalCompare } from "@/app/ui/hooks/save/useExternalCompare.ts";
import { useSaveAndRevert } from "@/app/ui/hooks/save/useSaveAndRevert.ts";
import { useVersionHistory } from "@/app/ui/hooks/save/useVersionHistory.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import { flattenDiffMap } from "@/core/domain/usfm/usfmOnionDiffMap.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type { GitRemoteProjectStatus } from "@/core/persistence/gitRemoteModels.ts";
import type {
    Project,
    ProjectListItem,
} from "@/core/persistence/ScriptureWorkspace.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import type {
    OpenProjectService,
    ReadOnlyOpenProjectService,
} from "@/core/persistence/WorkspaceService.ts";

type UseSaveProps = {
    mutWorkingFilesRef: ScriptureBookState[];
    editorRef: React.RefObject<LexicalEditor | null>;
    pickedFile: ScriptureBookState | null;
    pickedChapter: ScriptureChapterState | null;
    loadedProject: Project;
    history: CustomHistoryHook;
    projectsService: OpenProjectService & ReadOnlyOpenProjectService;
    fileSystem: FileSystem;
    storageRoots: StorageRoots;
    gitProvider: GitProvider;
    editorMode: EditorModeSetting;
    allProjects: ProjectListItem[];
    currentProjectRoute: string;
    onGitRemoteStatusChanged?: (status: GitRemoteProjectStatus | null) => void;
};

export type UseSaveReturn = ReturnType<typeof useSave>;

/**
 * Compose the save/revert/version/compare flows for the current scripture
 * workspace.
 *
 * This hook is the save-domain orchestrator for the editor screen. It does not
 * perform the low-level work itself; instead it coordinates the narrower hooks
 * that own diff calculation, version history, compare baselines, and save /
 * revert execution.
 */
export function useSave({
    mutWorkingFilesRef,
    editorRef,
    pickedFile,
    pickedChapter,
    loadedProject,
    history,
    projectsService,
    fileSystem,
    storageRoots,
    gitProvider,
    editorMode,
    allProjects,
    currentProjectRoute,
    onGitRemoteStatusChanged,
}: UseSaveProps) {
    const { usfmOnionService, settingsManager, authSessionProvider } =
        useRouter().options.context;
    const [, setDirtyVersion] = useState(0);
    const saveCurrentDirtyRef = useRef<(() => void) | null>(null);
    const refreshUnsavedChaptersRef = useRef<
        (
            chapters: Array<{ bookCode: string; chapterNum: number }>,
        ) => Promise<void>
    >(async () => {
        bumpDirtyVersion();
    });

    /**
     * Lightweight invalidation knob for memoized derived save/diff state.
     */
    const bumpDirtyVersion = () => setDirtyVersion((value) => value + 1);

    const versions = useVersionHistory({
        loadedProject,
        gitProvider,
        mutWorkingFilesRef,
        pickedFile,
        pickedChapter,
        editorRef,
        history,
        editorMode,
        usfmOnionService,
        bumpDirtyVersion,
    });

    const compare = useExternalCompare({
        mutWorkingFilesRef,
        loadedProject,
        projectsService,
        fileSystem,
        storageRoots,
        editorMode,
        usfmOnionService,
        allProjects,
        currentProjectRoute,
        pickedFile,
        pickedChapter,
        editorRef,
        history,
        gitProvider,
        versions: versions.state.entries,
        authSessionProvider,
        bumpDirtyVersion,
        refreshUnsavedChapters: (chapters) =>
            refreshUnsavedChaptersRef.current(chapters),
        onGitRemoteStatusChanged,
    });

    const diff = useDiffModalState({
        mutWorkingFilesRef,
        usfmOnionService,
        ensureVersionsLoaded: versions.actions.ensureLoaded,
        closeVersions: versions.actions.close,
        closeCompare: compare.actions.reset,
        bumpDirtyVersion,
    });
    refreshUnsavedChaptersRef.current = diff.actions.refreshChapters;

    const saveAndRevert = useSaveAndRevert({
        mutWorkingFilesRef,
        editorRef,
        pickedFile,
        pickedChapter,
        loadedProject,
        history,
        gitProvider,
        settingsManager,
        authSessionProvider,
        fileSystem,
        storageRoots,
        usfmOnionService,
        isViewingOlderVersion: versions.state.isViewingOlderVersion,
        selectedVersionHash: versions.state.selectedHash,
        refreshVersions: versions.actions.refresh,
        onSavedVersion: (hash) => {
            versions.actions.setLatestHash(hash);
            versions.actions.setSelectedHash(hash);
        },
        clearUnsavedDiffs: diff.actions.resetUnsavedDiffs,
        setUnsavedDiffsByChapter: diff.actions.setUnsavedDiffsByChapter,
        bumpDirtyVersion,
        refreshUnsavedChapter: diff.actions.refreshChapter,
        rerunCompareForChapters: compare.actions.rerunForChapters,
        onGitRemoteStatusChanged,
        prepareRemoteBaseForSave: (() => {
            const pendingRemotePartialReconciliation =
                compare.state.pendingRemotePartialReconciliation;
            if (!pendingRemotePartialReconciliation) {
                return undefined;
            }
            return async () => {
                await prepareRemoteBaseForReconciliation({
                    projectPath: loadedProject.projectPath,
                    trackedBranch:
                        pendingRemotePartialReconciliation.trackedBranch,
                    remoteHead: pendingRemotePartialReconciliation.remoteHead,
                    relationship:
                        pendingRemotePartialReconciliation.relationship,
                    gitProvider,
                });
            };
        })(),
    });

    const activeDiffsByChapter = useMemo(() => {
        if (compare.state.mode === "external" && compare.state.diffsByChapter) {
            return compare.state.diffsByChapter;
        }
        return diff.state.diffsByChapter;
    }, [
        compare.state.diffsByChapter,
        compare.state.mode,
        diff.state.diffsByChapter,
    ]);

    const diffs = useMemo(() => {
        if (compare.state.mode !== "external") {
            return diff.state.diffs;
        }
        return flattenDiffMap({
            diffsByChapter: activeDiffsByChapter,
            include: (currentDiff) => currentDiff.status !== "unchanged",
        });
    }, [activeDiffsByChapter, compare.state.mode, diff.state.diffs]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!saveAndRevert.state.hasUnsavedChanges) return;

        const handler = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [saveAndRevert.state.hasUnsavedChanges]);

    /**
     * Open the save-review modal after first snapshotting the live editor into
     * workspace state.
     */
    const saveReview = {
        open: async (saveCurrentDirtyLexical: () => void) => {
            await diff.actions.open(saveCurrentDirtyLexical);
        },
    };

    const versionHistory = {
        isOpen: versions.state.isOpen,
        entries: versions.state.entries,
        isLoading: versions.state.isLoading,
        selectedHash: versions.state.selectedHash,
        latestHash: versions.state.latestHash,
        isViewingOlderVersion: versions.state.isViewingOlderVersion,
        open: async (saveCurrentDirtyLexical: () => void) => {
            saveCurrentDirtyRef.current = saveCurrentDirtyLexical;
            await versions.actions.open({
                saveCurrentDirtyLexical,
                hasUnsavedChanges: saveAndRevert.state.hasUnsavedChanges,
            });
        },
        close: versions.actions.close,
        loadMore: versions.actions.loadMore,
        select: async (hash: string, saveCurrentDirtyLexical: () => void) => {
            saveCurrentDirtyRef.current = saveCurrentDirtyLexical;
            await versions.actions.select({
                hash,
                saveCurrentDirtyLexical,
                hasUnsavedChanges: saveAndRevert.state.hasUnsavedChanges,
            });
        },
        backToLatest: async (saveCurrentDirtyLexical: () => void) => {
            saveCurrentDirtyRef.current = saveCurrentDirtyLexical;
            await versions.actions.backToLatest({
                saveCurrentDirtyLexical,
                hasUnsavedChanges: saveAndRevert.state.hasUnsavedChanges,
            });
        },
        dirtyPrompt: {
            isOpen: versions.state.isDirtyPromptOpen,
            dismiss: versions.actions.dismissDirtyPrompt,
            discardAndContinue: async () => {
                await versions.actions.discardAndContinue(
                    saveAndRevert.actions.discardAllChanges,
                );
            },
            saveAndContinue: () => {
                versions.actions.saveAndContinue(() => {
                    const saveCurrentDirtyLexical = saveCurrentDirtyRef.current;
                    if (!saveCurrentDirtyLexical) return;
                    void diff.actions.open(saveCurrentDirtyLexical);
                });
            },
        },
    };

    const openRemoteLatestReview = async (
        saveCurrentDirtyLexical: () => void,
    ) =>
        compare.actions.openRemoteLatestReview(
            saveCurrentDirtyLexical,
            diff.actions.open,
            diff.state.isOpen,
        );

    return {
        diff: {
            isOpen: diff.state.isOpen,
            isCalculating:
                diff.state.isCalculating || compare.state.isCalculating,
            diffs,
            diffsByChapter: activeDiffsByChapter,
            open: saveReview.open,
            close: diff.actions.close,
            refreshChapter: diff.actions.refreshChapter,
            refreshChapters: diff.actions.refreshChapters,
        },
        save: {
            saveProjectToDisk: saveAndRevert.actions.saveProjectToDisk,
            hasUnsavedChanges: saveAndRevert.state.hasUnsavedChanges,
        },
        revert: {
            diff: saveAndRevert.actions.revertDiff,
            chapter: saveAndRevert.actions.revertChapter,
            all: saveAndRevert.actions.revertAll,
        },
        versions: versionHistory,
        compare: {
            mode: compare.state.mode,
            setMode: compare.actions.setMode,
            sourceKind: compare.state.sourceKind,
            setSourceKind: compare.actions.setSourceKind,
            sourceProjectId: compare.state.sourceProjectId,
            setSourceProjectId: compare.actions.setSourceProjectId,
            sourceVersionHash: compare.state.sourceVersionHash,
            setSourceVersionHash: compare.actions.setSourceVersionHash,
            availableProjects: compare.state.availableProjects,
            versionOptions: compare.state.versionOptions,
            warnings: compare.state.warnings,
            hasComputed: compare.state.hasComputed,
            refresh: compare.actions.refresh,
            reset: compare.actions.reset,
            loadFromProject: compare.actions.loadFromProject,
            loadFromZip: compare.actions.loadFromZip,
            loadFromDirectory: compare.actions.loadFromDirectory,
            loadFromVersion: compare.actions.loadFromVersion,
            loadFromRemoteLatest: compare.actions.loadFromRemoteLatest,
            openRemoteLatestReview,
            applyIncomingHunk: compare.actions.applyIncomingHunk,
            applyIncomingChapter: compare.actions.applyIncomingChapter,
            applyIncomingAll: compare.actions.applyIncomingAll,
        },
    };
}
