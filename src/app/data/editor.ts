import type {SerializedLineBreakNode} from "lexical";
import type {USFMElementNodeJSON} from "@/app/domain/editor/nodes/USFMElementNode";
import type {USFMNestedEditorNodeJSON} from "@/app/domain/editor/nodes/USFMNestedEditorNode";
import type {SerializedUSFMTextNode} from "@/app/domain/editor/nodes/USFMTextNode";
import {TokenMap} from "@/core/domain/usfm/lex";

export type EditorMode = "wysiwyg" | "source";
export const EditorModes = {
  WYSIWYG: "wysiwyg",
  SOURCE: "source",
} as const;

export type EditorMarkersViewState = "always" | "never" | "whenEditing";
export type EditorMarkersMutableState = "mutable" | "immutable";
export const EditorMarkersMutableStates = {
  MUTABLE: "mutable",
  IMMUTABLE: "immutable",
} as const;
export const EditorMarkersViewStates = {
  ALWAYS: "always",
  NEVER: "never",
  WHEN_EDITING: "whenEditing",
} as const;

export const UsfmTokenTypes: Pick<
  typeof TokenMap,
  "marker" | "text" | "verseRange"
> = {
  marker: "marker",
  text: "text",
  verseRange: "verseRange",
};

export const USFM_TEXT_NODE_TYPE = "usfm-text-node" as const;
export const USFM_ELEMENT_NODE_TYPE = "usfm-element-node" as const;

export const TOKENS_TO_LOCK_FROM_EDITING = new Set([
  TokenMap.idMarker,
  TokenMap.endMarker,
  TokenMap.implicitClose,
  TokenMap.marker,
  TokenMap.verseRange,
]);
// type more loosel for includions checks
export const TOKEN_TYPES_CAN_TOGGLE_HIDE = new Set<string>([
  TokenMap.idMarker,
  TokenMap.endMarker,
  TokenMap.implicitClose,
  TokenMap.marker,
]);

export type USFMNodeJSON =
  | USFMElementNodeJSON
  | SerializedUSFMTextNode
  | SerializedLineBreakNode
  | USFMNestedEditorNodeJSON;
