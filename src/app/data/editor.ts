import {
  HISTORIC_TAG,
  HISTORY_MERGE_TAG,
  type SerializedLineBreakNode,
} from "lexical";

import type { BookFrontmatterFormNodeJSON } from "@/app/domain/editor/nodes/BookFrontmatterFormNode.tsx";
import type { USFMNestedEditorNodeJSON } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import type { SerializedUSFMNumberedMarkerNode } from "@/app/domain/editor/nodes/USFMNumberedMarkerNode.ts";
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
 * Where a chapter's serialized Lexical state is being materialized.
 *
 * The same token stream takes different tree shapes depending on the surface
 * that will consume it, and this is the single place that mapping lives:
 *
 * - `mainEditor` — the visible editing surface; follows the user's mode.
 * - `workingRebuild` — token→lexical rebuilds of live working chapters
 *   (revert, accept-incoming, format, lint fix, version restore). Follows the
 *   user's mode so a rebuild never changes what the user is looking at.
 * - `referencePane` — the read-only reference scripture pane; follows the
 *   user's mode (view collapses to the regular shape via `editorModeToShape`).
 * - `compareSource` — compare/version-preview source files. Always flat:
 *   diffing is token-based and the source lexical state is never rendered.
 *
 * Shape decisions answer from this function (or `editorModeToShape` when the
 * surface is implied), never from inline ternaries and never by inferring the
 * mode back out of an existing tree — the tree is an output of mode, not a
 * source of it.
 */
export type MaterializeSurface =
  | "mainEditor"
  | "workingRebuild"
  | "referencePane"
  | "compareSource";

export function shapeForSurface(surface: "compareSource"): EditorShape;
export function shapeForSurface(
  surface: "mainEditor" | "workingRebuild" | "referencePane",
  userMode: EditorModeSetting,
): EditorShape;
export function shapeForSurface(
  surface: MaterializeSurface,
  userMode?: EditorModeSetting,
): EditorShape {
  if (surface === "compareSource") {
    return EDITOR_SHAPES.flat;
  }
  return editorModeToShape(userMode ?? EDITOR_MODES.regular);
}

/**
 * View mode is the one read-only presentation; every other mode edits.
 */
export function isEditableEditorMode(mode: EditorModeSetting): boolean {
  return mode !== EDITOR_MODES.view;
}

/**
 * THE single definition of what "plain" opts out of: all analysis and
 * structural-repair pipelines (lint, sous, the dev re-lex alarm, and
 * structure/metadata maintenance). Plain is the bytes-only escape hatch — it
 * loads flat, autosaves for crash recovery, and runs nothing that inspects or
 * rewrites content. Crash-recovery autosave, save-status, editor-sync, and
 * layout-tick are NOT analysis and keep running in every mode.
 *
 * Read in two execution locations by design — the fork site for the
 * mode-naive pipelines, and structure-maintenance's own fire-time check (it
 * already consulted mode there for view) — but the policy itself lives only
 * here so "what plain disables" is one readable fact.
 */
export function analysisDisabledInMode(mode: EditorModeSetting): boolean {
  return mode === EDITOR_MODES.plain;
}

/**
 * True for the regular (WYSIWYG) shape — `regular` and its read-only twin
 * `view`. The intent-named predicate for sites that ask "is this the regular
 * presentation?"; prefer it over `=== EDITOR_MODES.regular`, which silently
 * excludes view.
 */
export function isRegularShape(mode: EditorModeSetting | undefined): boolean {
  return (
    mode !== undefined && editorModeToShape(mode) === EDITOR_SHAPES.regular
  );
}

/**
 * Regular-shape presentations hide raw USFM marker bytes behind WYSIWYG
 * styling; every other mode shows them.
 */
export function markersHiddenInMode(mode: EditorModeSetting): boolean {
  return isRegularShape(mode);
}

/**
 * Mode value mirrored onto DOM `data-mode` / `data-editor-mode` attributes for
 * CSS selectors. View renders with regular's selectors; its read-only
 * difference is carried separately (`data-editor-read-only` / `setEditable`).
 */
export function domPresentationMode(
  mode: EditorModeSetting,
): ContentEditorModeSetting {
  return mode === EDITOR_MODES.view ? EDITOR_MODES.regular : mode;
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
  /**
   * A whole marker+number unit held by one USFMNumberedMarkerNode (\c, \v;
   * later cp/ca/va/vp). Deliberately NOT "numberRange": the node IS the
   * marker-and-number pair, not a number token beside a hidden marker, and
   * no adjacency logic should treat it as one.
   */
  numberedMarker: "numberedMarker",
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
  | SerializedUSFMNumberedMarkerNode
  | SerializedLineBreakNode
  | USFMNestedEditorNodeJSON;
