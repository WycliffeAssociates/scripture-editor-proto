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
  files: {name: string; path: string}[]
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
