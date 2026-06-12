import type { LexicalEditor, SerializedEditorState } from "lexical";

import { EDITOR_TAGS_USED } from "@/app/data/editor.ts";
import { lexicalToTokens } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type {
  ReadonlyScriptureBookState,
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * Utilities for moving between the visible Lexical editor instance and the
 * scripture workspace noun held in React state.
 */
function collectChapterTokens(
  bookCode: string,
  serializedEditorState: SerializedEditorState,
  options?: { structuralParagraphBreaks?: boolean },
): Token[] {
  return lexicalToTokens(serializedEditorState, {
    ...options,
    bookCode,
  });
}

export function collectFileTokens(
  file: ReadonlyScriptureBookState | null,
  options?: { structuralParagraphBreaks?: boolean },
): Token[] {
  if (!file) return [];

  const tokens: Token[] = [];
  for (const chapter of file.chapters) {
    const flattened = collectChapterTokens(
      file.bookCode,
      chapter.lexicalState,
      options,
    );
    if (flattened?.length) {
      tokens.push(...flattened);
    }
  }

  return tokens;
}

export function collectWorkingFileTokens(args: {
  files: ScriptureBookState[];
  options?: { structuralParagraphBreaks?: boolean };
}): Array<{ file: ScriptureBookState; tokens: Token[] }> {
  return args.files.map((file) => ({
    file,
    tokens: collectFileTokens(file, args.options),
  }));
}

/**
 * Push one chapter's current lexical state into the mounted editor instance. This
 * is the final handoff point after navigation, undo/redo, compare apply, or other
 * workspace-level mutations decide what chapter should be visible.
 */
export function setEditorContent(
  editor: LexicalEditor,
  fileBibleIdentifier: string,
  chapter: number,
  chapterContent: ScriptureChapterState | undefined,
  workingFilesStore: WorkingFilesStore,
  selectionOverride?: unknown,
  editorStateOverride?: SerializedEditorState,
) {
  if (!editor) {
    console.error(
      "setEditorContent called before editor was ready",
      fileBibleIdentifier,
      chapter,
    );
    return;
  }

  const targetFile = chapterContent
    ? null
    : workingFilesStore.read().find((f) => f.bookCode === fileBibleIdentifier);
  const chapterState =
    chapterContent ||
    targetFile?.chapters.find((c) => c.chapterNumber === chapter);
  if (!chapterState) return;

  // Avoid wrapping setEditorState in editor.update(). Lexical treats setEditorState
  // as its own kind of update, and nesting it can interfere with history behavior.
  const baseEditorState = editorStateOverride ?? chapterState.lexicalState;
  const nextEditorState =
    selectionOverride === undefined
      ? baseEditorState
      : ({
          ...baseEditorState,
          selection: selectionOverride,
        } as SerializedEditorState);

  editor.setEditorState(editor.parseEditorState(nextEditorState), {
    tag: EDITOR_TAGS_USED.programaticIgnore,
  });
  if (selectionOverride !== undefined) {
    editor.focus();
  }

  // Post-load no-op tick. Historic purpose (trigger tag-gated maintenance
  // listeners after a `programaticIgnore` hydration) is gone — maintenance
  // moved to the userEdit-filtered structure pipeline, which ignores the
  // metadataOnly commit this produces. Remaining observable effects are an
  // overlay-tick bump (also pulsed explicitly elsewhere) and a history
  // baseline tick. TODO: verify and delete during the structured-nodes
  // loading rework.
  editor.update(
    () => {
      // no-op
    },
    { tag: EDITOR_TAGS_USED.programmaticDoRunChanges },
  );
}
