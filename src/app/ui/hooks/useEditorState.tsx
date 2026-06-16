import type { LexicalEditor } from "lexical";

import type { EditorShape } from "@/app/data/editor.ts";
import type { ScriptureChapterState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";

import { setEditorContent } from "./utils/editorUtils.ts";

/**
 * Editor-side helper that pushes chapter content into the visible Lexical
 * instance. Reads from the store when callers don't pre-resolve a chapter, and
 * shapes the chapter's flat tokens in the current editor mode on the way out.
 */
export function useEditorState({
  workingFilesStore,
  getEditorShape,
}: {
  workingFilesStore: WorkingFilesStore;
  getEditorShape: () => EditorShape;
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
      getEditorShape(),
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
    args.currentChapterState.currentTokens.length > 0
  );
}
