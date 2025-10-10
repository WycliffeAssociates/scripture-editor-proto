// bibleUtils.ts
// Core canonical ordering of books (standard 66)
export const BIBLE_ORDER = [
    "GEN",
    "EXO",
    "LEV",
    "NUM",
    "DEU",
    "JOS",
    "JDG",
    "RUT",
    "1SA",
    "2SA",
    "1KI",
    "2KI",
    "1CH",
    "2CH",
    "EZR",
    "NEH",
    "EST",
    "JOB",
    "PSA",
    "PRO",
    "ECC",
    "SNG",
    "ISA",
    "JER",
    "LAM",
    "EZK",
    "DAN",
    "HOS",
    "JOL",
    "AMO",
    "OBA",
    "JON",
    "MIC",
    "NAM",
    "HAB",
    "ZEP",
    "HAG",
    "ZEC",
    "MAL",
    "MAT",
    "MRK",
    "LUK",
    "JHN",
    "ACT",
    "ROM",
    "1CO",
    "2CO",
    "GAL",
    "EPH",
    "PHP",
    "COL",
    "1TH",
    "2TH",
    "1TI",
    "2TI",
    "TIT",
    "PHM",
    "HEB",
    "JAS",
    "1PE",
    "2PE",
    "1JN",
    "2JN",
    "3JN",
    "JUD",
    "REV",
];

export const BIBLE_ORDER_MAP = new Map<string, number>(
    BIBLE_ORDER.map((b, i) => [b, i]),
);

// --- 1. Canonical sort of files --------------------------------------------

export function sortUsfmFilesByCanonicalOrder<T extends { name: string }>(
    files: T[],
): T[] {
    return [...files].sort((a, b) => {
        const aSlug = getBookSlug(a.name);
        const bSlug = getBookSlug(b.name);
        return (
            (BIBLE_ORDER_MAP.get(aSlug) ?? 0) -
            (BIBLE_ORDER_MAP.get(bSlug) ?? 0)
        );
    });
}

export function getBookSlug(book: string): string {
    const dashIndex = book.indexOf("-");
    const slug =
        dashIndex !== -1
            ? book.slice(dashIndex + 1, dashIndex + 4)
            : book.slice(0, 3);
    return slug.toUpperCase();
}

// --- 2. Navigation (previous / next book) ---------------------------------

export function getNeighborBook(
    bookId: string,
    dir: "prev" | "next",
): string | null {
    const idx = BIBLE_ORDER_MAP.get(bookId);
    if (idx === undefined) return null;
    const newIdx = dir === "prev" ? idx - 1 : idx + 1;
    return BIBLE_ORDER[newIdx] ?? null;
}

// --- 3. Fuzzy book matching ------------------------------------------------

// Simplified fuzzy map (abbreviations and English names)
const BOOK_ALIASES: Record<string, string[]> = {
    GEN: ["genesis", "gen", "ge"],
    EXO: ["exodus", "exo", "ex"],
    LEV: ["leviticus", "lev", "lv"],
    NUM: ["numbers", "num", "nu"],
    DEU: ["deuteronomy", "deut", "de"],
    JOS: ["joshua", "jos", "js"],
    JDG: ["judges", "jud", "jd"],
    RUT: ["ruth", "rt"],
    "1SA": ["1 samuel", "1 sam", "1sa", "1sm"],
    "2SA": ["2 samuel", "2 sam", "2sa", "2sm"],
    "1KI": ["1 kings", "1 ki", "1k"],
    "2KI": ["2 kings", "2 ki", "2k"],
    ISA: ["isaiah", "isa", "is"],
    JER: ["jeremiah", "jer", "je"],
    LAM: ["lamentations", "lam"],
    EZK: ["ezekiel", "ezek", "ez"],
    DAN: ["daniel", "dan", "da"],
    HOS: ["hosea", "hos"],
    JOL: ["joel", "jl"],
    AMO: ["amos", "am"],
    OBA: ["obadiah", "oba"],
    JON: ["jonah", "jon"],
    MIC: ["micah", "mic", "mi"],
    NAM: ["nahum", "nah", "na"],
    HAB: ["habakkuk", "hab", "hb"],
    ZEP: ["zephaniah", "zeph", "zep", "zh"],
    HAG: ["haggai", "hag"],
    ZEC: ["zechiah", "zech", "zec", "zc"],
    MAL: ["malachi", "mal", "ml"],
    MAT: ["matthew", "matt", "mat", "mt"],
    MRK: ["mark", "mrk", "mk"],
    LUK: ["luke", "lk"],
    JHN: ["john", "jn", "jhn"],
    ACT: ["acts", "ac"],
    ROM: ["romans", "rom", "rm"],
    COR: ["corinthians", "cor", "co"],
    GAL: ["galatians", "gal", "gl"],
    EPH: ["ephesians", "eph", "ep"],
    PHI: ["philippians", "philippian", "phil", "ph", "php"],
    COL: ["colossians", "col", "cl"],
    TH1: ["1 thessalonians", "1 thess", "1th", "1 th"],
    TH2: ["2 thessalonians", "2 thess", "2th", "2 th"],
    "1TI": ["1 timothy", "1 tim", "1ti"],
    "2TI": ["2 timothy", "2 tim", "2ti"],
    TIT: ["titus", "tit"],
    PHM: ["philemon", "phm"],
    HEB: ["hebrews", "heb", "hl"],
    JAS: ["james", "jas"],
    "1PE": ["1 peter", "1 pet", "1pe"],
    "2PE": ["2 peter", "2 pet", "2pe"],
    "1JO": ["1 john", "1 jn", "1 joh"],
    "2JO": ["2 john", "2 jn", "2 joh"],
    "3JO": ["3 john", "3 jn", "3 joh"],
    JUD: ["jude", "jud"],
    REV: [
        "revelation",
        "revelations",
        "rev",
        "revlation",
        "revation",
        "revlon",
    ],
    // ... add the rest
};

export function matchBook(input: string): string | null {
    const normalized = input.toLowerCase().replace(/\s+/g, "");
    for (const [id, aliases] of Object.entries(BOOK_ALIASES)) {
        if (aliases.some((alias) => normalized.startsWith(alias))) {
            return id;
        }
    }
    return null;
}

// --- 4. Parse free-form references ----------------------------------------
//word or digit 3, all ws or noe, 1-3 digits, colon, 1-3 digits optional hyphen 1-3 digits optional. I.e. this supports
// 1CO 1:1 and 1CO 1:1-2, but not sequences like 1,2
const SID_REGEX = /(.{3})\s*(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?/;

export interface ParsedReference {
    book: string;
    chapter: number;
    verseStart: number;
    verseEnd: number;
}
export function parseSid(sid: string): ParsedReference | null {
    const m = SID_REGEX.exec(sid.toUpperCase());
    if (!m) return null;
    const [, book, chap, start, end] = m;
    if (!BIBLE_ORDER_MAP.has(book)) return null;
    return {
        book,
        chapter: Number(chap),
        verseStart: Number(start),
        verseEnd: end ? Number(end) : Number(start),
    };
}

// --- 5. Parse fuzzy input like “1 cor 3” ----------------------------------

export function parseReference(input: string) {
    const normalized = input.toLowerCase().replace(/\s+/g, "");
    const match = normalized.match(/^(\d?[a-z]+)(\d+)?$/i);
    if (!match) return null;
    const [, rawBook, rawChap] = match;
    const bookId = matchBook(rawBook);
    return bookId
        ? { book: bookId, chapter: rawChap ? Number(rawChap) : null }
        : null;
}
