import { useLingui } from "@lingui/react/macro";
import { useRouter } from "@tanstack/react-router";
import type { LexicalEditor } from "lexical";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { rebuildParsedFileFromUsfm } from "@/app/domain/editor/services/rebuildParsedFileFromUsfm.ts";
import { lexicalEditorStateToOnionFlatTokens } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { ShowNotificationSuccess } from "@/app/ui/components/primitives/Notifications.tsx";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import { parseSid } from "@/core/data/bible/bible.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

export function useLintFixing({
    mutWorkingFilesRef,
    currentFileBibleIdentifier,
    currentChapter,
    editorRef,
    updateDiffMapForChapter,
    replaceLintErrorsForBook,
    setEditorContent,
    saveCurrentDirtyLexical,
    history,
}: {
    mutWorkingFilesRef: ParsedFile[];
    currentFileBibleIdentifier: string;
    currentChapter: number;
    editorRef: React.RefObject<LexicalEditor | null>;
    updateDiffMapForChapter: (bookCode: string, chapterNum: number) => void;
    replaceLintErrorsForBook: (book: string, newErrors: LintIssue[]) => void;
    setEditorContent: (
        fileBibleIdentifier: string,
        chapter: number,
        chapterContent: ParsedChapter | undefined,
        editor?: LexicalEditor,
    ) => void;
    saveCurrentDirtyLexical: () => ParsedFile[] | undefined;
    history: CustomHistoryHook;
}) {
    const { t } = useLingui();
    const { usfmOnionService } = useRouter().options.context;

    async function relintBook(file: ParsedFile) {
        const flatTokens = file.chapters.flatMap((c) =>
            lexicalEditorStateToOnionFlatTokens(c.lexicalState),
        );
        if (!flatTokens.length) {
            replaceLintErrorsForBook(file.bookCode, []);
            return;
        }
        const [issues] = await usfmOnionService.lintScope([
            { tokens: flatTokens },
        ]);
        replaceLintErrorsForBook(file.bookCode, issues);
    }

    async function fixLintError(err: LintIssue) {
        const issueFix = err.fix;
        if (!issueFix) return;
        if (!err.sid) return;

        const sidParsed = parseSid(err.sid);
        if (!sidParsed) return;

        // Sync any unsaved changes from the editor to mutWorkingFilesRef
        saveCurrentDirtyLexical();

        const file = mutWorkingFilesRef.find(
            (f) => f.bookCode === sidParsed.book,
        );
        if (!file) {
            console.error(`File not found for book: ${sidParsed.book}`);
            return;
        }

        const chapter = file.chapters.find(
            (c) => c.chapNumber === sidParsed.chapter,
        );
        if (!chapter) {
            console.error(`Chapter not found: ${sidParsed.chapter}`);
            return;
        }

        const didApply = await history.runTransaction({
            label: t`Apply Autofix (${err.code})`,
            candidates: [
                {
                    bookCode: file.bookCode,
                    chapterNum: chapter.chapNumber,
                },
            ],
            run: async () => {
                const baselineTokens = file.chapters.flatMap((c) =>
                    lexicalEditorStateToOnionFlatTokens(c.lexicalState),
                );
                const result = await usfmOnionService.applyTokenFixes(
                    baselineTokens,
                    [issueFix],
                );
                if (!result.appliedChanges.length) return false;

                const nextUsfm = result.tokens
                    .map((token) => token.text)
                    .join("");
                await rebuildParsedFileFromUsfm({
                    targetFile: file,
                    sourceUsfm: nextUsfm,
                    usfmOnionService,
                });
                file.chapters.forEach((updatedChapter) => {
                    updateDiffMapForChapter(
                        file.bookCode,
                        updatedChapter.chapNumber,
                    );
                });

                if (
                    file.bookCode === currentFileBibleIdentifier &&
                    chapter.chapNumber === currentChapter
                ) {
                    const nextChapter = file.chapters.find(
                        (candidate) => candidate.chapNumber === currentChapter,
                    );
                    setEditorContent(
                        currentFileBibleIdentifier,
                        currentChapter,
                        nextChapter,
                        editorRef.current || undefined,
                    );
                }

                ShowNotificationSuccess({
                    notification: {
                        title: t`Fix Applied`,
                        message: t`Autofix applied for ${err.code}`,
                    },
                });
                return true;
            },
        });

        if (didApply) {
            await relintBook(file);
        }
    }

    return {
        fixLintError,
    };
}
