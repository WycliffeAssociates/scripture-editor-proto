// --- NodeState Definitions ---

import { createState } from "lexical";

import { isUsfmTokenType, UsfmTokenTypes } from "@/app/data/editor.ts";
import type { AttributeItem } from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * Shared Lexical NodeState definitions for USFM nodes.
 *
 * These states are the metadata glue for the editor pipeline: tokenization,
 * structural maintenance, lint reconciliation, reference syncing, and DOM
 * styling all read/write these keys instead of maintaining separate maps.
 */

/**
 * Defines the NodeState for 'id'. It's a unique identifier for the node.
 */
const idState = createState("id", {
  parse: (value) => (typeof value === "string" ? value : ""),
});

/**
 * Defines the NodeState for 'sid'. It represents the Scripture ID (e.g., 'GEN 1:1').
 */
const sidState = createState("sid", {
  parse: (value) => (typeof value === "string" ? value : ""),
});

/**
 * Defines the NodeState for 'inPara'. It stores the USFM paragraph marker (e.g., 'p', 'q1').
 */
const inParaState = createState("inPara", {
  parse: (value) => (typeof value === "string" ? value : undefined),
});

const inCharsState = createState("inChars", {
  parse: (value) =>
    typeof value === "object" && Array.isArray(value)
      ? (value as Array<string>)
      : ([] as Array<string>),
});

/**
 * Defines the NodeState for 'tokenType'. It categorizes the node's purpose.
 * Examples: 'text', 'marker', 'numberRange'
 */
const tokenTypeState = createState("tokenType", {
  parse: (value) => (isUsfmTokenType(value) ? value : UsfmTokenTypes.text),
});

/**
 * Defines the NodeState for 'marker'. It holds the associated USFM marker if any (e.g., 'v', 'wj').
 */
const markerState = createState("marker", {
  parse: (value) => (typeof value === "string" ? value : undefined),
});

const attributesState = createState("attributes", {
  parse: (value) =>
    typeof value === "object" && Array.isArray(value)
      ? (value as AttributeItem[])
      : undefined,
});

const attributeSourceState = createState("attributeSource", {
  parse: (value) => (typeof value === "string" ? value : undefined),
});

const attributeOffsetState = createState("attributeOffset", {
  parse: (value) => (typeof value === "number" ? value : undefined),
});

/**
 * The `\id` token's payload: the book code and Onion's verdict on whether it
 * is a recognized USFM book identifier.
 *
 * Both or neither. A `bookCode`-kind token is refused without them, and half
 * a book code is refused too — validity is Onion's judgement, so supplying a
 * default here would be inventing the answer rather than carrying it.
 */
const bookCodeState = createState("bookCode", {
  parse: (value) => (typeof value === "string" ? value : undefined),
});

const bookCodeValidState = createState("bookCodeValid", {
  parse: (value) => (typeof value === "boolean" ? value : undefined),
});

/**
 * Defines the NodeState for 'markerText'. Stores the original text of a paragraph marker
 * (e.g., "\\p " or "\\p\n") to preserve whitespace for accurate diffing.
 */
const markerTextState = createState("markerText", {
  parse: (value) => (typeof value === "string" ? value : undefined),
});

const isStructuralEmptyState = createState("isStructuralEmpty", {
  parse: (value) => (typeof value === "boolean" ? value : false),
});

export {
  idState,
  sidState,
  inParaState,
  inCharsState,
  tokenTypeState,
  markerState,
  attributesState,
  attributeSourceState,
  attributeOffsetState,
  bookCodeState,
  bookCodeValidState,
  markerTextState,
  isStructuralEmptyState,
};
