import { parseSid } from "@/core/data/bible/bible.ts";
import {
    type LintableToken,
    type LintError,
    LintErrorKeys,
} from "@/core/data/usfm/lint.ts";
import {
    ALL_TOKENS_REGEX_STRING,
    ALL_USFM_MARKERS,
    All_EXPLICT_CHAR_CLOSE_MARKERS,
    VALID_NOTE_MARKERS,
} from "@/core/data/usfm/tokens.ts";
import {
    numRangeAtTokenStartWithWsRe,
    TokenMap,
} from "@/core/domain/usfm/lex.ts";
import type { ParseContext } from "@/core/domain/usfm/tokenParsers.ts";

export function lint<T extends LintableToken>(ctx: ParseContext<T>) {
    // this is a parse fxn that tracks the state of open/close char and note markers
    lintChapterLabels(ctx);
    lintVerseContentNotEmpty(ctx);
    lintTextFollowsVerseRange(ctx);
    lintNumRangePreceededByTokenExpectingNum(ctx);
    lintVerseRanges(ctx);
    lintCheckForDuplicateChapNum(ctx);
    lintIsUnknownMarker(ctx);
    lintIsUnkownCloseToken(ctx);
    lintAddErrorsToUnknownTokenFromLexer(ctx);
}

export type LintOrParseFxn<T extends LintableToken> = (
    ctx: ParseContext<T>,
) => void;

const lintChapterLabels: LintOrParseFxn<LintableToken> = (
    ctx: ParseContext<LintableToken>,
) => {
    const token = ctx.currentToken;
    if (!token?.text || !ctx.nextToken) return;

    const isMarker = token.tokenType === TokenMap.marker;
    const isClMarker = token.marker === "cl";
    if (!isMarker || !isClMarker) return;
    let nextText = ctx.nextToken?.text?.trim();
    if (!nextText) return;

    // Strip numbers (e.g. "Chapter 3" → "Chapter")
    const hasNum = nextText.match(/[0-9]/);
    if (hasNum && typeof hasNum.index === "number") {
        // everything before the first number
        nextText = nextText.substring(0, hasNum.index).trim();
    }

    const labels = ctx.foundChapterLabels;
    if (!labels.map.has(nextText)) {
        labels.map.set(nextText, []);
        labels.order.push(nextText);
    }
    //   we want to add the text, not the cl marker
    labels.map.get(nextText)?.push(ctx.nextToken);
};

const lintCheckForDuplicateChapNum: LintOrParseFxn<LintableToken> = (
    ctx: ParseContext<LintableToken>,
) => {
    const token = ctx.currentToken;
    if (!token?.marker) return;
    const marker = token.marker;
    if (!marker) return;
    if (marker !== "c") return;
    const nextMarkerType = ctx.nextToken?.tokenType;
    if (nextMarkerType !== TokenMap.numberRange) {
        const err = {
            message: `Number range expected after \\c`,
            sid: ctx.currentToken?.sid ?? "unknown location",
            msgKey: LintErrorKeys.numberRangeAfterChapterMarker,
            nodeId: token.id,
        };
        ctx.errorMessages.push(err);
        return;
    }
    const nextVal = ctx.nextToken?.text.trim() ?? "";
    const prevChapSeen = ctx.lintChapters.seen.has(nextVal);
    const prevChapSaw = ctx.lintChapters.list.at(-1);
    if (prevChapSeen && prevChapSaw) {
        const err = {
            message: `Duplicate chapter number ${nextVal}`,
            sid: token.sid ?? "unknown location",
            msgKey: LintErrorKeys.duplicateChapterNumber,
            nodeId: token.id,
        };
        ctx.errorMessages.push(err);
    }
    const expected = prevChapSaw ? parseInt(prevChapSaw, 10) + 1 : 1;
    if (nextVal !== expected.toString()) {
        const err = {
            message: `Expected chapter number ${expected}, found ${nextVal}`,
            sid: token.sid ?? "unknown location",
            msgKey: LintErrorKeys.chapExpectedIncreaseByOne,
            nodeId: token.id,
        };
        ctx.errorMessages.push(err);
    }
    ctx.lintChapters.seen.add(nextVal);
    ctx.lintChapters.list.push(nextVal);
};

const lintVerseRanges: LintOrParseFxn<LintableToken> = (
    ctx: ParseContext<LintableToken>,
) => {
    const token = ctx.currentToken;
    if (!token?.text) return;
    if (token.tokenType !== TokenMap.numberRange) return;
    if (!ctx.prevToken?.marker || ctx.prevToken.marker !== "v") return;

    const curChapter = parseSid(token.sid ?? "")?.chapter;
    if (!curChapter) return;
    const stringChap = String(curChapter);

    const value = token.text.trim();
    // verify if valid number range
    const isValid = numRangeAtTokenStartWithWsRe.test(value);
    if (!isValid) {
        const err = {
            message: `Invalid verse range ${value}`,
            sid: token.sid ?? "unknown location",
            msgKey: LintErrorKeys.invalidNumberRange,
            nodeId: token.id,
        };
        ctx.errorMessages.push(err);
        return;
    }

    const [startStr, endStr] = value.split("-");
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : start;

    // --- Ensure per-chapter map
    if (!ctx.lintVerseNums.byChapter.has(stringChap)) {
        ctx.lintVerseNums.byChapter.set(stringChap, {
            seen: new Map<string, LintableToken[]>(),
            last: 0,
        });
    }

    const chapterState = ctx.lintVerseNums.byChapter.get(stringChap);
    if (!chapterState) return;
    const prevLast = chapterState.last ?? 0;

    // --- Build key(s)
    const verseKeys: string[] = [];
    for (let v = start; v <= end; v++) verseKeys.push(`${curChapter}:${v}`);

    // --- Detect duplicates
    const seenTokensForAny = verseKeys.flatMap(
        (k) => chapterState.seen.get(k) ?? [],
    );
    const isDuplicate = seenTokensForAny.length > 0;

    if (isDuplicate) {
        const err = {
            message: `Duplicate verse number ${value}`,
            sid: token.sid ?? "unknown location",
            msgKey: LintErrorKeys.duplicateVerseNumber,
            nodeId: token.id,
        };

        ctx.errorMessages.push(err);

        for (const seenTok of seenTokensForAny) {
            const already = seenTok.lintErrors?.some(
                (e) => e.msgKey === err.msgKey && e.sid === err.sid,
            );
            if (!already) {
                seenTok.lintErrors ??= [];
                seenTok.lintErrors.push(err);
                ctx.errorMessages.push(err);
            }
        }

        // No continuity check for duplicates
        return;
    }

    // --- Continuity check (only for new unique verses)
    const expectedStart = prevLast + 1;
    if (start !== expectedStart) {
        const err = {
            message: `Expected verse ${expectedStart}, found ${start}`,
            sid: token.sid ?? "unknown location",
            msgKey: LintErrorKeys.verseExpectedIncreaseByOne,
            nodeId: token.id,
        };
        ctx.errorMessages.push(err);
    }

    // --- Record state
    for (const key of verseKeys) {
        const list = chapterState.seen.get(key) ?? [];
        list.push(token);
        chapterState.seen.set(key, list);
    }

    chapterState.last = end;
};

const lintVerseContentNotEmpty: LintOrParseFxn<LintableToken> = (
    ctx: ParseContext<LintableToken>,
) => {
    // when in text and prev was verse
    if (ctx.currentToken?.tokenType !== TokenMap.text) return;
    if (!ctx.prevToken) return;
    if (!ctx.prevToken.marker || ctx.prevToken.marker !== "v") return;
    if (!ctx.currentToken.text?.trim()) {
        const err = {
            message: `Verse content expected after \\v and range ${ctx.prevToken.text}`,
            sid: ctx.currentToken?.sid ?? "unknown location",
            msgKey: LintErrorKeys.verseContentNotEmpty,
            nodeId: ctx.currentToken?.id,
        };
        ctx.errorMessages.push(err);
    }
};

const lintTextFollowsVerseRange: LintOrParseFxn<LintableToken> = (
    ctx: ParseContext<LintableToken>,
) => {
    if (!ctx.currentToken) return;
    // in a verse range
    if (ctx.currentToken.tokenType !== TokenMap.numberRange) return;
    const sidParsed = parseSid(ctx.currentToken.sid ?? "");
    if (!sidParsed || sidParsed.isBookChapOnly) return;
    if (sidParsed.chapter === 0 || sidParsed.verseStart === 0) {
        // don't lint special sid token values for content prior to actual verse Sids
        return;
    }

    const nextToken = ctx.nextToken;
    if (!nextToken) return;
    if (
        nextToken.tokenType === TokenMap.marker &&
        VALID_NOTE_MARKERS.has(nextToken.marker ?? "")
    ) {
        // if there token following isn't text, but is a note, good chance this is intentionally empty and noted
        return;
    }
    const nextIsText =
        nextToken.tokenType === TokenMap.text && nextToken.text?.trim().length;
    //   in a number cases such as en ulb, there are sections such as \v 21 + footnote indicating that some ancient mss don't have this verse
    const nextIsNote =
        ctx.twoFromCurrent?.tokenType === TokenMap.marker &&
        VALID_NOTE_MARKERS.has(ctx.twoFromCurrent?.marker ?? "");
    const thirdIsNote =
        ctx.twoFromCurrent?.tokenType === TokenMap.marker &&
        VALID_NOTE_MARKERS.has(ctx.twoFromCurrent?.marker ?? "");
    if (!nextIsText && !nextIsNote && !thirdIsNote) {
        const err = {
            message: `Expected verse content after \\v`,
            sid: ctx.currentToken?.sid ?? "unknown location",
            msgKey: LintErrorKeys.verseTextFollowsVerseRange,
            nodeId: ctx.currentToken?.id,
        };
        ctx.errorMessages.push(err);
    }
};

const lintIsUnknownMarker: LintOrParseFxn<LintableToken> = (
    ctx: ParseContext<LintableToken>,
) => {
    if (!ctx.currentToken) return;
    if (ctx.currentToken.tokenType !== TokenMap.marker) {
        return;
    }

    if (ALL_USFM_MARKERS.has(ctx.currentToken.marker ?? "")) return;
    const err = {
        message: `Unknown marker ${ctx.currentToken.text}`,
        sid: ctx.currentToken?.sid ?? "unknown location",
        msgKey: LintErrorKeys.isUnknownMarker,
        nodeId: ctx.currentToken.id,
    };
    ctx.errorMessages.push(err);
};

const lintIsUnkownCloseToken: LintOrParseFxn<LintableToken> = (
    ctx: ParseContext<LintableToken>,
) => {
    if (!ctx.currentToken) return;
    if (ctx.currentToken.tokenType !== TokenMap.endMarker) {
        return;
    }

    if (All_EXPLICT_CHAR_CLOSE_MARKERS.has(ctx.currentToken.text.trim()))
        return;
    const err = {
        message: `Unknown closing marker ${ctx.currentToken.text}`,
        sid: ctx.currentToken?.sid ?? "unknown location",
        msgKey: LintErrorKeys.isUnknownCloseMarker,
        nodeId: ctx.currentToken.id,
    };
    ctx.errorMessages.push(err);
};

const lintNumRangePreceededByTokenExpectingNum: LintOrParseFxn<
    LintableToken
> = (ctx: ParseContext<LintableToken>) => {
    if (!ctx.currentToken) return;
    if (ctx.currentToken.tokenType !== TokenMap.numberRange) return;
    const prevToken = ctx.prevToken;
    if (!prevToken) return;
    const markedExpectingNumberRange = ["v", "vp", "va", "c", "ca", "cp"];
    if (prevToken.tokenType === TokenMap.marker) return;
    const marker = prevToken.marker ?? "";
    if (markedExpectingNumberRange.includes(marker)) return;
    const err = {
        message: `Number range not preceeded by marker that takes a number such as v`,
        sid: ctx.currentToken?.sid ?? "unknown location",
        msgKey: LintErrorKeys.numberRangeNotPreceededByMarkerExpectingNumberRange,
        nodeId: ctx.currentToken.id,
    };
    ctx.errorMessages.push(err);
};

// const nearbyTokenText: LintOrParseFxn<LintableToken> = (
//   ctx: ParseContext<LintableToken>
// ) => {
//   return `${ctx.prevToken?.text} ${ctx.currentToken?.text} ${ctx.nextToken?.text} ${ctx.twoFromCurrent?.text}`;
// };

export function finalizeChapterLabelLint<T extends LintableToken>(
    ctx: ParseContext<T>,
) {
    const labels = ctx.foundChapterLabels;
    if (labels.map.size <= 1) return;

    // Count how many times each label occurs
    const counts = new Map<string, number>();
    for (const [label, tokens] of labels.map.entries()) {
        counts.set(label, tokens.length);
    }

    // Pick canonical (most frequent, then first discovered)
    let canonical = labels.order[0];
    let maxCount = counts.get(canonical) ?? 0;
    for (const label of labels.order) {
        const count = counts.get(label) ?? 0;
        if (count > maxCount) {
            canonical = label;
            maxCount = count;
        }
    }

    // Build a summary message
    const countStr = Array.from(counts.entries())
        .filter(([lbl]) => lbl !== canonical)
        .map(([lbl, cnt]) => `'${lbl}' (${cnt})`)
        .join(", ");
    const msg = `Inconsistent chapter labels found. Most common: '${canonical}' (${maxCount}). Others: ${countStr}`;

    // Attach errors to all non-canonical tokens
    for (const [label, tokens] of labels.map.entries()) {
        if (label === canonical) continue;
        for (const token of tokens) {
            const err = {
                message: msg,
                sid: token.sid ?? "unknown location",
                msgKey: LintErrorKeys.inconsistentChapterLabel,
                nodeId: token.id,
            };
            ctx.errorMessages.push(err);
        }
    }
}

const lintAddErrorsToUnknownTokenFromLexer: LintOrParseFxn<LintableToken> = (
    ctx: ParseContext<LintableToken>,
) => {
    if (!ctx.currentToken) return;
    if (ctx.currentToken.tokenType !== TokenMap.error) {
        return;
    }

    const err: LintError = {
        message: `Unknown token ${ctx.currentToken.text}`,
        sid: ctx.currentToken?.sid ?? "unknown location",
        msgKey: LintErrorKeys.unknownToken,
        nodeId: ctx.currentToken.id,
    };

    // Attempt to detect if this is a marker that was missed due to spacing
    // e.g. \m(for -> \m (for
    const validMarkerAndNoSpace = `${ALL_TOKENS_REGEX_STRING}(\\S+.+)`;
    const match = new RegExp(validMarkerAndNoSpace).exec(ctx.currentToken.text);

    if (match) {
        const potentialMarker = match[1];
        const textAfter = match[2];
        const maxLenTextAfter =
            textAfter.length > 10 ? textAfter.slice(0, 10) + "..." : textAfter;
        if (ALL_USFM_MARKERS.has(potentialMarker)) {
            err.fix = {
                label: `Insert space: \\${potentialMarker} ${maxLenTextAfter}`,
                type: "convertToMarkerAndText",
                data: {
                    nodeId: ctx.currentToken.id,
                    marker: potentialMarker,
                    textAfter: textAfter,
                },
            };
        }
    }

    ctx.errorMessages.push(err);
};
