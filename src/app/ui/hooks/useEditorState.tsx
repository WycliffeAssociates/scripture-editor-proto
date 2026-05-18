import type { LexicalEditor } from "lexical";
import type { ScriptureChapterState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import { setEditorContent } from "./utils/editorUtils.ts";

/**
 * Editor-side helper that pushes chapter content into the visible Lexical
 * instance for the currently open scripture workspace.
 *
 * After the WorkingFilesStore migration, the legacy `updateChapterLexical`
 * write-back path is gone — the bridge plugin publishes Lexical edits into the
 * store directly. This hook now only owns the read-side `setEditorContent`
 * call, which can fall back to the store when callers don't pre-resolve a
 * chapter state object.
 */
export function useEditorState({
    workingFilesStore,
}: {
    workingFilesStore: WorkingFilesStore;
}) {
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
            workingFilesStore,
        );
    }

    return {
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
