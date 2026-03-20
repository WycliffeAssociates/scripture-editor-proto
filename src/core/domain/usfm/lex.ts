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
