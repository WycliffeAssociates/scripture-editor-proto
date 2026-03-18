// @ai this whole folder of lex I don't think should exist anymore right? We moved format to usfm-onion
// const isUnicodeEscape = (type: string) => type.startsWith("\\u");
// const isMarker = (text: string) =>
//   text.match(/^\\[a-z\d]+/u) && !isUnicodeEscape(text);
const markerWithoutBackslash = (text: string) => text.replace(/^\\/, "");
export const markerTrimNoSlash = (text: string) =>
    markerWithoutBackslash(text.trim());
export const markerRegex = /\\[a-z-\d]+(?=\s+)/u;
// const textRegex = /(?:[^\n|]|\\u[0-9A-Fa-f]{4})+/u;
export const numRangeRe = /[1-9][0-9]*(?:-[1-9])*[1-9]*[1-9]*/u;
type TokenName =
    | "nl"
    | "ws"
    | "pipe"
    | "attrPair"
    | "idMarker"
    | "bookCode"
    | "endMarker"
    | "implicitClose"
    | "marker"
    | "numberRange"
    | "text"
    | "error";

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
