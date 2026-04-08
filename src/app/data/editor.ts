import {
    HISTORIC_TAG,
    HISTORY_MERGE_TAG,
    type SerializedLineBreakNode,
} from "lexical";
import type { BookFrontmatterFormNodeJSON } from "@/app/domain/editor/nodes/BookFrontmatterFormNode.tsx";
import type { USFMNestedEditorNodeJSON } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import type { USFMParagraphNodeJSON } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import type { SerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";

/**
 * End-user editor presentations supported by the scripture workspace.
 *
 * These values control how the same loaded scripture content is materialized
 * into Lexical/editor state. They are intentionally app-level because many
 * hooks and actions branch on editor mode.
 */
export type EditorModeSetting = "regular" | "usfm" | "plain" | "view";
export type ContentEditorModeSetting = Exclude<EditorModeSetting, "view">;
/**
 * Canonical enum-like object for editor-mode comparisons.
 */
export const EDITOR_MODES = {
    regular: "regular",
    usfm: "usfm",
    plain: "plain",
    view: "view",
} as const satisfies Record<EditorModeSetting, EditorModeSetting>;

/**
 * Token categories surfaced by the USFM parsing pipeline.
 */
export const UsfmTokenTypes = {
    marker: "marker",
    endMarker: "endMarker",
    text: "text",
    numberRange: "numberRange",
    verticalWhitespace: "nl",
    error: "error",
} as const;

/**
 * Lexical update tags used to distinguish user edits from programmatic state
 * transitions, history merges, and replay operations.
 */
export const EDITOR_TAGS_USED = {
    programaticIgnore: "programatic-ignore",
    programmaticDoRunChanges: "programmatic-do-run-changes",
    historyMerge: HISTORY_MERGE_TAG,
    historic: HISTORIC_TAG,
};

export const USFM_TEXT_NODE_TYPE = "usfm-text-node" as const;
export const USFM_PARAGRAPH_NODE_TYPE = "usfm-paragraph-node" as const;

/**
 * Union of the serialized node shapes the scripture editor expects to see in
 * its USFM-aware Lexical state.
 */
export type USFMNodeJSON =
    | BookFrontmatterFormNodeJSON
    | USFMParagraphNodeJSON
    | SerializedUSFMTextNode
    | SerializedLineBreakNode
    | USFMNestedEditorNodeJSON;
