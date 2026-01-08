export const LintErrorKeys = {
    chapExpectedIncreaseByOne: "chapExpectedIncreaseByOne",
    charNotClosed: "charNotClosed",
    duplicateChapterNumber: "duplicateChapterNumber",
    duplicateVerseNumber: "duplicateVerseNumber",
    inconsistentChapterLabel: "inconsistentChapterLabel",
    isUnknownMarker: "isUnknownMarker",
    isUnknownCloseMarker: "isUnknownCloseMarker",
    noteNotClosed: "noteNotClosed",
    numberRangeAfterChapterMarker: "numberRangeAfterChapterMarker",
    verseContentNotEmpty: "verseContentNotEmpty",
    verseExpectedIncreaseByOne: "verseExpectedIncreaseByOne",
    verseRangeExpectedAfterVerseMarker: "verseRangeExpectedAfterVerseMarker",
    verseTextFollowsVerseRange: "verseTextFollowsVerseRange",

    invalidNumberRange: "invalidNumberRange",
    numberRangeNotPreceededByMarkerExpectingNumberRange:
        "numberRangeNotPreceededByMarkerExpectingNumberRange",
    unknownToken: "unknownToken",
} as const;

export type LintErrorKey = keyof typeof LintErrorKeys;

export type LintError = {
    message: string;
    sid: string;
    msgKey: LintErrorKey;
    nodeId: string;
};

export type LintableToken = {
    text: string;
    tokenType: string;
    sid?: string;
    marker?: string;
    lintErrors?: Array<LintError>;
    isParaMarker?: boolean;
    inPara?: string;
    inChars?: Array<string>;
    id: string;
    content?: Array<LintableToken>;
    attributes?: Record<string, string>;
};

export function dedupeErrorMessagesList(errors: LintError[]): LintError[] {
    return Array.from(
        new Map(
            errors.map((m) => [`${m.sid}:${m.msgKey}:${m.nodeId}`, m]),
        ).values(),
    );
}
