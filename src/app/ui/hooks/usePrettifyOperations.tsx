import { useLingui } from "@lingui/react/macro";
import type { SerializedLexicalNode } from "lexical";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { serializeToUsfmString } from "@/app/domain/editor/serialization/lexicalToUsfm.ts";
import {
    lexicalRootChildrenToUsfmTokenStream,
    usfmTokenStreamToLexicalRootChildren,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import {
    hideNotification,
    ShowNotificationInfo,
    ShowNotificationSuccess,
    showProgressNotification,
    updateProgressNotification,
} from "@/app/ui/components/primitives/Notifications.tsx";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import { getFlattenedEditorStateAsParseTokens } from "@/app/ui/hooks/utils/editorUtils.ts";
import type { LintError } from "@/core/data/usfm/lint.ts";
import type { MatchFormattingScope } from "@/core/domain/usfm/matchFormattingByVerseAnchors.ts";
import { lintExistingUsfmTokens } from "@/core/domain/usfm/parse.ts";
import { prettifyTokenStream } from "@/core/domain/usfm/prettify/prettifyTokenStream.ts";
import { initParseContext } from "@/core/domain/usfm/tokenParsers.ts";

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
    mutWorkingFilesRef: ParsedFile[];
    currentFileBibleIdentifier: string;
    currentChapter: number;
    setIsProcessing: (isProcessing: boolean) => void;
    updateDiffMapForChapter: (bookCode: string, chapterNum: number) => void;
    replaceLintErrorsForBook: (book: string, newErrors: LintError[]) => void;
    setEditorContent: (
        fileBibleIdentifier: string,
        chapter: number,
        chapterContent: ParsedChapter | undefined,
    ) => void;
    saveCurrentDirtyLexical: () => ParsedFile[] | undefined;
    history: CustomHistoryHook;
}) {
    const { t } = useLingui();

    type FormatScope = MatchFormattingScope;
    const toChapterRefs = (file: ParsedFile) =>
        file.chapters.map((chapter) => ({
            bookCode: file.bookCode,
            chapterNum: chapter.chapNumber,
        }));

    const allChapterRefs = () =>
        mutWorkingFilesRef.flatMap((file) => toChapterRefs(file));

    const refreshLintForFile = (file: ParsedFile) => {
        const fileTokens = file.chapters.flatMap((chapter) =>
            getFlattenedEditorStateAsParseTokens(chapter.lexicalState),
        );
        const ctx = initParseContext(fileTokens);
        const allErrors = lintExistingUsfmTokens(fileTokens, ctx);
        replaceLintErrorsForBook(file.bookCode, allErrors);
    };

    const prettifyChapterInPlace = (chapter: ParsedChapter) => {
        const originalChildren = chapter.lexicalState.root.children;
        const envelope = lexicalRootChildrenToUsfmTokenStream(originalChildren);
        const nextTokens = prettifyTokenStream(envelope.tokens);
        const nextChildren = usfmTokenStreamToLexicalRootChildren(
            nextTokens,
            envelope,
        );

        const changed =
            JSON.stringify(originalChildren) !== JSON.stringify(nextChildren);
        if (!changed) return { changed: false as const };

        const afterUsfm = serializeToUsfmString(nextChildren);
        const baselineUsfm = serializeToUsfmString(
            chapter.loadedLexicalState.root.children as SerializedLexicalNode[],
        );

        chapter.lexicalState.root.children = nextChildren;
        chapter.dirty = afterUsfm !== baselineUsfm;

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
                        const chapter = file.chapters.find(
                            (c) => c.chapNumber === targetChapterNumber,
                        );
                        if (!chapter) return;

                        const result = prettifyChapterInPlace(chapter);

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
                        refreshLintForFile(file);

                        if (
                            file.bookCode === currentFileBibleIdentifier &&
                            chapter.chapNumber === currentChapter
                        ) {
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
                        let currentChapterModified = false;
                        let anyModified = false;

                        for (const chapter of file.chapters) {
                            const result = prettifyChapterInPlace(chapter);
                            if (!result.changed) continue;

                            anyModified = true;
                            if (
                                file.bookCode === currentFileBibleIdentifier &&
                                chapter.chapNumber === currentChapter
                            ) {
                                currentChapterModified = true;
                            }
                        }

                        if (!anyModified) {
                            ShowNotificationInfo({
                                notification: {
                                    title: t`Nothing changed`,
                                    message: t`This book is already formatted`,
                                },
                            });
                            return;
                        }

                        refreshLintForFile(file);
                        updateDiffMapForChapter(
                            currentFileBibleIdentifier,
                            currentChapter,
                        );

                        if (currentChapterModified) {
                            const currentChap = file.chapters.find(
                                (c) => c.chapNumber === currentChapter,
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

            // scope === "project"
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

                    for (let i = 0; i < mutWorkingFilesRef.length; i++) {
                        const file = mutWorkingFilesRef[i];

                        updateProgressNotification(progressNotificationId, {
                            title: t`Formatting Project`,
                            message: t`Processing ${file.title || file.bookCode} (${i + 1}/${totalBooks})...`,
                        });

                        await new Promise<void>((resolve) => {
                            setTimeout(() => {
                                let fileModified = false;
                                for (const chapter of file.chapters) {
                                    const result =
                                        prettifyChapterInPlace(chapter);
                                    if (result.changed) {
                                        anyModified = true;
                                        fileModified = true;
                                        if (
                                            file.bookCode ===
                                                currentFileBibleIdentifier &&
                                            chapter.chapNumber ===
                                                currentChapter
                                        ) {
                                            currentChapterModified = true;
                                        }
                                    }
                                }
                                if (fileModified) {
                                    refreshLintForFile(file);
                                }
                                resolve();
                            }, 0);
                        });
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
                            (c) => c.chapNumber === currentChapter,
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

    async function revertFormat(backup: ParsedFile[]) {
        mutWorkingFilesRef.length = 0;
        mutWorkingFilesRef.push(...backup);

        const currentFile = mutWorkingFilesRef.find(
            (f) => f.bookCode === currentFileBibleIdentifier,
        );
        const currentChap = currentFile?.chapters.find(
            (c) => c.chapNumber === currentChapter,
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
