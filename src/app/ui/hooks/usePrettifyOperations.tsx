import { useLingui } from "@lingui/react/macro";
import type { SerializedLexicalNode } from "lexical";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { serializeToUsfmString } from "@/app/domain/editor/serialization/lexicalToUsfm.ts";
import {
    lexicalRootChildrenToPrettifyTokenStream,
    prettifyTokenStreamToLexicalRootChildren,
} from "@/app/domain/editor/utils/prettifySerializedNode.ts";
import {
    hideNotification,
    ShowNotificationInfo,
    ShowNotificationSuccess,
    showProgressNotification,
    updateProgressNotification,
} from "@/app/ui/components/primitives/Notifications.tsx";
import { prettifyTokenStream } from "@/core/domain/usfm/prettify/prettifyTokenStream.ts";

export type UsePrettifyOperationsHook = ReturnType<
    typeof usePrettifyOperations
>;

export function usePrettifyOperations({
    mutWorkingFilesRef,
    currentFileBibleIdentifier,
    currentChapter,
    setIsProcessing,
    updateDiffMapForChapter,
    setEditorContent,
    saveCurrentDirtyLexical,
}: {
    mutWorkingFilesRef: ParsedFile[];
    currentFileBibleIdentifier: string;
    currentChapter: number;
    setIsProcessing: (isProcessing: boolean) => void;
    updateDiffMapForChapter: (bookCode: string, chapterNum: number) => void;
    setEditorContent: (
        fileBibleIdentifier: string,
        chapter: number,
        chapterContent: ParsedChapter | undefined,
    ) => void;
    saveCurrentDirtyLexical: () => ParsedFile[] | undefined;
}) {
    const { t } = useLingui();

    type PrettifyScope = "chapter" | "book" | "project";

    const prettifyChapterInPlace = (chapter: ParsedChapter) => {
        const originalChildren = chapter.lexicalState.root.children;
        const envelope =
            lexicalRootChildrenToPrettifyTokenStream(originalChildren);
        const nextTokens = prettifyTokenStream(envelope.tokens);
        const nextChildren = prettifyTokenStreamToLexicalRootChildren(
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
        scope: PrettifyScope,
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

                // Bump "unsaved changes" + keep diffs fresh if review modal is open.
                updateDiffMapForChapter(
                    currentFileBibleIdentifier,
                    currentChapter,
                );

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
                        title: t`Chapter Prettified`,
                        message: t`Prettified ${file.title || file.bookCode} ${targetChapterNumber}`,
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

                // Bump "unsaved changes" + keep diffs fresh if review modal is open.
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
                        title: t`Book Prettified`,
                        message: t`Prettified ${file.title || file.bookCode}`,
                    },
                });
                return;
            }

            // scope === "project"
            const totalBooks = mutWorkingFilesRef.length;
            notificationId = showProgressNotification({
                title: t`Prettifying Project`,
                message: t`Processing book 1 of ${totalBooks}...`,
            });

            const backup = structuredClone(mutWorkingFilesRef);
            let currentChapterModified = false;
            let anyModified = false;

            for (let i = 0; i < mutWorkingFilesRef.length; i++) {
                const file = mutWorkingFilesRef[i];

                updateProgressNotification(notificationId, {
                    title: t`Prettifying Project`,
                    message: t`Processing ${file.title || file.bookCode} (${i + 1}/${totalBooks})...`,
                });

                await new Promise<void>((resolve) => {
                    setTimeout(() => {
                        for (const chapter of file.chapters) {
                            const result = prettifyChapterInPlace(chapter);
                            if (result.changed) {
                                anyModified = true;
                                if (
                                    file.bookCode ===
                                        currentFileBibleIdentifier &&
                                    chapter.chapNumber === currentChapter
                                ) {
                                    currentChapterModified = true;
                                }
                            }
                        }
                        resolve();
                    }, 0);
                });
            }

            if (anyModified) {
                // Bump "unsaved changes" + keep diffs fresh if review modal is open.
                updateDiffMapForChapter(
                    currentFileBibleIdentifier,
                    currentChapter,
                );
            } else {
                hideNotification(notificationId);
                notificationId = null;
                ShowNotificationInfo({
                    notification: {
                        title: t`Nothing changed`,
                        message: t`This project is already formatted`,
                    },
                });
                return backup;
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

            hideNotification(notificationId);
            notificationId = null;
            ShowNotificationSuccess({
                notification: {
                    title: t`Project Prettified`,
                    message: t`Prettified ${modifiedBooksCount} book(s)`,
                },
            });

            return backup;
        } finally {
            if (notificationId) hideNotification(notificationId);
            setIsProcessing(false);
        }
    }

    async function revertPrettify(backup: ParsedFile[]) {
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
        revertPrettify,
    };
}
