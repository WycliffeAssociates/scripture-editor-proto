import { VALID_PARA_MARKERS } from "@/core/data/usfm/tokens.ts";

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
 * Markers that should ALWAYS have a linebreak inserted BEFORE AND AFTER.
 * These are structural markers like paragraphs, headings, and lists.
 */
const LINEBREAK_BEFORE_AND_AFTER_MARKERS = new Set([
    // Major structural markers
    "p",
    "m",
    "pi",
    "pi1",
    "pi2",
    "pi3",
    "pi4",
    // Section headings
    "s",
    "s1",
    "s2",
    "s3",
    "s4",
    "s5",
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
 * Markers that should ONLY have a linebreak inserted BEFORE them (not after).
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
]);

/**
 * All markers that should have a linebreak BEFORE them.
 */
export const PRETTIFY_LINEBREAK_BEFORE_MARKERS = new Set([
    ...LINEBREAK_BEFORE_AND_AFTER_MARKERS,
    ...LINEBREAK_BEFORE_ONLY_MARKERS,
    ...POETRY_MARKERS,
]);

/**
 * Markers that should ALWAYS get a linebreak AFTER them (unconditionally).
 */
export const PRETTIFY_LINEBREAK_AFTER_MARKERS = new Set([
    ...LINEBREAK_BEFORE_AND_AFTER_MARKERS,
]);

export const PRETTIFY_LINEBREAK_BEFORE_ONLY_MARKERS =
    LINEBREAK_BEFORE_ONLY_MARKERS;

export const PRETTIFY_VALID_PARA_MARKERS = VALID_PARA_MARKERS;
