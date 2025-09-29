import type { HistoryState as LexicalHistoryState } from "@lexical/history";
import type {
    SerializedEditorState,
    SerializedElementNode,
    SerializedLexicalNode,
    SerializedTextNode,
} from "lexical";
import { USFMElementNodeJSON } from "@/features/editor/nodes/USFMElementNode";
import { USFMNestedEditorNodeJSON } from "@/features/editor/nodes/USFMNestedEditorDecorator";
import type { ParsedToken } from "../lib/parse";

export type ProjectFile = {
    title: string | undefined;
    identifier: string | undefined;
    sort: number | undefined;
    path: string;
};
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
export type AppPreferences = {
    fontSize: string;
    zoom: number;
};
