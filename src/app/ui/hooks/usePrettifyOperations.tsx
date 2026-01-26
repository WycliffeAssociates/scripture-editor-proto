import { useLingui } from "@lingui/react/macro";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { applyPrettifyToNodeTree } from "@/app/domain/editor/utils/prettifySerializedNode.ts";
import {
    hideNotification,
    ShowNotificationSuccess,
    showProgressNotification,
    updateProgressNotification,
} from "@/app/ui/components/primitives/Notifications.tsx";

export type UsePrettifyOperationsHook = ReturnType<
    typeof usePrettifyOperations
>;

export function usePrettifyOperations({
    mutWorkingFilesRef,
    currentFileBibleIdentifier,
    currentChapter,
    setIsProcessing,
    updateDiffMapForChapters,
    setEditorContent,
    saveCurrentDirtyLexical,
}: {
    mutWorkingFilesRef: ParsedFile[];
    currentFileBibleIdentifier: string;
    currentChapter: number;
    setIsProcessing: (isProcessing: boolean) => void;
    updateDiffMapForChapters: (
        chapters: Array<{ bookCode: string; chapterNum: number }>,
    ) => Promise<void>;
    setEditorContent: (
        fileBibleIdentifier: string,
        chapter: number,
        chapterContent: ParsedChapter | undefined,
    ) => void;
    saveCurrentDirtyLexical: () => ParsedFile[] | undefined;
}) {
    const { t } = useLingui();

    async function prettifyBook(bookCode?: string) {
        setIsProcessing(true);
        try {
            saveCurrentDirtyLexical();
            const targetBookCode = bookCode || currentFileBibleIdentifier;

            const file = mutWorkingFilesRef.find(
                (f) => f.bookCode === targetBookCode,
            );
            if (!file) {
                return;
            }

            let currentChapterModified = false;
            const modifiedChapters: Array<{
                bookCode: string;
                chapterNum: number;
            }> = [];

            file.chapters.forEach((chapter) => {
                const originalChildren = chapter.lexicalState.root.children;
                const newChildren = applyPrettifyToNodeTree(originalChildren);

                // Check if anything changed
                if (
                    JSON.stringify(originalChildren) !==
                    JSON.stringify(newChildren)
                ) {
                    chapter.lexicalState.root.children = newChildren;
                    chapter.dirty = true;
                    modifiedChapters.push({
                        bookCode: file.bookCode,
                        chapterNum: chapter.chapNumber,
                    });
                    if (
                        file.bookCode === currentFileBibleIdentifier &&
                        chapter.chapNumber === currentChapter
                    ) {
                        currentChapterModified = true;
                    }
                }
            });

            if (modifiedChapters.length > 0) {
                await updateDiffMapForChapters(modifiedChapters);
            }

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
        } finally {
            setIsProcessing(false);
        }
    }

    async function prettifyProject() {
        setIsProcessing(true);
        saveCurrentDirtyLexical();

        const totalBooks = mutWorkingFilesRef.length;
        const notificationId = showProgressNotification({
            title: t`Prettifying Project`,
            message: t`Processing book 1 of ${totalBooks}...`,
        });

        const backup = structuredClone(mutWorkingFilesRef);
        let currentChapterModified = false;
        const modifiedChapters: Array<{
            bookCode: string;
            chapterNum: number;
        }> = [];

        try {
            for (let i = 0; i < mutWorkingFilesRef.length; i++) {
                const file = mutWorkingFilesRef[i];

                updateProgressNotification(notificationId, {
                    title: t`Prettifying Project`,
                    message: t`Processing ${file.title || file.bookCode} (${i + 1}/${totalBooks})...`,
                });

                await new Promise<void>((resolve) => {
                    setTimeout(() => {
                        for (const chapter of file.chapters) {
                            const originalChildren =
                                chapter.lexicalState.root.children;
                            const newChildren =
                                applyPrettifyToNodeTree(originalChildren);

                            if (
                                JSON.stringify(originalChildren) !==
                                JSON.stringify(newChildren)
                            ) {
                                chapter.lexicalState.root.children =
                                    newChildren;
                                chapter.dirty = true;
                                modifiedChapters.push({
                                    bookCode: file.bookCode,
                                    chapterNum: chapter.chapNumber,
                                });
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

            if (modifiedChapters.length > 0) {
                updateProgressNotification(notificationId, {
                    title: t`Prettifying Project`,
                    message: t`Updating diff view...`,
                });
                await updateDiffMapForChapters(modifiedChapters);
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
            ShowNotificationSuccess({
                notification: {
                    title: t`Project Prettified`,
                    message: t`Prettified ${modifiedBooksCount} book(s)`,
                },
            });

            return backup;
        } finally {
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

        await updateDiffMapForChapters([
            {
                bookCode: currentFileBibleIdentifier,
                chapterNum: currentChapter,
            },
        ]);
    }

    return {
        prettifyBook,
        prettifyProject,
        revertPrettify,
    };
}
