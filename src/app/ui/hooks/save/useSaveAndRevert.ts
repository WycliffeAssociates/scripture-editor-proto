import type { LexicalEditor } from "lexical";
import type {
    DiffsByChapter,
    ProjectDiff,
} from "@/app/domain/project/diffTypes.ts";
import {
    buildBooksSavePayload,
    markFilesAsSaved,
    revertChapterDiffByBlockId,
    revertChapterToLoadedState,
} from "@/app/domain/project/saveAndRevertService.ts";
import {
    getDirtyFiles,
    listDirtyChapterRefs,
} from "@/app/domain/project/workingFileMutations.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import {
    ShowErrorNotification,
    ShowNotificationSuccess,
} from "@/app/ui/components/primitives/Notifications.tsx";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import { GIT_COMMIT_AUTHOR } from "@/core/persistence/gitConstants.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";
import {
    type ChapterRef,
    revertAllChanges,
    syncEditorToChapter,
} from "./shared.ts";

/**
 * Save/revert hook for the editable scripture workspace.
 *
 * This is the hook that crosses from in-memory scripture state back to managed
 * disk through the loaded project noun, then optionally records a git checkpoint
 * and keeps the diff/history UI aligned with the new saved state.
 */
export function useSaveAndRevert(args: {
    mutWorkingFilesRef: ScriptureBookState[];
    editorRef: React.RefObject<LexicalEditor | null>;
    pickedFile: ScriptureBookState | null;
    pickedChapter: ScriptureChapterState | null;
    loadedProject: Project;
    history: CustomHistoryHook;
    gitProvider: GitProvider;
    usfmOnionService: IUsfmOnionService;
    isViewingOlderVersion: boolean;
    selectedVersionHash: string | null;
    refreshVersions: () => Promise<void>;
    onSavedVersion: (hash: string) => void;
    clearUnsavedDiffs: () => void;
    setUnsavedDiffsByChapter: (next: DiffsByChapter) => void;
    bumpDirtyVersion: () => void;
    refreshUnsavedChapter: (bookCode: string, chapterNum: number) => void;
    rerunCompareForChapters: (chapters: ChapterRef[]) => Promise<void>;
}) {
    const hasUnsavedChanges = args.mutWorkingFilesRef.some((file) =>
        file.chapters.some((chapter) => chapter.dirty),
    );

    async function saveProjectToDisk() {
        const dirtyChapterRefs = listDirtyChapterRefs(
            args.mutWorkingFilesRef,
        ).map(({ bookCode, chapterNum }) => `${bookCode} ${chapterNum}`);
        const filesToSave = getDirtyFiles(args.mutWorkingFilesRef);
        const toSave = buildBooksSavePayload(filesToSave);
        let savedVersionHash: string | null = null;

        if (args.isViewingOlderVersion && args.selectedVersionHash) {
            await args.gitProvider.restoreTrackedFilesFromCommit(
                args.loadedProject.projectPath,
                args.selectedVersionHash,
            );
        }

        let saveError: unknown = null;
        for (const [bookCode, content] of Object.entries(toSave)) {
            try {
                await args.loadedProject.addBook(bookCode, {
                    contents: content,
                });
            } catch (error) {
                saveError = error;
                break;
            }
        }

        if (saveError) {
            console.error(saveError);
        } else if (Object.keys(toSave).length > 0) {
            ShowNotificationSuccess({
                notification: {
                    message: `Saved ${Object.keys(toSave).length} book(s) successfully`,
                    title: "Project Saved",
                },
            });
            try {
                const committed = await args.gitProvider.commitAll(
                    args.loadedProject.projectPath,
                    {
                        op: "save",
                        timestampIso: new Date().toISOString(),
                        changedChapters: dirtyChapterRefs,
                    },
                    GIT_COMMIT_AUTHOR,
                );
                savedVersionHash = committed.hash;
            } catch (commitErr) {
                console.error("Version checkpoint creation failed:", commitErr);
                ShowErrorNotification({
                    notification: {
                        title: "Version History Warning",
                        message:
                            "Your changes were saved, but a local version checkpoint could not be created.",
                    },
                });
            }
            await args.refreshVersions();
            if (savedVersionHash) {
                args.onSavedVersion(savedVersionHash);
            }
        }

        markFilesAsSaved(filesToSave);
        args.clearUnsavedDiffs();
        args.bumpDirtyVersion();
    }

    async function discardAllChanges() {
        revertAllChanges({
            mutWorkingFilesRef: args.mutWorkingFilesRef,
            setDiffsByChapter: args.setUnsavedDiffsByChapter,
            bumpDirtyVersion: args.bumpDirtyVersion,
            pickedFile: args.pickedFile,
            pickedChapter: args.pickedChapter,
            editorRef: args.editorRef,
        });
    }

    function revertDiff(diffToRevert: ProjectDiff) {
        void args.history.runTransaction({
            label: `Revert Change (${diffToRevert.semanticSid})`,
            candidates: [
                {
                    bookCode: diffToRevert.bookCode,
                    chapterNum: diffToRevert.chapterNum,
                },
            ],
            run: async () => {
                const changedChapter = args.mutWorkingFilesRef
                    .find((file) => file.bookCode === diffToRevert.bookCode)
                    ?.chapters.find(
                        (chapter) =>
                            chapter.chapterNumber === diffToRevert.chapterNum,
                    );
                if (!changedChapter) return;

                await revertChapterDiffByBlockId({
                    chapter: changedChapter,
                    diffBlockId: diffToRevert.uniqueKey,
                    usfmOnionService: args.usfmOnionService,
                });
                args.refreshUnsavedChapter(
                    diffToRevert.bookCode,
                    diffToRevert.chapterNum,
                );
                syncEditorToChapter({
                    editorRef: args.editorRef,
                    workingFiles: args.mutWorkingFilesRef,
                    pickedFile: args.pickedFile,
                    pickedChapter: args.pickedChapter,
                    bookCode: diffToRevert.bookCode,
                    chapterNum: diffToRevert.chapterNum,
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
        void args.history.runTransaction({
            label: `Revert Chapter Changes (${bookCode} ${chapterNum})`,
            candidates: [{ bookCode, chapterNum }],
            run: async () => {
                const changedChapter = args.mutWorkingFilesRef
                    .find((file) => file.bookCode === bookCode)
                    ?.chapters.find(
                        (chapter) => chapter.chapterNumber === chapterNum,
                    );
                if (!changedChapter) return;
                revertChapterToLoadedState(changedChapter);
                args.refreshUnsavedChapter(bookCode, chapterNum);
                syncEditorToChapter({
                    editorRef: args.editorRef,
                    workingFiles: args.mutWorkingFilesRef,
                    pickedFile: args.pickedFile,
                    pickedChapter: args.pickedChapter,
                    bookCode,
                    chapterNum,
                });
                await args.rerunCompareForChapters([{ bookCode, chapterNum }]);
            },
        });
    }

    function revertAll() {
        const candidates = args.mutWorkingFilesRef.flatMap((file) =>
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
