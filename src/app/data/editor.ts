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
export type EditorModeSetting = "regular" | "usfm" | "plain" | "view" | "form";
export type ContentEditorModeSetting = Exclude<EditorModeSetting, "view">;
/**
 * Canonical enum-like object for editor-mode comparisons.
 */
export const EDITOR_MODES = {
    regular: "regular",
    usfm: "usfm",
    plain: "plain",
    view: "view",
    form: "form",
} as const satisfies Record<EditorModeSetting, EditorModeSetting>;

/**
 * Underlying *shape* of the Lexical tree produced when an editor mode
 * loads its content. Multiple `EditorModeSetting` values map onto the
 * same shape — e.g. both `regular` and `view` materialize as the
 * regular-mode tree, and `usfm`/`plain` collapse to the flat shape.
 *
 * Keep this list as the single source of truth: any code that
 * branches on "is this state shaped as form/regular/flat?" should
 * import `EDITOR_SHAPES` and the `EditorShape` type rather than
 * re-declaring the union locally.
 */
export type EditorShape = "regular" | "form" | "flat";

export const EDITOR_SHAPES = {
    regular: "regular",
    form: "form",
    flat: "flat",
} as const satisfies Record<EditorShape, EditorShape>;

/**
 * Map an `EditorModeSetting` onto the Lexical tree shape it
 * produces. View and regular share the regular shape; usfm and plain
 * share the flat shape; form has its own. Centralized here so the
 * mode-to-shape ternary doesn't drift across call sites.
 */
export function editorModeToShape(mode: EditorModeSetting): EditorShape {
    if (mode === EDITOR_MODES.form) return EDITOR_SHAPES.form;
    if (mode === EDITOR_MODES.regular || mode === EDITOR_MODES.view) {
        return EDITOR_SHAPES.regular;
    }
    return EDITOR_SHAPES.flat;
}

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
    // Marks structure/metadata writebacks from the structure-maintenance
    // pipeline. The bridge maps this to commit kind "structuralFixup"; downstream
    // pipelines filter that kind out to break the feedback loop.
    programmaticStructuralFix: "programmatic-structural-fix",
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
