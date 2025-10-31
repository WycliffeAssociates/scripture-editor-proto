import moo from "moo";

const isUnicodeEscape = (type: string) => type.startsWith("\\u");
export const isMarker = (text: string) =>
    text.match(/^\\[a-z\d]+/u) && !isUnicodeEscape(text);
const markerWithoutBackslash = (text: string) => text.replace(/^\\/, "");
export const markerTrimNoSlash = (text: string) =>
    markerWithoutBackslash(text.trim());
const textRegex = /(?:[^\n\\|]|\\u[0-9A-Fa-f]{4}|(?<=.)\\\\)+/u;
export const markerRegex = /\\[a-z-\d]+(?=\s+)/u;
// const textRegex = /(?:[^\n|]|\\u[0-9A-Fa-f]{4})+/u;
const wsRegex = /[ \t]+/u;
const nlRegex = /\r?\n/u;
// lex rules order is important. more specific rules should come before less specific rules;
const lexer = moo.states({
    main: {
        nl: {
            match: nlRegex,
            lineBreaks: true,
            value() {
                return "\n";
            },
        },
        ws: {
            match: wsRegex,
            value(v) {
                // A single instance of whatever whitespace was foun
                return v[0] || " ";
            },
        },

        // pipe delimits attributes
        pipe: "|",

        // An attribute key-value pair.
        attrPair: /[a-zA-Z0-9\-_]+="(?:\\.|[^"\\])*"/u,

        // we need to spell out a few markers specifically in order to pop into others states, such as expectingBookCode / numberRage
        idMarker: {
            match: /\\id\b/u,
            lineBreaks: true,
            next: "expectingBookCode",
        },
        // chapter + verse expect a number after:
        chapterMarker: {
            match: /\\c\b/u,
            next: "expectingNumberRange",
        },
        chapterAltOpen: {
            match: /\\ca/u,
            next: "expectingNumberRange",
        },
        chapterPublished: {
            match: /\\cp/u,
            next: "expectingNumberRange",
        },
        verseMarker: {
            match: /\\v\b/u,
            next: "expectingNumberRange",
        },
        verseAltOpen: {
            match: /\\va/u,
            next: "expectingNumberRange",
        },
        versePublished: {
            match: /\\vp/u,
            next: "expectingNumberRange",
        },
        endMarker: /\\\S*\*/u,
        implicitClose: "\\*",
        marker: {
            match: markerRegex,
            //   match: /\\\S+/u,
        },
        // this is a much simpler version of numberRange that only is bridghe with dash
        // numberRange: {
        //   match: /[1-9][0-9]*(?:-[1-9])*[1-9]*[1-9]*/u,
        // we push to specific so that a line line such as:\v 28 8,600 males have been counted aged one month old and older to perform the duties of the sanctuary. doesn't parse as numberRange + numberRange
        //   push: "specific",
        // },
        // the USFM site number range is more complex and allows for letters and other characters
        // numberRange: /[1-9][0-9]*[\p{L}\p{Mn}]*(?:[-,][0-9]+[\p{L}\p{Mn}]*)*/u,

        text: { match: textRegex, lineBreaks: true },

        // Error token: If none of the above match, consume everything until the next `\` or newline.
        // This is a "catch-all" for malformed content.
        // This should be the VERY LAST rule in your object.
        error: {
            match: /.+/u,
            error: true,
        },
    },
    expectingBookCode: {
        bookCode: { match: /[A-Z1-9]{3}/u, next: "main" },
        ws: wsRegex,
        nl: {
            match: nlRegex,
            lineBreaks: true,
            value() {
                return "\n";
            },
            next: "main",
        },
    },
    expectingNumberRange: {
        numberRange: {
            match: /[1-9][0-9]*(?:-[1-9])*[1-9]*[1-9]*/u,
            next: "specific",
        },

        ws: wsRegex,
        nl: {
            match: nlRegex,
            lineBreaks: true,
            value() {
                return "\n";
            },
            next: "specific",
        },
        // if numberRange Doesn't match first, fall back to text and go to main
        text: { match: textRegex, lineBreaks: true, next: "main" },
    },
    specific: {
        text: { match: textRegex, lineBreaks: true, next: "main" },
        ws: wsRegex,
        nl: {
            match: nlRegex,
            lineBreaks: true,
            value() {
                return "\n";
            },
            next: "main",
        },
    },
});
export type TokenName =
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
export interface TokenNameSubset extends Set<TokenName> {}

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

export const lexUsfm = (text: string) => {
    const tokens = Array.from(lexer.reset(text));
    return tokens;
};
