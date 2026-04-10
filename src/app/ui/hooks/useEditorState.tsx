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
    currentFileBibleIdentifier,
    currentChapter,
    updateDiffMapForChapter,
}: {
    mutWorkingFilesRef: ScriptureBookState[];
    currentFileBibleIdentifier: string;
    currentChapter: number;
    updateDiffMapForChapter: (bookCode: string, chapterNum: number) => void;
}) {
    function getCurrentChapterState() {
        return mutWorkingFilesRef
            .find((file) => file.bookCode === currentFileBibleIdentifier)
            ?.chapters.find(
                (chapter) => chapter.chapterNumber === currentChapter,
            );
    }

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
            chapToUpdate.currentTokens.map((token) => token.text).join("") !==
                chapToUpdate.sourceTokens.map((token) => token.text).join("");
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

    /**
     * Snapshot the currently mounted editor back into workspace state if there
     * is a live editor instance.
     */
    function saveCurrentDirtyLexical(
        editor: LexicalEditor,
    ): ScriptureBookState[] | undefined {
        if (!editor) return;
        const currentChapterState = getCurrentChapterState();
        if (
            shouldSkipEmptyEditorSnapshot({
                isEditorStateEmpty: editor.getEditorState().isEmpty(),
                currentChapterState,
            })
        ) {
            return mutWorkingFilesRef;
        }

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
