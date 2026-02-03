import { useLingui } from "@lingui/react/macro";
import type { SerializedLexicalNode } from "lexical";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { isSerializedParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import { serializeToUsfmString } from "@/app/domain/editor/serialization/lexicalToUsfm.ts";
import { matchFormattingToSource } from "@/app/domain/editor/utils/matchFormatting.ts";
import { ShowNotificationSuccess } from "@/app/ui/components/primitives/Notifications.tsx";
import type { ReferenceProjectHook } from "@/app/ui/hooks/useReferenceProject.tsx";

export function useFormatMatching({
    mutWorkingFilesRef,
    currentFileBibleIdentifier,
    currentChapter,
    referenceProject,
    updateDiffMapForChapter,
    setEditorContent,
    saveCurrentDirtyLexical,
}: {
    mutWorkingFilesRef: ParsedFile[];
    currentFileBibleIdentifier: string;
    currentChapter: number;
    referenceProject: ReferenceProjectHook;
    updateDiffMapForChapter: (bookCode: string, chapterNum: number) => void;
    setEditorContent: (
        fileBibleIdentifier: string,
        chapter: number,
        chapterContent: ParsedChapter | undefined,
    ) => void;
    saveCurrentDirtyLexical: () => ParsedFile[] | undefined;
}) {
    const { t } = useLingui();

    async function matchFormattingChapter() {
        if (!referenceProject.referenceChapter) return;
        saveCurrentDirtyLexical();

        const backup = structuredClone(mutWorkingFilesRef);
        const file = mutWorkingFilesRef.find(
            (f) => f.bookCode === currentFileBibleIdentifier,
        );
        const chapter = file?.chapters.find(
            (c) => c.chapNumber === currentChapter,
        );

        if (!chapter) return;

        const targetPara = chapter.lexicalState.root.children[0];
        const sourcePara =
            referenceProject.referenceChapter.lexicalState.root.children[0];

        if (
            !isSerializedParagraphNode(targetPara) ||
            !isSerializedParagraphNode(sourcePara)
        ) {
            return;
        }

        const targetNodes = targetPara.children;
        const sourceNodes = sourcePara.children;
        const newNodes = matchFormattingToSource(targetNodes, sourceNodes);

        if (JSON.stringify(targetNodes) !== JSON.stringify(newNodes)) {
            const nextLexical = structuredClone(chapter.lexicalState);
            const nextRootFirst = nextLexical.root
                .children[0] as unknown as SerializedLexicalNode;
            if (isSerializedParagraphNode(nextRootFirst)) {
                nextRootFirst.children = newNodes;
            }

            const afterUsfm = serializeToUsfmString(
                nextLexical.root.children as SerializedLexicalNode[],
            );
            const baselineUsfm = serializeToUsfmString(
                chapter.loadedLexicalState.root
                    .children as SerializedLexicalNode[],
            );

            // Compute dirty on USFM-to-disk equality.
            chapter.lexicalState = nextLexical;
            chapter.dirty = afterUsfm !== baselineUsfm;
            updateDiffMapForChapter(currentFileBibleIdentifier, currentChapter);
            setEditorContent(
                currentFileBibleIdentifier,
                currentChapter,
                chapter,
            );

            ShowNotificationSuccess({
                notification: {
                    title: t`Formatting Matched`,
                    message: t`Matched formatting for Chapter ${currentChapter}`,
                },
            });
        }

        return backup;
    }

    async function matchFormattingBook() {
        if (!referenceProject.referenceFile) return;
        saveCurrentDirtyLexical();

        const backup = structuredClone(mutWorkingFilesRef);
        const file = mutWorkingFilesRef.find(
            (f) => f.bookCode === currentFileBibleIdentifier,
        );
        if (!file) return;

        let currentChapterModified = false;
        let modifiedChaptersCount = 0;

        file.chapters.forEach((chapter) => {
            const refChapter = referenceProject.referenceFile?.chapters.find(
                (rc) => rc.chapNumber === chapter.chapNumber,
            );
            if (!refChapter) return;

            const targetPara = chapter.lexicalState.root.children[0];
            const sourcePara = refChapter.lexicalState.root.children[0];

            if (
                !isSerializedParagraphNode(targetPara) ||
                !isSerializedParagraphNode(sourcePara)
            ) {
                return;
            }

            const targetNodes = targetPara.children;
            const sourceNodes = sourcePara.children;
            const newNodes = matchFormattingToSource(targetNodes, sourceNodes);

            if (JSON.stringify(targetNodes) !== JSON.stringify(newNodes)) {
                const nextLexical = structuredClone(chapter.lexicalState);
                const nextRootFirst = nextLexical.root
                    .children[0] as unknown as SerializedLexicalNode;
                if (isSerializedParagraphNode(nextRootFirst)) {
                    nextRootFirst.children = newNodes;
                }

                const afterUsfm = serializeToUsfmString(
                    nextLexical.root.children as SerializedLexicalNode[],
                );
                const baselineUsfm = serializeToUsfmString(
                    chapter.loadedLexicalState.root
                        .children as SerializedLexicalNode[],
                );

                chapter.lexicalState = nextLexical;
                chapter.dirty = afterUsfm !== baselineUsfm;
                updateDiffMapForChapter(file.bookCode, chapter.chapNumber);
                modifiedChaptersCount++;
                if (chapter.chapNumber === currentChapter) {
                    currentChapterModified = true;
                }
            }
        });

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

        if (modifiedChaptersCount > 0) {
            ShowNotificationSuccess({
                notification: {
                    title: t`Formatting Matched`,
                    message: t`Matched formatting for ${modifiedChaptersCount} chapters in ${file.title || file.bookCode}`,
                },
            });
        }

        return backup;
    }

    async function matchFormattingProject() {
        if (!referenceProject.referenceQuery.data) return;
        saveCurrentDirtyLexical();

        const backup = structuredClone(mutWorkingFilesRef);
        let currentChapterModified = false;
        let modifiedBooksCount = 0;

        for (const targetFile of mutWorkingFilesRef) {
            const refFile =
                referenceProject.referenceQuery.data.parsedFiles.find(
                    (rf) => rf.bookCode === targetFile.bookCode,
                );
            if (!refFile) continue;

            let fileModified = false;
            targetFile.chapters.forEach((chapter) => {
                const refChapter = refFile.chapters.find(
                    (rc) => rc.chapNumber === chapter.chapNumber,
                );
                if (!refChapter) return;

                const targetPara = chapter.lexicalState.root.children[0];
                const sourcePara = refChapter.lexicalState.root.children[0];

                if (
                    !isSerializedParagraphNode(targetPara) ||
                    !isSerializedParagraphNode(sourcePara)
                ) {
                    return;
                }

                const targetNodes = targetPara.children;
                const sourceNodes = sourcePara.children;
                const newNodes = matchFormattingToSource(
                    targetNodes,
                    sourceNodes,
                );

                if (JSON.stringify(targetNodes) !== JSON.stringify(newNodes)) {
                    targetPara.children = newNodes;
                    chapter.dirty = true;
                    updateDiffMapForChapter(
                        targetFile.bookCode,
                        chapter.chapNumber,
                    );
                    fileModified = true;
                    if (
                        targetFile.bookCode === currentFileBibleIdentifier &&
                        chapter.chapNumber === currentChapter
                    ) {
                        currentChapterModified = true;
                    }
                }
            });

            if (fileModified) {
                modifiedBooksCount++;
            }
        }

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

        if (modifiedBooksCount > 0) {
            ShowNotificationSuccess({
                notification: {
                    title: t`Formatting Matched`,
                    message: t`Matched formatting across ${modifiedBooksCount} books`,
                },
            });
        }

        return backup;
    }

    return {
        matchFormattingChapter,
        matchFormattingBook,
        matchFormattingProject,
    };
}
