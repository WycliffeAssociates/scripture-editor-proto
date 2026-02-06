import {
    HISTORIC_TAG,
    HISTORY_MERGE_TAG,
    type SerializedLineBreakNode,
} from "lexical";
import type { USFMNestedEditorNodeJSON } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import type { USFMParagraphNodeJSON } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import type { SerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import type { TokenMap } from "@/core/domain/usfm/lex.ts";

export type EditorModeSetting = "regular" | "usfm" | "plain" | "view";

export const UsfmTokenTypes: Pick<
    typeof TokenMap,
    | "marker"
    | "text"
    | "numberRange"
    | "verticalWhitespace"
    | "error"
    | "endMarker"
> = {
    marker: "marker",
    endMarker: "endMarker",
    text: "text",
    numberRange: "numberRange",
    verticalWhitespace: "nl",
    error: "error",
};
export const EDITOR_TAGS_USED = {
    programaticIgnore: "programatic-ignore",
    programmaticDoRunChanges: "programmatic-do-run-changes",
    historyMerge: HISTORY_MERGE_TAG,
    historic: HISTORIC_TAG,
};

export const USFM_TEXT_NODE_TYPE = "usfm-text-node" as const;
export const USFM_PARAGRAPH_NODE_TYPE = "usfm-paragraph-node" as const;

// type more loosel for includions checks
export type USFMNodeJSON =
    | USFMParagraphNodeJSON
    | SerializedUSFMTextNode
    | SerializedLineBreakNode
    | USFMNestedEditorNodeJSON;
