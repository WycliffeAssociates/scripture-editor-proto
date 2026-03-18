import type { SerializedEditorState, SerializedLexicalNode } from "lexical";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

export type ProjectFile = {
    path: string;
    title: string;
    bookCode: string;
    nextBookId: string | null;
    prevBookId: string | null;
    sort?: number;
    // path: string;
};
export type ParsedChapter = {
    lexicalState: SerializedEditorState<SerializedLexicalNode>;
    loadedLexicalState: SerializedEditorState<SerializedLexicalNode>;
    sourceTokens: Token[];
    currentTokens: Token[];
    dirty: boolean;
    chapNumber: number;
};

export type ParsedFile = ProjectFile & {
    chapters: Array<ParsedChapter>;
};
