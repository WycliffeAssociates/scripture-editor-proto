import type {SerializedEditorState, SerializedLexicalNode} from "lexical";

export type ProjectFile = {
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
  dirty: boolean;
  chapNumber: number;
};

export type ParsedFile = ProjectFile & {
  chapters: Array<ParsedChapter>;
};
