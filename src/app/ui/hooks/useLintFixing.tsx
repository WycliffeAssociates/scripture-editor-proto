import { useLingui } from "@lingui/react/macro";
import type { LexicalEditor, SerializedLexicalNode } from "lexical";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { serializeToUsfmString } from "@/app/domain/editor/serialization/lexicalToUsfm.ts";
import { applyAutofixToSerializedState } from "@/app/domain/editor/utils/autofixSerializedNode.ts";
import { ShowNotificationSuccess } from "@/app/ui/components/primitives/Notifications.tsx";
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

        const nextState = applyAutofixToSerializedState(
            chapter.lexicalState,
            err,
        );

        if (nextState) {
            chapter.lexicalState = nextState;
            const baselineUsfm = serializeToUsfmString(
                chapter.loadedLexicalState.root
                    .children as SerializedLexicalNode[],
            );
            const afterUsfm = serializeToUsfmString(
                chapter.lexicalState.root.children as SerializedLexicalNode[],
            );

            chapter.dirty = afterUsfm !== baselineUsfm;
            updateDiffMapForChapter(file.bookCode, chapter.chapNumber);

            // If the fixed chapter is the current one, reload the editor content
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

            // Refresh lints for the affected chapter
            const flatTokens = getFlattenedFileTokens(
                file,
                chapter.lexicalState,
                chapter.chapNumber,
            );
            const ctx = initParseContext(flatTokens);
            const newErrors = lintExistingUsfmTokens(flatTokens, ctx);
            updateLintErrors(file.bookCode, chapter.chapNumber, newErrors);
        }
    }

    return {
        fixLintError,
    };
}
