export const POETRY_MARKERS = new Set([
    "q",
    "q1",
    "q2",
    "q3",
    "q4",
    "q5",
    "qc",
    "qa",
    "qm",
    "qm1",
    "qm2",
    "qm3",
    "qd",
]);

/**
 * Markers that should ALWAYS start on a new line AND have a linebreak AFTER.
 * These are structural markers like paragraphs, headings, and lists.
 */
export const PRETTIFY_LINEBREAK_BEFORE_AND_AFTER_MARKERS = new Set([
    // Major structural markers
    "p",
    "m",
    "pi",
    "pi1",
    "pi2",
    "pi3",
    "pi4",
    "ms",
    "ms1",
    "ms2",
    "ms3",
    // Lists
    "li",
    "li1",
    "li2",
    "li3",
    "li4",
    // Blank line
    "b",
]);

/**
 * Markers that should ALWAYS start on a new line.
 * Examples: chapter labels, descriptors, and other markers that have inline content.
 */
const LINEBREAK_BEFORE_ONLY_MARKERS = new Set([
    "cl",
    "cd",
    "d",
    "sp",
    "r",
    "mr",
    "sr",
    // Section headings
    "s",
    "s1",
    "s2",
    "s3",
    "s4",
    "s5",
]);

/**
 * Markers that should start on a new line IF followed by another marker.
 */
export const PRETTIFY_LINEBREAK_BEFORE_IF_NEXT_MARKER_MARKERS = new Set(
    POETRY_MARKERS,
);

/**
 * All markers that should start on a new line.
 */
export const PRETTIFY_LINEBREAK_BEFORE_MARKERS = new Set([
    ...PRETTIFY_LINEBREAK_BEFORE_AND_AFTER_MARKERS,
    ...LINEBREAK_BEFORE_ONLY_MARKERS,
    ...PRETTIFY_LINEBREAK_BEFORE_IF_NEXT_MARKER_MARKERS,
]);
