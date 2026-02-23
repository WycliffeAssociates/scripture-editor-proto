import { parseSid } from "@/core/data/bible/bible.ts";

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

export function hasValidSid(sid: string): boolean {
    const parsed = parseSid(sid);
    return parsed !== null;
}

export type LintErrorFix =
    | {
          label: string;
          type: "insertEndMarker";
          data: {
              nodeId: string;
              marker: string;
          };
      }
    | {
          label: string;
          type: "convertToMarkerAndText";
          data: {
              nodeId: string;
              marker: string;
              textAfter: string;
          };
      }
    | {
          label: string;
          type: "setNumberRange";
          data: {
              nodeId: string;
              value: string;
          };
      };

export type LintError = {
    message: string;
    sid: string;
    msgKey: LintErrorKey;
    nodeId: string;
    fix?: LintErrorFix;
};

export type LintableToken = {
    text: string;
    tokenType: string;
    sid?: string;
    marker?: string;
    lintErrors?: Array<LintError>;
    isParaMarker?: boolean;
    /** True only for adapter-generated paragraph marker tokens (Regular mode containers). */
    isSyntheticParaMarker?: boolean;
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

function lintErrorIdentity(err: LintError): string {
    const fixIdentity = err.fix ? JSON.stringify(err.fix) : "";
    return `${err.sid}:${err.msgKey}:${err.nodeId}:${err.message}:${fixIdentity}`;
}

export function areLintErrorListsEqual(
    left: LintError[],
    right: LintError[],
): boolean {
    if (left.length !== right.length) return false;
    if (left.length === 0) return true;

    const leftKeys = left.map(lintErrorIdentity).sort();
    const rightKeys = right.map(lintErrorIdentity).sort();

    for (let i = 0; i < leftKeys.length; i++) {
        if (leftKeys[i] !== rightKeys[i]) return false;
    }
    return true;
}
