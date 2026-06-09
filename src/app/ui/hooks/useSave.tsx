import { useRouter } from "@tanstack/react-router";
import type { LexicalEditor } from "lexical";
import { useEffect, useMemo, useState } from "react";
import type { EditorModeSetting } from "@/app/data/editor.ts";
import { prepareRemoteBaseForReconciliation } from "@/app/domain/project/prepareRemoteBaseForReconciliation.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { RecoveredConflictTracker } from "@/app/state/RecoveredConflictTracker.ts";
import type { SaveStatusStore } from "@/app/state/SaveStatusStore.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";
import type { WorkspaceGateStore } from "@/app/state/WorkspaceInteractionGate.ts";
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

// todo: a lot of props. Wonder if fine or opportunities to either encapsulate or compose or break apart one? That said, there is already a a comment how we've extract quite a bit of the lower level logic into smaller hooks, so idk.
type UseSaveProps = {
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
    workingFilesStore,
    workspaceBaselineStore,
    recoveredConflictTracker,
    interactionGate,
    saveStatusStore,
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

    /**
     * Lightweight invalidation knob for memoized derived save/diff state.
     */
    const bumpDirtyVersion = () => setDirtyVersion((value) => value + 1);

    const versions = useVersionHistory({
        loadedProject,
        gitProvider,
        workingFilesStore,
        interactionGate,
        pickedFile,
        pickedChapter,
        editorRef,
        history,
        editorMode,
        usfmOnionService,
        bumpDirtyVersion,
    });

    const compare = useExternalCompare({
        workingFilesStore,
        recoveredConflictTracker,
        interactionGate,
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
        autoAcceptIncomingWork: settingsManager.get("autoAcceptIncomingWork"),
        bumpDirtyVersion,
        onGitRemoteStatusChanged,
    });

    const diff = useDiffModalState({
        workingFilesStore,
        usfmOnionService,
        ensureVersionsLoaded: versions.actions.ensureLoaded,
        closeVersions: versions.actions.close,
        closeCompare: compare.actions.reset,
    });

    const saveAndRevert = useSaveAndRevert({
        workingFilesStore,
        workspaceBaselineStore,
        recoveredConflictTracker,
        interactionGate,
        saveStatusStore,
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
        editorMode,
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
        open: async () => {
            // Force the review modal when recovered conflicts are unresolved,
            // even with auto-accept on — the user must review their recovered
            // work before it persists. Otherwise auto-accept saves directly.
            if (
                settingsManager.get("autoAcceptOwnWorkOnSave") &&
                recoveredConflictTracker.isEmpty()
            ) {
                await saveAndRevert.actions.saveProjectToDisk({
                    reviewedRecoveredWork: true,
                });
                return;
            }
            await diff.actions.open();
        },
    };

    // The local-unsaved-review modal's Save action. This — and only this — path
    // attests that the user reviewed their recovered work. External-compare's
    // save (reachable only when the tracker is empty) uses the un-attested
    // `saveProjectToDisk` so a generic attestation can't leak through the shared
    // modal.

    const saveReviewedWork = () =>
        saveAndRevert.actions.saveProjectToDisk({
            reviewedRecoveredWork: true,
        });

    const versionHistory = {
        isOpen: versions.state.isOpen,
        entries: versions.state.entries,
        isLoading: versions.state.isLoading,
        isSwitching: versions.state.isSwitchingVersion,
        selectedHash: versions.state.selectedHash,
        latestHash: versions.state.latestHash,
        isViewingOlderVersion: versions.state.isViewingOlderVersion,
        open: async () => {
            await versions.actions.open({
                hasUnsavedChanges: saveAndRevert.state.hasUnsavedChanges,
            });
        },
        close: versions.actions.close,
        ensureLoaded: versions.actions.ensureLoaded,
        loadMore: versions.actions.loadMore,
        select: async (hash: string) => {
            await versions.actions.select({
                hash,
                hasUnsavedChanges: saveAndRevert.state.hasUnsavedChanges,
            });
        },
        backToLatest: async () => {
            await versions.actions.backToLatest({
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
                    void diff.actions.open();
                });
            },
        },
    };

    const openRemoteLatestReview = async (options?: {
        openModalOnRequiresReview?: boolean;
    }) =>
        compare.actions.openRemoteLatestReview(
            diff.actions.open,
            diff.state.isOpen,
            options,
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
        },
        save: {
            saveProjectToDisk: saveAndRevert.actions.saveProjectToDisk,
            saveReviewedWork,
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
            loadFromRemoteLatest: async () => {
                await compare.actions.loadFromRemoteLatest();
            },
            openRemoteLatestReview,
            applyIncomingHunk: compare.actions.applyIncomingHunk,
            applyIncomingChapter: compare.actions.applyIncomingChapter,
            applyIncomingAll: compare.actions.applyIncomingAll,
        },
    };
}
