/**
 * Shared lexical constants used by the USFM token pipeline. These values keep the
 * editor-side adapters and the lower-level USFM helpers talking about the same
 * token kinds and marker patterns.
 */
const markerWithoutBackslash = (text: string) => text.replace(/^\\/, "");
export const markerTrimNoSlash = (text: string) =>
    markerWithoutBackslash(text.trim());
export const markerRegex = /\\[a-z-\d]+(?=\s+)/u;
export const numRangeRe = /[1-9][0-9]*(?:-[1-9])*[1-9]*[1-9]*/u;

export const TokenMap = {
    horizontalWhitespace: "ws",
    verticalWhitespace: "nl",
    pipe: "pipe",
    attributePair: "attrPair",
    idMarker: "idMarker",
    bookCode: "bookCode",
    endMarker: "endMarker",
    implicitClose: "implicitClose",
    marker: "marker",
    numberRange: "numberRange",
    text: "text",
    error: "error",
} as const;
