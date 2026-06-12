import type { SerializedEditorState, SerializedLexicalNode } from "lexical";

import type { LineEnding } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * In-memory scripture workspace state used by the editable USFM UI.
 *
 * This is not a generic "project" shape. It is the scripture-editor noun that
 * route loaders and editor hooks pass around after a scripture item has been
 * loaded and parsed for editing.
 */
type ScriptureBookStateBase = {
  path: string;
  title: string;
  bookCode: string;
  nextBookId: string | null;
  prevBookId: string | null;
  sort?: number;
};

/**
 * Editable chapter state for a scripture book inside the workspace.
 */
export type ScriptureChapterState = {
  lexicalState: SerializedEditorState<SerializedLexicalNode>;
  loadedLexicalState: SerializedEditorState<SerializedLexicalNode>;
  sourceTokens: Token[];
  currentTokens: Token[];
  dirty: boolean;
  chapterNumber: number;
  /**
   * The file's line-ending convention, detected from `sourceTokens` at load
   * and re-applied at the `tokensToUsfm` waist on every serialize. Keeps a
   * CRLF file round-tripping as CRLF instead of silently normalizing to LF.
   */
  eol: LineEnding;
};

/**
 * Editable book state for a scripture workspace.
 */
export type ScriptureBookState = ScriptureBookStateBase & {
  chapters: Array<ScriptureChapterState>;
};

/**
 * Deeply-readonly view of a book — what a recording draft's `read()` hands
 * back. Read-only consumers (token collection, relint) accept this so the
 * recording draft can feed them snapshot state without a mutable cast.
 */
export type ReadonlyScriptureBookState = Readonly<
  Omit<ScriptureBookState, "chapters">
> & {
  readonly chapters: ReadonlyArray<Readonly<ScriptureChapterState>>;
};
