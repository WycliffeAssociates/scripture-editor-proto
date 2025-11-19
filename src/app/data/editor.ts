import {
  HISTORIC_TAG,
  HISTORY_MERGE_TAG,
  type SerializedLineBreakNode,
} from "lexical";
import type { USFMElementNodeJSON } from "@/app/domain/editor/nodes/USFMElementNode.ts";
import type { USFMNestedEditorNodeJSON } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import type { SerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { TokenMap } from "@/core/domain/usfm/lex.ts";

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
export const USFM_ELEMENT_NODE_TYPE = "usfm-element-node" as const;

export const TOKENS_TO_LOCK_FROM_EDITING = new Set([
  TokenMap.idMarker,
  TokenMap.endMarker,
  TokenMap.implicitClose,
  TokenMap.marker,
  // TokenMap.numberRange,
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
