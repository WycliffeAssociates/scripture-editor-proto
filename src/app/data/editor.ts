import {
    HISTORIC_TAG,
    HISTORY_MERGE_TAG,
    type SerializedLineBreakNode,
} from "lexical";
import type { USFMNestedEditorNodeJSON } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import type { USFMParagraphNodeJSON } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import type { SerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";

export type EditorModeSetting = "regular" | "usfm" | "plain" | "view";
export type ContentEditorModeSetting = Exclude<EditorModeSetting, "view">;

export const UsfmTokenTypes = {
    marker: "marker",
    endMarker: "endMarker",
    text: "text",
    numberRange: "numberRange",
    verticalWhitespace: "nl",
    error: "error",
} as const;
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
