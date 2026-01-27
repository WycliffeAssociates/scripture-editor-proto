// bibleUtils.ts
// Core canonical ordering of books (standard 66)
const BIBLE_ORDER = [
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
] as const;

const BIBLE_ORDER_MAP = new Map<string, number>(
    BIBLE_ORDER.map((b, i) => [b, i]),
);

function matchBook(input: string): string | null {
    const normalized = input.toLowerCase().replace(/\s+/g, "");
    for (const [id, aliases] of Object.entries(BOOK_ALIASES)) {
        if (
            aliases.some(
                (alias) =>
                    normalized.startsWith(alias) ||
                    normalized === id.toLowerCase(),
            )
        ) {
            return id;
        }
    }
    return null;
}

// --- 1. Canonical sort of files --------------------------------------------

export function sortUsfmFilesByCanonicalOrder<T, K extends keyof T>(
    files: T[],
    keyField: K,
): T[] {
    return [...files].sort((a, b) => {
        const fieldA = a[keyField];
        const fieldB = b[keyField];
        if (!fieldA || !fieldB) return 0;
        const aSlug = getBookSlug(fieldA as unknown as string);
        const bSlug = getBookSlug(fieldB as unknown as string);
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

// --- 3. Fuzzy book matching ------------------------------------------------

// Simplified fuzzy map (abbreviations and English names)
const BOOK_ALIASES: Record<(typeof BIBLE_ORDER)[number], string[]> = {
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
    "1CH": ["1 chronicles", "1 chron", "1ch", "1chr", "2chro", "2chron"],
    "2CH": ["2 chronicles", "2 chron", "2ch", "2chr", "2chron", "2chro"],
    EZR: ["ezra", "ezr", "ez"],
    NEH: ["nehemiah", "neh", "ne"],
    EST: ["esther", "est", "es"],
    JOB: ["job"],
    PSA: ["psalms", "ps", "psa"],
    PRO: ["proverbs", "pro", "pr"],
    ECC: ["ecclesiastes", "ecc", "ec", "ecce"],
    SNG: ["song of solomon", "song", "sng", "sol"],
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
    "1CO": ["1corinthians", "1cor", "1co", "1corinthians"],
    "2CO": ["2corinthians", "2cor", "2co"],
    GAL: ["galatians", "gal", "gl"],
    EPH: ["ephesians", "eph", "ep"],
    PHP: ["philippians", "philippian", "phil", "ph", "php"],
    COL: ["colossians", "col", "cl"],
    "1TH": ["1 thessalonians", "1 thess", "1th", "1 th"],
    "2TH": ["2 thessalonians", "2 thess", "2th", "2 th"],
    "1TI": ["1 timothy", "1 tim", "1ti"],
    "2TI": ["2 timothy", "2 tim", "2ti"],
    TIT: ["titus", "tit"],
    PHM: ["philemon", "phm"],
    HEB: ["hebrews", "heb", "hl"],
    JAS: ["james", "jas"],
    "1PE": ["1 peter", "1 pet", "1pe"],
    "2PE": ["2 peter", "2 pet", "2pe"],
    "1JN": ["1 john", "1 jn", "1 joh"],
    "2JN": ["2 john", "2 jn", "2 joh"],
    "3JN": ["3 john", "3 jn", "3 joh"],
    JUD: ["jude", "jud"],
    REV: [
        "revelation",
        "revelations",
        "rev",
        "revlation",
        "revation",
        "revlon",
    ],
};

// function matchBook(input: string): string | null {
//     const normalized = input.toLowerCase().replace(/\s+/g, "");
//     for (const [id, aliases] of Object.entries(BOOK_ALIASES)) {
//         if (
//             aliases.some(
//                 (alias) =>
//                     normalized.startsWith(alias) ||
//                     normalized === id.toLowerCase(),
//             )
//         ) {
//             return id;
//         }
//     }
//     return null;
// }

// --- 4. Parse free-form references ----------------------------------------
//word or digit 3, all ws or noe, 1-3 digits, colon, 1-3 digits optional hyphen 1-3 digits optional. I.e. this supports
// 1CO 1:1 and 1CO 1:1-2, but not sequences like 1,2
const SID_REGEX = /(.{3})\s*(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?/;
const SID_REGEX_BOOK_CHAP_ONLY = /(.{3})\s*(\d{1,3})/;
export interface ParsedReference {
    book: string;
    chapter: number;
    verseStart: number;
    verseEnd: number;
    isBookChapOnly: boolean;
    toSidString(): string;
    getNewParsedReference(args: Partial<ParsedReference>): ParsedReference;
}
export function parseSid(sid: string): ParsedReference | null {
    const fullVerseSid = SID_REGEX.exec(sid.toUpperCase());
    if (!fullVerseSid) {
        const bookChapOnly = SID_REGEX_BOOK_CHAP_ONLY.exec(sid.toUpperCase());
        if (!bookChapOnly) return null;
        const [, book, chap] = bookChapOnly;
        if (!BIBLE_ORDER_MAP.has(book)) return null;
        return {
            book,
            chapter: Number(chap),
            verseStart: 1,
            verseEnd: 1,
            isBookChapOnly: true,
            toSidString() {
                return `${book} ${this.chapter}`;
            },
            getNewParsedReference(args: Partial<ParsedReference>) {
                return {
                    ...this,
                    ...args,
                };
            },
        };
    }
    const [, book, chap, start, end] = fullVerseSid;
    if (!BIBLE_ORDER_MAP.has(book)) return null;
    return {
        book,
        chapter: Number(chap),
        verseStart: Number(start),
        verseEnd: end ? Number(end) : Number(start),
        isBookChapOnly: false,
        toSidString() {
            if (this.verseStart !== this.verseEnd) {
                return `${book} ${this.chapter}:${this.verseStart}-${this.verseEnd}`;
            }
            return `${book} ${this.chapter}:${this.verseStart}`;
        },
        getNewParsedReference(args: Partial<ParsedReference>) {
            return {
                ...this,
                ...args,
            };
        },
    };
}

type MakeSidPart = {
    bookId: string;
    chapter: number;
    verseStart?: number;
    verseEnd?: number;
};
export function makeSid({
    bookId,
    chapter,
    verseStart,
    verseEnd,
}: MakeSidPart) {
    if (!verseStart || !verseEnd) {
        return `${bookId.toUpperCase()} ${chapter}`;
    }
    if (verseStart === verseEnd) {
        return `${bookId.toUpperCase()} ${chapter}:${verseStart}`;
    }
    return `${bookId.toUpperCase()} ${chapter}:${verseStart}-${verseEnd}`;
}

// --- 5. Parse fuzzy input like “1 cor 3” or "gen 3:3" ----------------------------------
export function parseReference(input: string) {
    const normalized = input.toLowerCase().trim();
    // Match book and chapter, and optionally verse
    // Supports: "gen 3", "gen 3:3", "1cor 3:3", "1 cor 3", "mat 4.4", "mat 4 4"
    // Regex breakdown:
    // ^(\d?\s*[a-z]+)      -> Book: optional leading digit, optional space, then letters
    // \s*(\d+)             -> Chapter: optional space, then digits
    // (?:[:.\s](\d+))?     -> Verse: optional separator (colon, period, or space), then digits
    const match = normalized.match(
        /^(\d?\s*[a-z]+)\s*(\d+)?(?:[:.\s](\d+))?$/i,
    );
    if (!match) return null;

    const [, rawBook, rawChap, rawVerse] = match;
    const bookId = matchBook(rawBook.replace(/\s+/g, ""));

    return {
        knownBookId: bookId,
        bookMatch: rawBook.trim(),
        chapter: rawChap ? Number(rawChap) : null,
        verse: rawVerse ? Number(rawVerse) : null,
    };
}

export function sortListBySidCanonical<T extends { sid: string }>(list: T[]) {
    return list.sort((a, b) => {
        const aParsed = parseSid(a.sid);
        const bParsed = parseSid(b.sid);
        if (!aParsed || !bParsed) {
            return 0;
        }
        // first sort by bible book id
        const aBookIdx = BIBLE_ORDER_MAP.get(aParsed.book);
        const bBookIdx = BIBLE_ORDER_MAP.get(bParsed.book);
        if (aBookIdx === undefined || bBookIdx === undefined) {
            return 0;
        }
        if (aBookIdx !== bBookIdx) {
            return aBookIdx - bBookIdx;
        }
        // then sort by chapter
        if (aParsed.chapter !== bParsed.chapter) {
            return aParsed.chapter - bParsed.chapter;
        }
        // then sort by verse
        if (aParsed.verseStart !== bParsed.verseStart) {
            return aParsed.verseStart - bParsed.verseStart;
        }
        return 0;
    });
}
