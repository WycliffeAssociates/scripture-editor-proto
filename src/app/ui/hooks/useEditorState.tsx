import type { LexicalEditor, SerializedEditorState } from "lexical";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { serializeToUsfmString } from "@/app/domain/editor/serialization/lexicalToUsfm.ts";
import { setEditorContent } from "./utils/editorUtils.ts";

export type UseEditorStateHook = ReturnType<typeof useEditorState>;

export function useEditorState({
    mutWorkingFilesRef,
    currentFileBibleIdentifier,
    currentChapter,
    updateDiffMapForChapter,
}: {
    mutWorkingFilesRef: ParsedFile[];
    currentFileBibleIdentifier: string;
    currentChapter: number;
    updateDiffMapForChapter: (bookCode: string, chapterNum: number) => void;
}) {
    function updateChapterLexical({
        fileBibleIdentifier,
        chap,
        newLexical,
        isDirty,
    }: {
        fileBibleIdentifier: string;
        chap: number;
        newLexical: SerializedEditorState;
        isDirty?: boolean;
    }) {
        const file = mutWorkingFilesRef.find(
            (file) => file.bookCode === fileBibleIdentifier,
        );
        if (!file) return;
        const chapToUpdate = file.chapters.find((c) => c.chapNumber === chap);
        if (!chapToUpdate) return;
        chapToUpdate.lexicalState = newLexical;
        chapToUpdate.dirty =
            isDirty ??
            serializeToUsfmString(newLexical.root.children) !==
                serializeToUsfmString(
                    chapToUpdate.loadedLexicalState.root.children,
                );
        updateDiffMapForChapter(file.bookCode, chap);
        return mutWorkingFilesRef;
    }

    function setEditorContentWithDependencies(
        editor: LexicalEditor,
        fileBibleIdentifier: string,
        chapter: number,
        chapterContent: ParsedChapter | undefined,
    ) {
        return setEditorContent(
            editor,
            fileBibleIdentifier,
            chapter,
            chapterContent,
            mutWorkingFilesRef,
        );
    }

    function saveCurrentDirtyLexical(
        editor: LexicalEditor,
    ): ParsedFile[] | undefined {
        if (!editor) return;

        const currentJson = editor.getEditorState().toJSON();

        if (currentJson) {
            return updateChapterLexical({
                fileBibleIdentifier: currentFileBibleIdentifier,
                chap: currentChapter,
                newLexical: currentJson,
            });
        }
    }

    return {
        updateChapterLexical,
        setEditorContent: setEditorContentWithDependencies,
        saveCurrentDirtyLexical,
    };
}
