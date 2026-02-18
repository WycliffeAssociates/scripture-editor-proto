import { useLingui } from "@lingui/react/macro";
import type { LexicalEditor, SerializedLexicalNode } from "lexical";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { serializeToUsfmString } from "@/app/domain/editor/serialization/lexicalToUsfm.ts";
import { applyAutofixToSerializedState } from "@/app/domain/editor/utils/autofixSerializedNode.ts";
import { ShowNotificationSuccess } from "@/app/ui/components/primitives/Notifications.tsx";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import { parseSid } from "@/core/data/bible/bible.ts";
import type { LintError } from "@/core/data/usfm/lint.ts";
import { lintExistingUsfmTokens } from "@/core/domain/usfm/parse.ts";
import { initParseContext } from "@/core/domain/usfm/tokenParsers.ts";
import { getFlattenedFileTokens } from "./utils/editorUtils.ts";

export function useLintFixing({
    mutWorkingFilesRef,
    currentFileBibleIdentifier,
    currentChapter,
    editorRef,
    updateDiffMapForChapter,
    updateLintErrors,
    setEditorContent,
    saveCurrentDirtyLexical,
    history,
}: {
    mutWorkingFilesRef: ParsedFile[];
    currentFileBibleIdentifier: string;
    currentChapter: number;
    editorRef: React.RefObject<LexicalEditor | null>;
    updateDiffMapForChapter: (bookCode: string, chapterNum: number) => void;
    updateLintErrors: (
        book: string,
        chapter: number,
        newErrors: LintError[],
    ) => void;
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

    async function fixLintError(err: LintError) {
        if (!err.fix) return;

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

        await history.runTransaction({
            label: t`Apply Autofix (${err.msgKey})`,
            candidates: [
                {
                    bookCode: file.bookCode,
                    chapterNum: chapter.chapNumber,
                },
            ],
            run: async () => {
                const nextState = applyAutofixToSerializedState(
                    chapter.lexicalState,
                    err,
                );

                if (!nextState) return;

                chapter.lexicalState = nextState;
                const baselineUsfm = serializeToUsfmString(
                    chapter.loadedLexicalState.root
                        .children as SerializedLexicalNode[],
                );
                const afterUsfm = serializeToUsfmString(
                    chapter.lexicalState.root
                        .children as SerializedLexicalNode[],
                );

                chapter.dirty = afterUsfm !== baselineUsfm;
                updateDiffMapForChapter(file.bookCode, chapter.chapNumber);

                if (
                    file.bookCode === currentFileBibleIdentifier &&
                    chapter.chapNumber === currentChapter
                ) {
                    setEditorContent(
                        currentFileBibleIdentifier,
                        currentChapter,
                        chapter,
                        editorRef.current || undefined,
                    );
                }

                ShowNotificationSuccess({
                    notification: {
                        title: t`Fix Applied`,
                        message: t`Autofix applied for ${err.msgKey}`,
                    },
                });

                const flatTokens = getFlattenedFileTokens(
                    file,
                    chapter.lexicalState,
                    chapter.chapNumber,
                );
                const ctx = initParseContext(flatTokens);
                const newErrors = lintExistingUsfmTokens(flatTokens, ctx);
                updateLintErrors(file.bookCode, chapter.chapNumber, newErrors);
            },
        });
    }

    return {
        fixLintError,
    };
}
