// --- NodeState Definitions ---

import { createState } from "lexical";
import { UsfmTokenTypes } from "@/app/data/editor";

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
    parse: (value) => (typeof value === "string" ? value : ""),
});

/**
 * Defines the NodeState for 'tokenType'. It categorizes the node's purpose.
 * Examples: 'text', 'marker', 'verseRange'
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

/**
 * Defines the NodeState for 'show'. It controls the node's visibility.
 */
const showState = createState("show", {
    parse: (value) => (typeof value === "boolean" ? value : true),
});
const isMutableState = createState("isMutable", {
    parse: (value) => (typeof value === "boolean" ? value : true),
});
const classNameState = createState("classNames", {
    parse: (value) =>
        typeof value === "object" && value !== null ? value : {},
});
export {
    idState,
    sidState,
    inParaState,
    tokenTypeState,
    markerState,
    showState,
    isMutableState,
    classNameState,
};
