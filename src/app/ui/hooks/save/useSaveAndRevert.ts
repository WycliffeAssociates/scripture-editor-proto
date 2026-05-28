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
    rebaseChapterToCapturedSave,
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
import type { RecoveredConflictTracker } from "@/app/state/RecoveredConflictTracker.ts";
import type { SaveStatusStore } from "@/app/state/SaveStatusStore.ts";
import {
    findChapterInDraft,
    type WorkingFilesStore,
} from "@/app/state/WorkingFilesStore.ts";
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
import { readGitRemoteProjectStatus } from "@/core/persistence/gitRemoteStore.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import {
    type ChapterRef,
    syncEditorToChapter,
    syncEditorToPickedChapter,
} from "./shared.ts";

/**
 * Outcome of a save attempt.
 *
 * `review-required` is returned WITHOUT touching disk when the user has
 * unreviewed recovered conflicts and the caller did not attest review — it is
 * the command-boundary enforcement of forced review, not a UX concern.
 * `partial` carries the books that did persist before a mid-loop failure so the
 * caller knows clean state was only applied to those.
 */
export type SaveResult =
    | { kind: "saved"; persistedBookCodes: string[] }
    | { kind: "partial"; persistedBookCodes: string[]; error: unknown }
    | { kind: "review-required" };

/** Resolve a chapter's text direction the same way `markFilesAsSaved` does. */
function chapterSaveDirection(chapter: ScriptureChapterState): "ltr" | "rtl" {
    const direction =
        chapter.loadedLexicalState.root.direction ??
        chapter.lexicalState.root.direction ??
        "ltr";
    return direction === "rtl" ? "rtl" : "ltr";
}

/**
 * Save/revert hook for the editable scripture workspace.
 *
 * This is the hook that crosses from in-memory scripture state back to managed
 * disk through the loaded project noun, then optionally records a git checkpoint
 * and keeps the diff/history UI aligned with the new saved state.
 */
// todo: wow this is a lot of stuff, should probably be broken up somehow or another. idk what the best way to do that would be though. It's not insanely long file, but a lot of dep here
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

    // todo: this one function is like 350 lines long, which a lot of book keep and rResetting makes sense, but it could probably be contain all the logic it still does, but simply extract functions and decompose so you can read it more like a story of what happens during save.
    async function saveProjectToDisk(options?: {
        prepareRemoteBaseForSave?: () => Promise<void>;
        /**
         * Attestation that the user reviewed (or reverted) their recovered
         * conflicts. Issued ONLY from the local-unsaved-review modal path. When
         * the tracker is non-empty and this is not `true`, the save is refused
         * at the command boundary with `{ kind: "review-required" }`.
         */
        reviewedRecoveredWork?: boolean;
    }): Promise<SaveResult> {
        // Gate is a command precondition: refuse to start a save while a recovery
        // decision is pending (or a save is already in flight). Without this a
        // Cmd+S could persist while the restore banner claims the workspace is
        // blocked.
        if (!requireGateOpen(args.interactionGate.get())) {
            return { kind: "review-required" };
        }

        // Command-boundary forced review: refuse before any disk I/O if the user
        // has unreviewed recovered conflicts and hasn't attested review. UX
        // (modal routing) layers above this; this is the enforcement floor.
        if (
            !args.recoveredConflictTracker.isEmpty() &&
            options?.reviewedRecoveredWork !== true
        ) {
            return { kind: "review-required" };
        }

        // Block other workspace mutation while the save snapshot is in flight.
        args.interactionGate.set({ kind: "saving" });
        try {
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

            // Freeze per-chapter tokens at the SAME synchronous instant the save
            // payload is built (no await in between). The persisted bytes derive
            // from these tokens; rebasing the saved baseline to this capture (not
            // to live `currentTokens`) is what keeps the in-memory "saved" state
            // honest if anything mutates a chapter while the save awaits below.
            const capturedTokensByChapter = new Map<
                string,
                { tokens: ScriptureChapterState["currentTokens"] }
            >();
            for (const file of filesToSave) {
                for (const chapter of file.chapters) {
                    capturedTokensByChapter.set(
                        `${file.bookCode}:${chapter.chapterNumber}`,
                        {
                            tokens: structuredClone(chapter.currentTokens),
                        },
                    );
                }
            }

            let savedVersionHash: string | null = null;

            if (args.isViewingOlderVersion && args.selectedVersionHash) {
                await args.gitProvider.restoreTrackedFilesFromCommit(
                    args.loadedProject.projectPath,
                    args.selectedVersionHash,
                );
            }

            const prepareRemoteBaseForSave =
                options?.prepareRemoteBaseForSave ??
                args.prepareRemoteBaseForSave;
            if (prepareRemoteBaseForSave) {
                await prepareRemoteBaseForSave();
            }

            // Per-book persistence honesty: track which books actually landed on
            // disk (stop-on-first-failure preserved). MD5 is precomputed BEFORE
            // the write so a hashing failure aborts without leaving the baseline
            // claiming bytes that were never written; the baseline is only
            // advanced after the write succeeds.
            let saveError: unknown = null;
            const persistedBooks = new Set<string>();
            for (const action of persistencePlan) {
                let preComputedMd5: string;
                try {
                    preComputedMd5 =
                        await args.workspaceBaselineStore.computeMd5(
                            action.contents,
                        );
                } catch (md5Error) {
                    saveError = md5Error;
                    break;
                }
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
                } catch (writeError) {
                    saveError = writeError;
                    break;
                }
                persistedBooks.add(action.bookCode);
                args.workspaceBaselineStore.setPresent(
                    action.bookCode,
                    preComputedMd5,
                );
            }

            if (saveError) {
                console.error(saveError);
                args.saveStatusStore.setFailed(saveError);
            } else if (Object.keys(toSave).length > 0) {
                showNotificationSuccess({
                    notification: {
                        message: `Saved ${Object.keys(toSave).length} book(s) successfully`,
                        title: "Project Saved",
                    },
                });
                try {
                    const commitAuthor = await resolveGitCommitAuthorForProject(
                        {
                            projectPath: args.loadedProject.projectPath,
                            fileSystem: args.fileSystem,
                            storageRoots: args.storageRoots,
                            authSessionProvider: args.authSessionProvider,
                        },
                    );
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
                    console.error(
                        "Version checkpoint creation failed:",
                        commitErr,
                    );
                    showErrorNotification({
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
                        showErrorNotification({
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

            // Mark clean ONLY the books that actually persisted (0a), rebasing
            // each of their chapters to the captured save tokens (0b). The
            // recovered-conflict tracker is NOT touched here — its subscriber
            // observes these chapters going clean and clears them.
            const refs: ChapterRef[] = [];
            for (const file of args.workingFilesStore.read()) {
                if (!persistedBooks.has(file.bookCode)) continue;
                for (const chapter of file.chapters) {
                    refs.push({
                        bookCode: file.bookCode,
                        chapterNum: chapter.chapterNumber,
                    });
                }
            }
            const draft = args.workingFilesStore.draftWithChapters(refs);
            const rebasedDraft = draft.map((file) => {
                if (!persistedBooks.has(file.bookCode)) return file;
                return {
                    ...file,
                    chapters: file.chapters.map((chapter) => {
                        const captured = capturedTokensByChapter.get(
                            `${file.bookCode}:${chapter.chapterNumber}`,
                        );
                        if (!captured) return chapter;
                        return rebaseChapterToCapturedSave(
                            chapter,
                            captured,
                            chapterSaveDirection(chapter),
                        );
                    }),
                };
            });
            args.workingFilesStore.commit(
                { kind: "bulk", files: rebasedDraft },
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

            return saveError
                ? {
                      kind: "partial",
                      persistedBookCodes: [...persistedBooks],
                      error: saveError,
                  }
                : { kind: "saved", persistedBookCodes: [...persistedBooks] };
        } finally {
            args.interactionGate.set({ kind: "open" });
        }
    }

    async function discardAllChanges() {
        if (!requireGateOpen(args.interactionGate.get())) return;
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
        if (!requireGateOpen(args.interactionGate.get())) return;
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
        if (!requireGateOpen(args.interactionGate.get())) return;
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
        if (!requireGateOpen(args.interactionGate.get())) return;
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
