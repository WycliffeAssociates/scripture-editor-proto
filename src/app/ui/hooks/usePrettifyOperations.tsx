import { useLingui } from "@lingui/react/macro";
import { useRouter } from "@tanstack/react-router";
import { EDITOR_MODES } from "@/app/data/editor.ts";
import { rebuildParsedFileFromUsfm } from "@/app/domain/editor/services/rebuildParsedFileFromUsfm.ts";
import {
    inferContentEditorModeFromRootChildren,
    tokensToLexical,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import {
    hideNotification,
    ShowNotificationInfo,
    ShowNotificationSuccess,
    showProgressNotification,
    updateProgressNotification,
} from "@/app/ui/components/primitives/Notifications.tsx";
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
    mutWorkingFilesRef,
    currentFileBibleIdentifier,
    currentChapter,
    setIsProcessing,
    updateDiffMapForChapter,
    replaceLintErrorsForBook,
    setEditorContent,
    saveCurrentDirtyLexical,
    history,
}: {
    mutWorkingFilesRef: ScriptureBookState[];
    currentFileBibleIdentifier: string;
    currentChapter: number;
    setIsProcessing: (isProcessing: boolean) => void;
    updateDiffMapForChapter: (bookCode: string, chapterNum: number) => void;
    replaceLintErrorsForBook: (book: string, newErrors: LintIssue[]) => void;
    setEditorContent: (
        fileBibleIdentifier: string,
        chapter: number,
        chapterContent: ScriptureChapterState | undefined,
    ) => void;
    saveCurrentDirtyLexical: () => ScriptureBookState[] | undefined;
    history: CustomHistoryHook;
}) {
    const { t } = useLingui();
    const { usfmOnionService } = useRouter().options.context;

    type FormatScope = MatchFormattingScope;
    const toChapterRefs = (file: ScriptureBookState) =>
        file.chapters.map((chapter) => ({
            bookCode: file.bookCode,
            chapterNum: chapter.chapterNumber,
        }));

    const allChapterRefs = () =>
        mutWorkingFilesRef.flatMap((file) => toChapterRefs(file));

    const refreshLintForFiles = async (files: ScriptureBookState[]) => {
        if (!files.length) return;
        const lintResultsByBook = await relintBookFiles(
            files,
            usfmOnionService,
        );
        for (const file of files) {
            replaceLintErrorsForBook(
                file.bookCode,
                lintResultsByBook[file.bookCode] ?? [],
            );
        }
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
        const [result] = await usfmOnionService.formatScope(
            [{ tokens: chapterTokens }],
            {
                formatOptions: {},
            },
        );
        if (!result.appliedChanges.length) return { changed: false as const };

        const direction =
            (chapter.lexicalState.root.direction ?? "ltr") === "rtl"
                ? "rtl"
                : "ltr";
        const targetMode = inferContentEditorModeFromRootChildren(
            chapter.lexicalState.root.children,
        );
        chapter.lexicalState = tokensToLexical({
            tokens: result.tokens,
            direction,
            mode: targetMode === EDITOR_MODES.regular ? "regular" : "flat",
        });
        chapter.currentTokens = result.tokens;
        chapter.dirty =
            result.tokens.map((token) => token.text).join("") !==
            chapter.sourceTokens.map((token) => token.text).join("");
        return { changed: true as const };
    };

    const formatBookInPlace = async (file: ScriptureBookState) => {
        const baselineTokens = file.chapters.flatMap((chapter) =>
            chapterTokensForFormatting(chapter),
        );
        const [result] = await usfmOnionService.formatScope(
            [{ tokens: baselineTokens }],
            {
                formatOptions: {},
            },
        );
        if (!result.appliedChanges.length) return { changed: false as const };

        const nextBookUsfm = result.tokens.map((token) => token.text).join("");
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
            saveCurrentDirtyLexical();

            if (scope === "chapter") {
                const targetBookCode = bookCode || currentFileBibleIdentifier;
                const targetChapterNumber = chapterNumber ?? currentChapter;

                const file = mutWorkingFilesRef.find(
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
                        const result = await formatChapterInPlace(
                            file,
                            targetChapterNumber,
                        );

                        if (!result.changed) {
                            ShowNotificationInfo({
                                notification: {
                                    title: t`Nothing changed`,
                                    message: t`This chapter is already formatted`,
                                },
                            });
                            return;
                        }

                        updateDiffMapForChapter(
                            currentFileBibleIdentifier,
                            currentChapter,
                        );
                        await refreshLintForFiles([file]);

                        if (
                            file.bookCode === currentFileBibleIdentifier &&
                            targetChapterNumber === currentChapter
                        ) {
                            const chapter = file.chapters.find(
                                (c) => c.chapterNumber === targetChapterNumber,
                            );
                            if (!chapter) return;
                            setEditorContent(
                                currentFileBibleIdentifier,
                                currentChapter,
                                chapter,
                            );
                        }

                        ShowNotificationSuccess({
                            notification: {
                                title: t`Chapter Formatted`,
                                message: t`Formatted ${file.title || file.bookCode} ${targetChapterNumber}`,
                            },
                        });
                    },
                });
                return;
            }

            if (scope === "book") {
                const targetBookCode = bookCode || currentFileBibleIdentifier;

                const file = mutWorkingFilesRef.find(
                    (f) => f.bookCode === targetBookCode,
                );
                if (!file) return;

                await history.runTransaction({
                    label: t`Format Book (${targetBookCode})`,
                    candidates: toChapterRefs(file),
                    run: async () => {
                        const result = await formatBookInPlace(file);
                        if (!result.changed) {
                            ShowNotificationInfo({
                                notification: {
                                    title: t`Nothing changed`,
                                    message: t`This book is already formatted`,
                                },
                            });
                            return;
                        }

                        await refreshLintForFiles([file]);
                        updateDiffMapForChapter(
                            currentFileBibleIdentifier,
                            currentChapter,
                        );

                        if (file.bookCode === currentFileBibleIdentifier) {
                            const currentChap = file.chapters.find(
                                (c) => c.chapterNumber === currentChapter,
                            );

                            if (currentChap) {
                                setEditorContent(
                                    currentFileBibleIdentifier,
                                    currentChapter,
                                    currentChap,
                                );
                            }
                        }

                        ShowNotificationSuccess({
                            notification: {
                                title: t`Book Formatted`,
                                message: t`Formatted ${file.title || file.bookCode}`,
                            },
                        });
                    },
                });
                return;
            }

            const totalBooks = mutWorkingFilesRef.length;
            notificationId = showProgressNotification({
                title: t`Formatting Project`,
                message: t`Processing book 1 of ${totalBooks}...`,
            });
            const progressNotificationId = notificationId;
            if (!progressNotificationId) return;

            const backup = await history.runTransaction({
                label: t`Format Project`,
                candidates: allChapterRefs(),
                run: async () => {
                    const previous = structuredClone(mutWorkingFilesRef);
                    let currentChapterModified = false;
                    let anyModified = false;

                    const batchResults = await usfmOnionService.formatScope(
                        mutWorkingFilesRef.map((file) => ({
                            tokens: file.chapters.flatMap((chapter) =>
                                chapterTokensForFormatting(chapter),
                            ),
                        })),
                        {
                            formatOptions: {},
                        },
                    );

                    const modifiedFiles: ScriptureBookState[] = [];
                    for (let i = 0; i < mutWorkingFilesRef.length; i++) {
                        const file = mutWorkingFilesRef[i];
                        const result = batchResults[i];
                        if (!result || !result.appliedChanges.length) continue;

                        updateProgressNotification(progressNotificationId, {
                            title: t`Formatting Project`,
                            message: t`Processing ${file.title || file.bookCode} (${i + 1}/${totalBooks})...`,
                        });

                        const nextBookUsfm = result.tokens
                            .map((token) => token.text)
                            .join("");
                        await rebuildParsedFileFromUsfm({
                            targetFile: file,
                            sourceUsfm: nextBookUsfm,
                            usfmOnionService,
                        });
                        anyModified = true;
                        modifiedFiles.push(file);
                        if (file.bookCode === currentFileBibleIdentifier) {
                            currentChapterModified = true;
                        }
                    }

                    if (modifiedFiles.length > 0) {
                        await refreshLintForFiles(modifiedFiles);
                    }

                    if (anyModified) {
                        updateDiffMapForChapter(
                            currentFileBibleIdentifier,
                            currentChapter,
                        );
                    } else {
                        hideNotification(progressNotificationId);
                        notificationId = null;
                        ShowNotificationInfo({
                            notification: {
                                title: t`Nothing changed`,
                                message: t`This project is already formatted`,
                            },
                        });
                        return previous;
                    }

                    const modifiedBooksCount = mutWorkingFilesRef.filter((f) =>
                        f.chapters.some((c) => c.dirty),
                    ).length;

                    if (currentChapterModified) {
                        const currentFile = mutWorkingFilesRef.find(
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
                    }

                    hideNotification(progressNotificationId);
                    notificationId = null;
                    ShowNotificationSuccess({
                        notification: {
                            title: t`Project Formatted`,
                            message: t`Formatted ${modifiedBooksCount} book(s)`,
                        },
                    });

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
        mutWorkingFilesRef.length = 0;
        mutWorkingFilesRef.push(...backup);

        const currentFile = mutWorkingFilesRef.find(
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
