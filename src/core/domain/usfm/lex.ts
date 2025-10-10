import moo from "moo";

const isUnicodeEscape = (type: string) => type.startsWith("\\u");
const isMarker = (text: string) =>
    text.startsWith("\\") && !isUnicodeEscape(text);
const markerWithoutBackslash = (text: string) => text.replace(/^\\/, "");

const lexer = moo.states({
    main: {
        // --- 1. Whitespace (Handled first, but not skipped) ---
        nl: {
            match: /\r?\n/u,
            lineBreaks: true,
            value() {
                // ie a single new line
                return "\n";
            },
        },
        ws: {
            match: /[ \t]+/u,
            value(v) {
                // A single instance of whatever whitespace was found
                return v[0] || " ";
            },
        },

        // pipe delimits attributes
        pipe: "|",

        // An attribute key-value pair.
        attrPair: /[a-zA-Z0-9\-_]+="(?:\\.|[^"\\])*"/u,

        idMarker: {
            match: /\\id\b/u,
            lineBreaks: true,
            push: "specific",
            value(x) {
                return markerWithoutBackslash(x);
            },
        },
        endMarker: /\\\S*\*/u,
        implicitClose: "\\*",
        marker: {
            match: /\\\S+/u,
            value(x) {
                return markerWithoutBackslash(x);
            },
        },

        // A number that could also be text
        verseRange: /[1-9][0-9]*[\p{L}\p{Mn}]*(?:[\-,][0-9]+[\p{L}\p{Mn}]*)*/u,
        // --- 7. Content and Error Tokens (The Final Fallbacks) ---
        // Unambiguous Text: CANNOT start with `\`, `|`, or a digit.
        // This resolves the conflict with markers and numbers.
        text: { match: /(?:[^\n\\|]|\\u[0-9A-Fa-f]{4})+/u, lineBreaks: true },

        // Error token: If none of the above match, consume everything until the next `\` or newline.
        // This is a "catch-all" for malformed content.
        // This should be the VERY LAST rule in your object.
        error: {
            match: /\\[^\\]+/u,
            error: true,
        },
    },
    specific: {
        bookCode: { match: /[A-Z1-9]{3}/u, pop: 1 },
        ws: /[ \t]+/u,
    },
});
export type TokenName =
    | "nl"
    | "ws"
    | "pipe"
    | "attrPair"
    | "idMarker"
    | "endMarker"
    | "implicitClose"
    | "marker"
    | "verseRange"
    | "text"
    | "error";
export interface TokenNameSubset extends Set<TokenName> {}

export const TokenMap: Record<string, TokenName> = {
    horizontalWhitespace: "ws",
    verticalWhitespace: "nl",
    pipe: "pipe",
    attributePair: "attrPair",
    idMarker: "idMarker",
    endMarker: "endMarker",
    implicitClose: "implicitClose",
    marker: "marker",
    verseRange: "verseRange",
    text: "text",
    error: "error",
};

export const lexUsfm = (text: string) => {
    const tokens = Array.from(lexer.reset(text));
    return tokens;
};
