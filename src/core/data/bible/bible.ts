const bibleOrder = [
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
const bibleOrderMap = new Map(bibleOrder.map((book, index) => [book, index]));

export const sortUsfmfilesByCanonicalOrder = (
    files: { name: string; path: string }[],
) => {
    return files.sort((a, b) => {
        const aSlug = getBookSlug(a.name);
        const bSlug = getBookSlug(b.name);
        const aIndex = bibleOrderMap.get(aSlug);
        const bIndex = bibleOrderMap.get(bSlug);
        return (aIndex || 0) - (bIndex || 0);
    });
};
export const getBookSlug = (book: string) => {
    const containsDash = book.indexOf("-");
    if (containsDash !== -1) {
        return book.slice(containsDash + 1, containsDash + 4);
    } else return book;
};

// a map of book names to fuzzy common slugs
const BOOKS: Record<string, string[]> = {
    Genesis: ["genesis", "gen", "ge"],
    Exodus: ["exodus", "exo", "ex"],
    Leviticus: ["leviticus", "lev", "lv"],
    Numbers: ["numbers", "num", "nu"],
    Deuteronomy: ["deuteronomy", "deut", "de"],
    Joshua: ["joshua", "jos", "js"],
    Judges: ["judges", "jud", "jd"],
    Ruth: ["ruth", "rt"],
    Samuel1: ["1 samuel", "1 sam", "1sa", "1sm"],
    Samuel2: ["2 samuel", "2 sam", "2sa", "2sm"],
    Kings1: ["1 kings", "1 ki", "1k"],
    Kings2: ["2 kings", "2 ki", "2k"],
    Isaiah: ["isaiah", "isa", "is"],
    Jeremiah: ["jeremiah", "jer", "je"],
    Lamentations: ["lamentations", "lam"],
    Ezekiel: ["ezekiel", "ezek", "ez"],
    Daniel: ["daniel", "dan", "da"],
    Hosea: ["hosea", "hos"],
    Joel: ["joel", "jl"],
    Amos: ["amos", "am"],
    Obadiah: ["obadiah", "oba"],
    Jonah: ["jonah", "jon"],
    Micah: ["micah", "mic", "mi"],
    Nahum: ["nahum", "nah", "na"],
    Habakkuk: ["habakkuk", "hab", "hb"],
    Zephaniah: ["zephaniah", "zeph", "zep", "zh"],
    Haggai: ["haggai", "hag"],
    Zechariah: ["zechiah", "zech", "zec", "zc"],
    Malachi: ["malachi", "mal", "ml"],

    Matthew: ["matthew", "matt", "mat", "mt"],
    Mark: ["mark", "mrk", "mk"],
    Luke: ["luke", "lk"],
    John: ["john", "jn", "jhn"],
    Acts: ["acts", "ac"],
    Romans: ["romans", "rom", "rm"],
    Corinthians1: ["1 corinthians", "1 cor", "1co"],
    Corinthians2: ["2 corinthians", "2 cor", "2co"],
    Galatians: ["galatians", "gal", "gl"],
    Ephesians: ["ephesians", "eph", "ep"],
    Philippians: ["philippians", "philippian", "phil", "ph", "php"],
    Colossians: ["colossians", "col", "cl"],
    Thessalonians1: ["1 thessalonians", "1 thess", "1th", "1 th"],
    Thessalonians2: ["2 thessalonians", "2 thess", "2th", "2 th"],
    Timothy1: ["1 timothy", "1 tim", "1ti"],
    Timothy2: ["2 timothy", "2 tim", "2ti"],
    Titus: ["titus", "tit"],
    Philemon: ["philemon", "phm"],
    Hebrews: ["hebrews", "heb", "hl"],
    James: ["james", "jas"],
    Peter1: ["1 peter", "1 pet", "1pe"],
    Peter2: ["2 peter", "2 pet", "2pe"],
    John1: ["1 john", "1 jn", "1 joh"],
    John2: ["2 john", "2 jn", "2 joh"],
    John3: ["3 john", "3 jn", "3 joh"],
    Jude: ["jude", "jud"],
    Revelation: [
        "revelation",
        "revelations",
        "rev",
        "revlation",
        "revation",
        "revlon",
    ],
    // ... add the rest
};
const bibleBooksToSlug = bibleOrder.reduce((acc, book, index) => {
    const matchingBook = Object.keys(BOOKS).find((b) =>
        BOOKS[b].some((abbr) => abbr === book.toLowerCase()),
    );
    if (matchingBook) {
        acc.set(matchingBook, book);
    }
    return acc;
}, new Map<string, string>());
export function parseReference(input: string) {
    const normalized = input.toLowerCase().replace(/\s+/g, "");
    // regex
    const match = normalized.match(/^(\d?[a-z]+)\s*(\d+)?$/i);
    if (!match) return null;

    const [, rawBook, rawChap, rawNextNum] = match;
    const book = Object.keys(BOOKS).find((b) =>
        BOOKS[b].some((abbr) => rawBook.startsWith(abbr)),
    );
    const chapter = rawChap ? Number(rawChap) : null;
    const nextNum = rawNextNum ? Number(rawNextNum.replace(/\s/g, "")) : null;
    const identifier = book ? bibleBooksToSlug.get(book) : null;
    return book ? { book, chapter, identifier, nextNum } : null;
}
