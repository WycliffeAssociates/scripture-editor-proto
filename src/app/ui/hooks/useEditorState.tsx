import type { LexicalEditor, SerializedEditorState } from "lexical";
import { lexicalToTokens } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import { setEditorContent } from "./utils/editorUtils.ts";

/**
 * Local editor-state mutators for the currently open scripture workspace.
 *
 * This hook owns the bridge between live Lexical state and the mutable
 * `ScriptureBookState[]` workspace model that save, diff, compare, and
 * navigation all share.
 */
export function useEditorState({
    mutWorkingFilesRef,
    updateDiffMapForChapter,
}: {
    mutWorkingFilesRef: ScriptureBookState[];
    updateDiffMapForChapter: (bookCode: string, chapterNum: number) => void;
}) {
    /**
     * Persist the latest serialized Lexical state back into the mutable
     * workspace chapter record and refresh diff bookkeeping for that chapter.
     */
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
        const chapToUpdate = file.chapters.find(
            (c) => c.chapterNumber === chap,
        );
        if (!chapToUpdate) return;
        chapToUpdate.lexicalState = newLexical;
        chapToUpdate.currentTokens = lexicalToTokens(newLexical, {
            bookCode: file.bookCode,
        });
        chapToUpdate.dirty =
            isDirty ??
            chapToUpdate.currentTokens.map((token) => token.source).join("") !==
                chapToUpdate.sourceTokens.map((token) => token.source).join("");
        updateDiffMapForChapter(file.bookCode, chap);
        return mutWorkingFilesRef;
    }

    /**
     * Set editor content while preserving access to the shared mutable
     * workspace-array reference.
     */
    function setEditorContentWithDependencies(
        editor: LexicalEditor,
        fileBibleIdentifier: string,
        chapter: number,
        chapterContent: ScriptureChapterState | undefined,
    ) {
        return setEditorContent(
            editor,
            fileBibleIdentifier,
            chapter,
            chapterContent,
            mutWorkingFilesRef,
        );
    }

    return {
        updateChapterLexical,
        setEditorContent: setEditorContentWithDependencies,
    };
}

export function shouldSkipEmptyEditorSnapshot(args: {
    isEditorStateEmpty: boolean;
    currentChapterState: ScriptureChapterState | undefined;
}): boolean {
    if (!args.isEditorStateEmpty) return false;
    if (!args.currentChapterState) return false;

    return (
        args.currentChapterState.sourceTokens.length > 0 ||
        args.currentChapterState.currentTokens.length > 0 ||
        args.currentChapterState.lexicalState.root.children.length > 0
    );
}
