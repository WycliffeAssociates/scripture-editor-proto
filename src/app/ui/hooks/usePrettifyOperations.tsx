import { useLingui } from "@lingui/react/macro";
import { useRouter } from "@tanstack/react-router";
import { EDITOR_MODES } from "@/app/data/editor.ts";
import { rebuildParsedFileFromUsfm } from "@/app/domain/editor/services/rebuildParsedFileFromUsfm.ts";
import {
    bookLineEnding,
    inferContentEditorModeFromRootChildren,
    tokensToLexical,
    tokensToUsfm,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { withWorkingFilesDraft } from "@/app/domain/project/workingFileCommand.ts";
import {
    allChapterRefs,
    type ChapterRef,
    chapterRefsForBook,
} from "@/app/domain/project/workingFileMutations.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceGateStore } from "@/app/state/WorkspaceInteractionGate.ts";
import {
    hideNotification,
    showNotificationInfo,
    showNotificationSuccess,
    showProgressNotification,
    updateProgressNotification,
} from "@/app/ui/components/primitives/notifications.ts";
import { relintBookFiles } from "@/app/ui/hooks/linting.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import type { MatchFormattingScope } from "@/core/domain/usfm/matchFormattingByVerseAnchors.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * Higher-level formatting operations for the scripture workspace.
 *
 * These actions sit above the raw formatter/match-formatting engines. They decide
 * which chapters or books are in scope, wrap the mutation in history/lint/update
 * plumbing, and push the resulting lexical state back into the visible editor.
 */
export function useFormatOperations({
    workingFilesStore,
    interactionGate,
    currentFileBibleIdentifier,
    currentChapter,
    setIsProcessing,
    updateDiffMapForChapter,
    commitBookLintResults,
    setEditorContent,
    history,
}: {
    workingFilesStore: WorkingFilesStore;
    interactionGate: WorkspaceGateStore;
    currentFileBibleIdentifier: string;
    currentChapter: number;
    setIsProcessing: (isProcessing: boolean) => void;
    updateDiffMapForChapter: (bookCode: string, chapterNum: number) => void;
    commitBookLintResults: (resultsByBook: Record<string, LintIssue[]>) => void;
    setEditorContent: (
        fileBibleIdentifier: string,
        chapter: number,
        chapterContent: ScriptureChapterState | undefined,
    ) => void;
    history: CustomHistoryHook;
}) {
    const { t } = useLingui();
    const { usfmOnionService } = useRouter().options.context;

    type FormatScope = MatchFormattingScope;
    const refreshLintForFiles = async (files: ScriptureBookState[]) => {
        if (!files.length) return;
        const lintResultsByBook = await relintBookFiles(
            files,
            usfmOnionService,
        );
        commitBookLintResults(lintResultsByBook);
    };

    const chapterTokensForFormatting = (chapter: ScriptureChapterState) =>
        chapter.currentTokens;

    const formatChapterInPlace = async (
        file: ScriptureBookState,
        chapterNum: number,
    ) => {
        const chapter = file.chapters.find(
            (c) => c.chapterNumber === chapterNum,
        );
        if (!chapter) return { changed: false as const };

        const chapterTokens = chapterTokensForFormatting(chapter);
        const [result] = await usfmOnionService.formatScope([
            { tokens: chapterTokens },
        ]);
        if (!result.appliedChanges.length) return { changed: false as const };

        const direction =
            (chapter.lexicalState.root.direction ?? "ltr") === "rtl"
                ? "rtl"
                : "ltr";
        const targetMode = inferContentEditorModeFromRootChildren(
            chapter.lexicalState.root.children,
        );
        // Preserve the chapter's current presentation mode through the format
        // pass; collapsing non-`regular` modes to `flat` would kick form mode
        // into a USFM-shaped state on every Format Chapter run.
        const rebuildMode =
            targetMode === EDITOR_MODES.regular
                ? "regular"
                : targetMode === EDITOR_MODES.form
                  ? "form"
                  : "flat";
        chapter.lexicalState = tokensToLexical({
            tokens: result.tokens,
            direction,
            mode: rebuildMode,
        });
        chapter.currentTokens = result.tokens;
        chapter.dirty =
            tokensToUsfm(result.tokens, chapter.eol) !==
            tokensToUsfm(chapter.sourceTokens, chapter.eol);
        return { changed: true as const };
    };

    const formatBookInPlace = async (file: ScriptureBookState) => {
        const baselineTokens = file.chapters.flatMap((chapter) =>
            chapterTokensForFormatting(chapter),
        );
        const [result] = await usfmOnionService.formatScope([
            { tokens: baselineTokens },
        ]);
        if (!result.appliedChanges.length) return { changed: false as const };

        const nextBookUsfm = tokensToUsfm(result.tokens, bookLineEnding(file));
        await rebuildParsedFileFromUsfm({
            targetFile: file,
            sourceUsfm: nextBookUsfm,
            usfmOnionService,
        });
        return { changed: true as const };
    };

    async function prettify(
        scope: FormatScope,
        bookCode?: string,
        chapterNumber?: number,
    ) {
        setIsProcessing(true);
        let notificationId: string | null = null;
        try {
            // Read the current snapshot once. The bridge plugin keeps the
            // store fresh, so no flush is needed.
            //
            // All scopes go through `withWorkingFilesDraft`: chapter scope uses
            // the per-chapter OVERLAY commit; book and project scope use the
            // WORKSPACE commit because `rebuildParsedFileFromUsfm` replaces a
            // file's `chapters` array wholesale (can add/remove chapters) — a
            // structural rebuild the overlay can't model. See that module.
            const workingFiles = workingFilesStore.read();

            if (scope === "chapter") {
                const targetBookCode = bookCode || currentFileBibleIdentifier;
                const targetChapterNumber = chapterNumber ?? currentChapter;

                const file = workingFiles.find(
                    (f) => f.bookCode === targetBookCode,
                );
                if (!file) return;

                await history.runTransaction({
                    label: t`Format Chapter (${targetBookCode} ${targetChapterNumber})`,
                    candidates: [
                        {
                            bookCode: targetBookCode,
                            chapterNum: targetChapterNumber,
                        },
                    ],
                    run: async () => {
                        // Only the target chapter needs to be writable;
                        // formatChapterInPlace mutates just that chapter's
                        // lexicalState/currentTokens/dirty on the scratch.
                        const outcome = await withWorkingFilesDraft({
                            workingFilesStore,
                            interactionGate,
                            draftRefs: [
                                {
                                    bookCode: targetBookCode,
                                    chapterNum: targetChapterNumber,
                                },
                            ],
                            commitMeta: {
                                kind: "programmaticFix",
                                scope: {
                                    bookCode: targetBookCode,
                                    chapter: targetChapterNumber,
                                },
                                dirtyTextContent: true,
                            },
                            mutate: async (scratch) => {
                                const draftFile = scratch.find(
                                    (f) => f.bookCode === targetBookCode,
                                );
                                if (!draftFile) {
                                    return { affected: [], value: undefined };
                                }
                                const result = await formatChapterInPlace(
                                    draftFile,
                                    targetChapterNumber,
                                );
                                return {
                                    affected: result.changed
                                        ? [
                                              {
                                                  bookCode: targetBookCode,
                                                  chapterNum:
                                                      targetChapterNumber,
                                              },
                                          ]
                                        : [],
                                    value: undefined,
                                };
                            },
                            invalidate: async ({ committedChapters }) => {
                                updateDiffMapForChapter(
                                    currentFileBibleIdentifier,
                                    currentChapter,
                                );
                                const committedChapter = workingFilesStore
                                    .read()
                                    .find((f) => f.bookCode === targetBookCode);
                                if (committedChapter) {
                                    await refreshLintForFiles([
                                        committedChapter,
                                    ]);
                                }
                                if (
                                    targetBookCode ===
                                        currentFileBibleIdentifier &&
                                    targetChapterNumber === currentChapter
                                ) {
                                    const chapter =
                                        committedChapter?.chapters.find(
                                            (c) =>
                                                c.chapterNumber ===
                                                committedChapters[0]
                                                    ?.chapterNum,
                                        );
                                    setEditorContent(
                                        currentFileBibleIdentifier,
                                        currentChapter,
                                        chapter,
                                    );
                                }
                            },
                        });

                        if (outcome.kind === "unchanged") {
                            showNotificationInfo({
                                notification: {
                                    title: t`Nothing changed`,
                                    message: t`This chapter is already formatted`,
                                },
                            });
                            return;
                        }
                        if (outcome.kind === "committed") {
                            showNotificationSuccess({
                                notification: {
                                    title: t`Chapter Formatted`,
                                    message: t`Formatted ${file.title || file.bookCode} ${targetChapterNumber}`,
                                },
                            });
                        }
                    },
                });
                return;
            }

            if (scope === "book") {
                const targetBookCode = bookCode || currentFileBibleIdentifier;

                const file = workingFiles.find(
                    (f) => f.bookCode === targetBookCode,
                );
                if (!file) return;

                await history.runTransaction({
                    label: t`Format Book (${targetBookCode})`,
                    candidates: chapterRefsForBook(file),
                    run: async () => {
                        // formatBookInPlace → rebuildParsedFileFromUsfm replaces
                        // the book's chapters array wholesale, so this is a
                        // workspace-scope (validate-then-bulk) commit, not a
                        // per-chapter overlay.
                        const outcome = await withWorkingFilesDraft({
                            workingFilesStore,
                            interactionGate,
                            scope: "workspace",
                            draftRefs: chapterRefsForBook(file),
                            commitMeta: {
                                kind: "programmaticFix",
                                scope: { project: true },
                                dirtyTextContent: true,
                            },
                            mutate: async (scratch) => {
                                const draftFile = scratch.find(
                                    (f) => f.bookCode === targetBookCode,
                                );
                                if (!draftFile) {
                                    return { affected: [], value: undefined };
                                }
                                const result =
                                    await formatBookInPlace(draftFile);
                                return {
                                    affected: result.changed
                                        ? chapterRefsForBook(draftFile)
                                        : [],
                                    value: undefined,
                                };
                            },
                            invalidate: async () => {
                                const committedFile = workingFilesStore
                                    .read()
                                    .find((f) => f.bookCode === targetBookCode);
                                if (committedFile) {
                                    await refreshLintForFiles([committedFile]);
                                }
                                updateDiffMapForChapter(
                                    currentFileBibleIdentifier,
                                    currentChapter,
                                );
                                if (
                                    targetBookCode ===
                                    currentFileBibleIdentifier
                                ) {
                                    const currentChap =
                                        committedFile?.chapters.find(
                                            (c) =>
                                                c.chapterNumber ===
                                                currentChapter,
                                        );
                                    if (currentChap) {
                                        setEditorContent(
                                            currentFileBibleIdentifier,
                                            currentChapter,
                                            currentChap,
                                        );
                                    }
                                }
                            },
                        });

                        if (outcome.kind === "unchanged") {
                            showNotificationInfo({
                                notification: {
                                    title: t`Nothing changed`,
                                    message: t`This book is already formatted`,
                                },
                            });
                            return;
                        }
                        if (outcome.kind === "committed") {
                            showNotificationSuccess({
                                notification: {
                                    title: t`Book Formatted`,
                                    message: t`Formatted ${file.title || file.bookCode}`,
                                },
                            });
                        }
                    },
                });
                return;
            }

            const totalBooks = workingFiles.length;
            notificationId = showProgressNotification({
                title: t`Formatting Project`,
                message: t`Processing book 1 of ${totalBooks}...`,
            });
            const progressNotificationId = notificationId;
            if (!progressNotificationId) return;

            // The store snapshot is immutable from our side; it is the rollback
            // baseline returned for revertFormat.
            const previous = workingFilesStore.read();
            let currentChapterModified = false;
            let modifiedBooksCount = 0;

            const backup = await history.runTransaction({
                label: t`Format Project`,
                candidates: allChapterRefs(workingFiles),
                run: async () => {
                    // Discovery flow: formatScope returns per-book results; we
                    // don't know which books change until we see appliedChanges.
                    // rebuildParsedFileFromUsfm replaces each touched book's
                    // `chapters` array wholesale → workspace-scope commit.
                    const outcome = await withWorkingFilesDraft({
                        workingFilesStore,
                        interactionGate,
                        scope: "workspace",
                        draftRefs: allChapterRefs(workingFiles),
                        commitMeta: {
                            kind: "programmaticFix",
                            scope: { project: true },
                            dirtyTextContent: true,
                        },
                        mutate: async (filesDraft) => {
                            const affected: ChapterRef[] = [];
                            const batchResults =
                                await usfmOnionService.formatScope(
                                    filesDraft.map((file) => ({
                                        tokens: file.chapters.flatMap(
                                            (chapter) =>
                                                chapterTokensForFormatting(
                                                    chapter,
                                                ),
                                        ),
                                    })),
                                );

                            const modifiedFiles: ScriptureBookState[] = [];
                            for (let i = 0; i < filesDraft.length; i++) {
                                const file = filesDraft[i];
                                const result = batchResults[i];
                                if (!result || !result.appliedChanges.length)
                                    continue;
                                updateProgressNotification(
                                    progressNotificationId,
                                    {
                                        title: t`Formatting Project`,
                                        message: t`Processing ${file.title || file.bookCode} (${i + 1}/${totalBooks})...`,
                                    },
                                );
                                await rebuildParsedFileFromUsfm({
                                    targetFile: file,
                                    sourceUsfm: tokensToUsfm(
                                        result.tokens,
                                        bookLineEnding(file),
                                    ),
                                    usfmOnionService,
                                });
                                modifiedFiles.push(file);
                                affected.push(...chapterRefsForBook(file));
                                if (
                                    file.bookCode === currentFileBibleIdentifier
                                ) {
                                    currentChapterModified = true;
                                }
                            }

                            const modifiedBookCodes = new Set(
                                modifiedFiles.map((file) => file.bookCode),
                            );
                            modifiedBooksCount = filesDraft.filter((f) =>
                                f.chapters.some((c) => c.dirty),
                            ).length;

                            return { affected, value: { modifiedBookCodes } };
                        },
                        invalidate: async ({ value }) => {
                            const committedFiles = workingFilesStore
                                .read()
                                .filter((file) =>
                                    value.modifiedBookCodes.has(file.bookCode),
                                );
                            await refreshLintForFiles(committedFiles);
                            updateDiffMapForChapter(
                                currentFileBibleIdentifier,
                                currentChapter,
                            );
                            if (!currentChapterModified) return;
                            const currentFile = workingFilesStore
                                .read()
                                .find(
                                    (f) =>
                                        f.bookCode ===
                                        currentFileBibleIdentifier,
                                );
                            const currentChap = currentFile?.chapters.find(
                                (c) => c.chapterNumber === currentChapter,
                            );
                            if (currentChap) {
                                setEditorContent(
                                    currentFileBibleIdentifier,
                                    currentChapter,
                                    currentChap,
                                );
                            }
                        },
                    });

                    hideNotification(progressNotificationId);
                    notificationId = null;
                    if (outcome.kind === "committed") {
                        showNotificationSuccess({
                            notification: {
                                title: t`Project Formatted`,
                                message: t`Formatted ${modifiedBooksCount} book(s)`,
                            },
                        });
                    } else if (outcome.kind === "unchanged") {
                        showNotificationInfo({
                            notification: {
                                title: t`Nothing changed`,
                                message: t`This project is already formatted`,
                            },
                        });
                    }
                    return previous;
                },
            });

            return backup;
        } finally {
            if (notificationId) hideNotification(notificationId);
            setIsProcessing(false);
        }
    }

    async function revertFormat(backup: ScriptureBookState[]) {
        workingFilesStore.commit(
            { kind: "bulk", files: backup },
            {
                kind: "undo",
                scope: { project: true },
                dirtyTextContent: true,
            },
        );

        const currentFile = backup.find(
            (f) => f.bookCode === currentFileBibleIdentifier,
        );
        const currentChap = currentFile?.chapters.find(
            (c) => c.chapterNumber === currentChapter,
        );
        if (currentChap) {
            setEditorContent(
                currentFileBibleIdentifier,
                currentChapter,
                currentChap,
            );
        }

        updateDiffMapForChapter(currentFileBibleIdentifier, currentChapter);
    }

    return {
        prettifyChapter: (bookCode?: string, chapterNumber?: number) =>
            prettify("chapter", bookCode, chapterNumber),
        prettifyBook: (bookCode?: string) => prettify("book", bookCode),
        prettifyProject: () => prettify("project"),
        revertFormat,
    };
}
