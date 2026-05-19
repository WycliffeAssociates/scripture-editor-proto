import type { LexicalEditor } from "lexical";
import { useSyncExternalStore } from "react";
import type { SettingsManager } from "@/app/data/settings.ts";
import type {
    DiffsByChapter,
    ProjectDiff,
} from "@/app/domain/project/diffTypes.ts";
import { resolveGitCommitAuthorForProject } from "@/app/domain/project/gitCommitAuthorResolver.ts";
import { publishLinkedProjectAfterSave } from "@/app/domain/project/gitRemotePublishCoordinator.ts";
import {
    BOOK_PERSISTENCE_ACTION_SAVE_EXISTING,
    buildBookPersistencePlan,
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
import type { SaveStatusStore } from "@/app/state/SaveStatusStore.ts";
import {
    findChapterInDraft,
    type WorkingFilesStore,
} from "@/app/state/WorkingFilesStore.ts";
import {
    ShowErrorNotification,
    ShowNotificationSuccess,
} from "@/app/ui/components/primitives/Notifications.tsx";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type { GitRemoteProjectStatus } from "@/core/persistence/gitRemoteModels.ts";
import { readGitRemoteProjectStatus } from "@/core/persistence/gitRemoteStore.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import {
    type ChapterRef,
    syncEditorToChapter,
    syncEditorToPickedChapter,
} from "./shared.ts";

/**
 * Save/revert hook for the editable scripture workspace.
 *
 * This is the hook that crosses from in-memory scripture state back to managed
 * disk through the loaded project noun, then optionally records a git checkpoint
 * and keeps the diff/history UI aligned with the new saved state.
 */
export function useSaveAndRevert(args: {
    workingFilesStore: WorkingFilesStore;
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
    isViewingOlderVersion: boolean;
    selectedVersionHash: string | null;
    refreshVersions: () => Promise<void>;
    onSavedVersion: (hash: string) => void;
    clearUnsavedDiffs: () => void;
    setUnsavedDiffsByChapter: (next: DiffsByChapter) => void;
    bumpDirtyVersion: () => void;
    refreshUnsavedChapter: (bookCode: string, chapterNum: number) => void;
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

    async function saveProjectToDisk(options?: {
        prepareRemoteBaseForSave?: () => Promise<void>;
    }) {
        args.saveStatusStore.setSaving();
        const dirtyChapterRefs = listDirtyChapterRefs(
            args.workingFilesStore.read(),
        ).map(({ bookCode, chapterNum }) => `${bookCode} ${chapterNum}`);
        const filesToSave = getDirtyFiles(args.workingFilesStore.read());
        const toSave = buildBooksSavePayload(filesToSave);
        const persistencePlan = buildBookPersistencePlan({
            existingBooks: args.loadedProject.books,
            payload: toSave,
        });
        let savedVersionHash: string | null = null;

        if (args.isViewingOlderVersion && args.selectedVersionHash) {
            await args.gitProvider.restoreTrackedFilesFromCommit(
                args.loadedProject.projectPath,
                args.selectedVersionHash,
            );
        }

        const prepareRemoteBaseForSave =
            options?.prepareRemoteBaseForSave ?? args.prepareRemoteBaseForSave;
        if (prepareRemoteBaseForSave) {
            await prepareRemoteBaseForSave();
        }

        let saveError: unknown = null;
        for (const action of persistencePlan) {
            try {
                if (action.kind === BOOK_PERSISTENCE_ACTION_SAVE_EXISTING) {
                    await args.loadedProject.saveBook(
                        action.storageKey,
                        action.contents,
                    );
                } else {
                    await args.loadedProject.addBook(action.bookCode, {
                        contents: action.contents,
                    });
                }
            } catch (error) {
                saveError = error;
                break;
            }
        }

        if (saveError) {
            console.error(saveError);
            args.saveStatusStore.setFailed(saveError);
        } else if (Object.keys(toSave).length > 0) {
            ShowNotificationSuccess({
                notification: {
                    message: `Saved ${Object.keys(toSave).length} book(s) successfully`,
                    title: "Project Saved",
                },
            });
            try {
                const commitAuthor = await resolveGitCommitAuthorForProject({
                    projectPath: args.loadedProject.projectPath,
                    fileSystem: args.fileSystem,
                    storageRoots: args.storageRoots,
                    authSessionProvider: args.authSessionProvider,
                });
                const committed = await args.gitProvider.commitAll(
                    args.loadedProject.projectPath,
                    {
                        op: "save",
                        timestampIso: new Date().toISOString(),
                        changedChapters: dirtyChapterRefs,
                    },
                    commitAuthor,
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
            if (savedVersionHash) {
                try {
                    await publishLinkedProjectAfterSave({
                        projectPath: args.loadedProject.projectPath,
                        localHead: savedVersionHash,
                        fileSystem: args.fileSystem,
                        storageRoots: args.storageRoots,
                        settingsManager: args.settingsManager,
                        authSessionProvider: args.authSessionProvider,
                        gitProvider: args.gitProvider,
                    });
                } catch (publishErr) {
                    console.error(
                        "Remote publish after save failed:",
                        publishErr,
                    );
                    ShowErrorNotification({
                        notification: {
                            title: "Cloud Publish Warning",
                            message:
                                "Your changes were saved locally, but publishing to the cloud could not be completed.",
                        },
                    });
                } finally {
                    args.onGitRemoteStatusChanged?.(
                        await readGitRemoteProjectStatus({
                            fileSystem: args.fileSystem,
                            storageRoots: args.storageRoots,
                            projectPath: args.loadedProject.projectPath,
                        }),
                    );
                }
            }
            await args.refreshVersions();
            if (savedVersionHash) {
                args.onSavedVersion(savedVersionHash);
            }
        }

        // Structural-share draft: only the chapters of books we're
        // marking-saved need fresh object identities. markFilesAsSaved
        // walks every chapter of every passed book, so collect all
        // chapter refs for those books up front.
        const savedBookCodes = new Set(filesToSave.map((f) => f.bookCode));
        const refs: ChapterRef[] = [];
        for (const file of args.workingFilesStore.read()) {
            if (!savedBookCodes.has(file.bookCode)) continue;
            for (const chapter of file.chapters) {
                refs.push({
                    bookCode: file.bookCode,
                    chapterNum: chapter.chapterNumber,
                });
            }
        }
        const draft = args.workingFilesStore.draftWithChapters(refs);
        const draftSavedBooks = draft.filter((file) =>
            savedBookCodes.has(file.bookCode),
        );
        markFilesAsSaved(draftSavedBooks);
        args.workingFilesStore.commit(
            { kind: "bulk", files: draft },
            {
                kind: "metadataOnly",
                scope: { project: true },
                dirtyTextContent: false,
            },
        );
        args.clearUnsavedDiffs();
        args.bumpDirtyVersion();
        if (!saveError) {
            args.saveStatusStore.setSaved();
        }
    }

    async function discardAllChanges() {
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
            const chapter = findChapterInDraft(
                draft,
                ref.bookCode,
                ref.chapterNum,
            );
            if (chapter) revertChapterToLoadedState(chapter);
        }
        args.setUnsavedDiffsByChapter({});
        args.bumpDirtyVersion();
        syncEditorToPickedChapter({
            editorRef: args.editorRef,
            workingFiles: draft,
            pickedFile: args.pickedFile,
            pickedChapter: args.pickedChapter,
        });
        args.workingFilesStore.commit(
            { kind: "bulk", files: draft },
            {
                kind: "undo",
                scope: { project: true },
                dirtyTextContent: true,
            },
        );
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
                });
                args.workingFilesStore.commit(
                    {
                        kind: "chapter",
                        bookCode: diffToRevert.bookCode,
                        chapter: diffToRevert.chapterNum,
                        lexicalState: changedChapter.lexicalState,
                    },
                    {
                        kind: "undo",
                        scope: {
                            bookCode: diffToRevert.bookCode,
                            chapter: diffToRevert.chapterNum,
                        },
                        dirtyTextContent: true,
                    },
                );
                args.refreshUnsavedChapter(
                    diffToRevert.bookCode,
                    diffToRevert.chapterNum,
                );
                syncEditorToChapter({
                    editorRef: args.editorRef,
                    workingFiles: draft,
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
                const draft = args.workingFilesStore.draftWithChapters([
                    { bookCode, chapterNum },
                ]);
                const changedChapter = findChapterInDraft(
                    draft,
                    bookCode,
                    chapterNum,
                );
                if (!changedChapter) return;
                revertChapterToLoadedState(changedChapter);
                args.workingFilesStore.commit(
                    {
                        kind: "chapter",
                        bookCode,
                        chapter: chapterNum,
                        lexicalState: changedChapter.lexicalState,
                    },
                    {
                        kind: "undo",
                        scope: { bookCode, chapter: chapterNum },
                        dirtyTextContent: true,
                    },
                );
                args.refreshUnsavedChapter(bookCode, chapterNum);
                syncEditorToChapter({
                    editorRef: args.editorRef,
                    workingFiles: draft,
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
