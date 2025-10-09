import type {ParsedToken} from "@/lib/parse.ts";
import type {SerializedEditorState, SerializedLexicalNode} from "lexical";

import {ProjectFile} from "@/data/project/project.ts";

export type ParsedChapterState = {
    tokens: ParsedToken[];
    lexicalState: SerializedEditorState<SerializedLexicalNode>;
    dirty: boolean;
};
export type ParsedFile = ProjectFile & {
    chapters: {
        [chapter: string]: ParsedChapterState;
    };
};