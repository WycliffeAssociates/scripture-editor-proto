// --- NodeState Definitions ---

import { createState } from "lexical";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

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
    parse: (value) => (typeof value === "string" ? value : UsfmTokenTypes.text),
});

/**
 * Defines the NodeState for 'marker'. It holds the associated USFM marker if any (e.g., 'v', 'wj').
 */
const markerState = createState("marker", {
    parse: (value) => (typeof value === "string" ? value : undefined),
});

const lintErrorsState = createState("lintErrors", {
    parse: (value) =>
        typeof value === "object" && Array.isArray(value)
            ? (value as Array<LintIssue>)
            : ([] as Array<LintIssue>),
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
    lintErrorsState,
    markerTextState,
    isStructuralEmptyState,
};
