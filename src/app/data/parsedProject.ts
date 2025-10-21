import type { SerializedEditorState, SerializedLexicalNode } from "lexical";

export type ProjectFile = {
    title: string;
    localizedTitle: string | undefined;
    bibleIdentifier: string;
    nextBookId: string | null;
    prevBookId: string | null;
    sort?: number;
    path: string;
};
export type ParsedChapter = {
    lexicalState: SerializedEditorState<SerializedLexicalNode>;
    dirty: boolean;
    chapNumber: number;
};

export type ParsedFile = ProjectFile & {
    chapters: Array<ParsedChapter>;
};
