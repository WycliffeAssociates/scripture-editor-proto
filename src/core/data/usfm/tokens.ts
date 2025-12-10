export const CHAPTER_VERSE_MARKERS = new Set([
    "c",
    "ca",
    "cp",
    "v",
    "va",
    "vp",
]);

/* 
BORROWED FROM https://github.com/eten-tech-foundation/scripture-editors/
*/
/** @see https://docs.usfm.bible/usfm/3.1/note/index.html */
export const VALID_NOTE_MARKERS = new Set([
    // Footnote
    "f",
    "fe",
    "ef",
    // Cross Reference
    "x",
    "ex",
]);

/** @see https://docs.usfm.bible/usfm/3.1/char/notes/footnote/index.html */
export const VALID_CHAR_FOOTNOTE_MARKERS = new Set([
    "fr",
    "fq",
    "fqa",
    "fk",
    "ft",
    "fl",
    "fw",
    "fp",
    "fv",
    "fdc",
    "fm",
]);

/** @see https://docs.usfm.bible/usfm/3.1/char/notes/crossref/index.html */
export const VALID_CHAR_CROSS_REFERENCE_MARKERS = new Set([
    "xo",
    "xop",
    "xk",
    "xq",
    "xt",
    "xta",
    "xot",
    "xnt",
    "xdc",
]);

export const VALID_CHAR_MARKERS = new Set([
    // Chapter & Verse
    "ca",
    "cp",
    "va",
    "vp",

    // Text Features
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
    // "ref", // This has its own tag and is not a Char
    "sig",
    "sls",
    "tl",
    "w",
    "wa",
    "wg",
    "wh",
    "wj",
    // Note there are 2 deprecated markers intentionally not listed here: "addpn", "pro"

    // Text Formatting
    "bd",
    "it",
    "bdit",
    "no",
    "sc",
    "sup",

    // Introductions
    "ior",
    "iqt",

    // Poetry
    "qac",
    "qs",

    // Lists
    "litl",
    "lik",
    "liv",
    "liv1",
    "liv2",
    "liv3",
    "liv4",
    "liv5",
]);

const VALID_MILESTONE_MARKERS = new Set([
    "ts-s",
    "ts-e",
    "t-s",
    "t-e",
    "ts",
    "qt1-s",
    "qt1-e",
    "qt2-s",
    "qt2-e",
    "qt3-s",
    "qt3-e",
    "qt4-s",
    "qt4-e",
    "qt5-s",
    "qt5-e",
    "qt-s",
    "qt-e",
]);
export const ALL_CHAR_MARKERS = new Set([
    ...VALID_NOTE_MARKERS,
    ...VALID_CHAR_FOOTNOTE_MARKERS,
    ...VALID_CHAR_CROSS_REFERENCE_MARKERS,
    ...VALID_CHAR_MARKERS,
    ...VALID_MILESTONE_MARKERS,
]);
export const All_EXPLICT_CHAR_CLOSE_MARKERS = [...ALL_CHAR_MARKERS].reduce(
    (acc, marker) => {
        acc.add(`\\${marker}*`);
        return acc;
    },
    new Set<string>(),
);
export const NON_NOTE_CHAR_OPEN_MARKERS = new Set([
    ...VALID_CHAR_MARKERS,
    ...VALID_MILESTONE_MARKERS,
]);
export const NON_NOTE_CHAR_CLOSE_MARKERS = new Set(
    [...NON_NOTE_CHAR_OPEN_MARKERS].map((marker) => `\\${marker}*`),
);
export const NOTE_CHAR_OPEN_MARKERS = new Set([
    ...VALID_CHAR_FOOTNOTE_MARKERS,
    ...VALID_CHAR_CROSS_REFERENCE_MARKERS,
]);
export const NOTE_CHAR_CLOSE_MARKERS = new Set(
    [...NOTE_CHAR_OPEN_MARKERS].map((marker) => `\\${marker}*`),
);

export const VALID_PARA_MARKERS = new Set([
    // Identification
    "ide",
    "sts",
    "rem",
    "h",
    "toc1",
    "toc2",
    "toc3",
    "toca1",
    "toca2",
    "toca3",
    // Introductions
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
    // Titles and Headings
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
    "s5", //not spec compliant but exists in the wild
    "sr",
    "r",
    "d",
    "sp",
    "sd",
    "sd1",
    "sd2",
    "sd3",
    "sd4",
    // Body Paragraphs
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
    "mi",
    "lit",
    "nb",
    // Note there is 1 deprecated marker not listed here: "ph#"
    // Poetry
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
    "b",
    // Lists
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
    // Breaks - see https://docs.usfm.bible/usfm/3.1/char/breaks/pb.html
    "pb",
]);
export const DOCUMENT_MARKERS = new Set(["id", "usfm"]);
export const isValidParaMarker = (marker: string) => {
    return VALID_PARA_MARKERS.has(marker);
};

export const ALL_USFM_MARKERS = new Set([
    ...DOCUMENT_MARKERS,
    ...VALID_PARA_MARKERS,
    ...VALID_CHAR_MARKERS,
    ...VALID_CHAR_FOOTNOTE_MARKERS,
    ...VALID_CHAR_CROSS_REFERENCE_MARKERS,
    ...VALID_MILESTONE_MARKERS,
    ...VALID_NOTE_MARKERS,
    ...CHAPTER_VERSE_MARKERS,
]);

// todo: really this list needs close vetting
export const TOKENS_EXPECTING_CLOSE = new Set([
    ...VALID_NOTE_MARKERS,
    ...VALID_CHAR_MARKERS,
    ...VALID_MILESTONE_MARKERS,
]);
