export const LintErrorKeys = {
    chapExpectedIncreaseByOne: "chapExpectedIncreaseByOne",
    charNotClosed: "charNotClosed",
    duplicateChapterNumber: "duplicateChapterNumber",
    duplicateVerseNumber: "duplicateVerseNumber",
    inconsistentChapterLabel: "inconsistentChapterLabel",
    isUnknownMarker: "isUnknownMarker",
    noteNotClosed: "noteNotClosed",
    numberRangeAfterChapterMarker: "numberRangeAfterChapterMarker",
    verseContentNotEmpty: "verseContentNotEmpty",
    verseExpectedIncreaseByOne: "verseExpectedIncreaseByOne",
    verseRangeExpectedAfterVerseMarker: "verseRangeExpectedAfterVerseMarker",
    verseTextFollowsVerseRange: "verseTextFollowsVerseRange",
} as const;

export type LintErrorKey = keyof typeof LintErrorKeys;
