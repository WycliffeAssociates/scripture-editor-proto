import moo from "moo";

// Helper for creating regexes for markers with optional numbers
const re = (marker: string, level = "") =>
  new RegExp(`\\\\${marker}${level}`, "u");

export const tokensExpectingClose = new Set([
  "ca",
  "va",
  "vp",
  "add",
  "bk",
  "dc",
  "em",
  "jmp",
  "k",
  "nd",
  "ord",
  "pn",
  "png",
  "qt",
  "rb",
  "rq",
  "ref",
  "sig",
  "sls",
  "tl",
  "w",
  "wa",
  "wg",
  "wh",
  "wj",
  "bd",
  "it",
  "bdit",
  "no",
  "sc",
  "sup",
  "ior",
  "iqt",
  "qas",
  "qs",
  "litl",
  "lik",
  "liv",
  "f",
  "fr",
  "fq",
  "fqa",
  "fk",
  "fl",
  "ft",
  "fv",
  "fm",
  "xop",
  "xta",
  "xot",
  "xnt",
  "xdc",
  "qtMilestoneStart",
  "tsMilestoneStart",
  "fig",
  "cat",
  "esb",
  "f",
  "fe",
  "ef",
  "x",
  "ex",
]);

export const paraIdentificationTokens = new Set([
  "ide",
  "sts",
  "rem",
  "h",
  "toc",
  "toc1",
  "toc2",
  "toc3",
  "toca",
  "toca1",
  "toca2",
  "toca3",
]);
export const paraIntroTokens = new Set([
  "imt",
  "imt1",
  "imt2",
  "imt3",
  "imt4",
  "is",
  "is1",
  "is2",
  "ip",
  "ipi",
  "im",
  "imi",
  "ipq",
  "imq",
  "ipr",
  "iq",
  "iq1",
  "iq2",
  "iq3",
  "ili",
  "ili1",
  "ili2",
  "ib",
  "iot",
  "io",
  "io1",
  "io2",
  "io3",
  "io4",
  "iex",
  "imte",
  "imte1",
  "imte2",
  "ie",
]);

export const paraTitlesAndSections = new Set([
  "mt",
  "mt1",
  "mt2",
  "mt3",
  "mt4",
  "mte",
  "mte1",
  "mte2",
  "cl",
  "cd",
  "ms",
  "ms1",
  "ms2",
  "ms3",
  "mr",
  "s",
  "s1",
  "s2",
  "s3",
  "s4",
  "s5",
  "sr",
  "r",
  "d",
  "sp",
  "sd",
  "sd1",
  "sd2",
  "sd3",
  "sd4",
]);
export const paraBodyParagraphs = new Set([
  "p",
  "m",
  "po",
  "cls",
  "pr",
  "pc",
  "pm",
  "pmo",
  "pmc",
  "pmr",
  "pi",
  "pi1",
  "pi2",
  "pi3",
  "pi4",
  "mi",
  "lit",
  "nb",
  "b",
]);
export const paraPoetry = new Set([
  "q",
  "q1",
  "q2",
  "q3",
  "q4",
  "qr",
  "qc",
  "qa",
  "qm",
  "qm1",
  "qm2",
  "qm3",
  "qd",
]);
export const paraLists = new Set([
  "lh",
  "li",
  "li1",
  "li2",
  "li3",
  "li4",
  "lf",
  "lim",
  "lim1",
  "lim2",
  "lim3",
  "lim4",
]);
export const paraTables = new Set(["tr"]);

export const allParaTokens = new Set([
  ...paraIdentificationTokens,
  ...paraIntroTokens,
  ...paraTitlesAndSections,
  ...paraBodyParagraphs,
  ...paraPoetry,
  ...paraLists,
  ...paraTables,
]);
export const chaptersAndVerses = new Set(["c", "ca", "cp", "v", "va", "vp"]);

// titles and

const isUnicodeEscape = (type: string) => type.startsWith("\\u");
export const isMarker = (text: string) =>
  text.startsWith("\\") && !isUnicodeEscape(text);

const markerWithoutBackslash = (text: string) => text.replace(/^\\/, "");

/* 
So, lex, 
1. get rid of whitespace: 
2. For tokens that take "content" inline and should be a unit, group, ie {marker: mt, content: "string"} or {marker: v, content: "string"};  do so by looking ahead to next text token, or verseRange for v's and c's but without cross a newline boundary. 
3. Nest the chars
*/
/* 
marker with content: 
\mt 1
\v 2

empty marker: 
\p

text: 
wrap text

chars:
\nd content: 
*/

export const lexer = moo.states({
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
    text: {match: /(?:[^\n\\|]|\\u[0-9A-Fa-f]{4})+/u, lineBreaks: true},

    // Error token: If none of the above match, consume everything until the next `\` or newline.
    // This is a "catch-all" for malformed content.
    // This should be the VERY LAST rule in your object.
    error: {
      match: /\\[^\\]+/u,
      error: true,
    },
  },
  specific: {
    bookCode: {match: /[A-Z1-9]{3}/u, pop: 1},
    ws: /[ \t]+/u,
  },
});
