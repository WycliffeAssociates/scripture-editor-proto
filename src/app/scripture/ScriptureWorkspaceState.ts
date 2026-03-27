import type { SerializedEditorState, SerializedLexicalNode } from "lexical";
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
};

/**
 * Editable book state for a scripture workspace.
 */
export type ScriptureBookState = ScriptureBookStateBase & {
    chapters: Array<ScriptureChapterState>;
};
