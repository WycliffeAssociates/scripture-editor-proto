import type { Token } from "moo";
import { makeSid, parseSid } from "@/core/data/bible/bible";
import type { LintableToken } from "@/core/data/usfm/lint";
import { createParsedToken } from "@/core/data/usfm/parse";
import {
    markerTrimNoSlash,
    numRangeRe,
    TokenMap,
    type TokenName,
    type TokenNameSubset,
} from "@/core/domain/usfm/lex";
import type { LintOrParseFxn } from "@/core/domain/usfm/lint";
import type { ParseContext } from "@/core/domain/usfm/tokenParsers";

export const mergeHorizontalWhitespaceToAdjacent = (
    tokens: LintableToken[],
): LintableToken[] => {
    const wsTypes: TokenNameSubset = new Set([TokenMap.horizontalWhitespace]);
    const avoidPushingPrevTo: TokenNameSubset = new Set([
        TokenMap.endMarker,
        TokenMap.implicitClose,
    ]);

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t?.tokenType && wsTypes.has(t.tokenType as TokenName)) {
            const prev = tokens[i - 1];
            const next = tokens[i + 1];
            if (!prev) continue;
            if (avoidPushingPrevTo.has(prev.tokenType as TokenName) && next) {
                next.text = `${t.text}${next.text}`;
            } else {
                prev.text += t.text;
            }
            tokens.splice(i, 1);
            i--;
        }
    }
    return tokens;
};

export const removeVerticalWhiteSpaceInVerses: LintOrParseFxn<LintableToken> = (
    ctx: ParseContext<LintableToken>,
) => {
    const { currentToken, nextToken, twoFromCurrent, idsToFilterOut } = ctx;
    if (currentToken?.tokenType !== TokenMap.marker) return;
    if (!nextToken || nextToken.tokenType !== TokenMap.verticalWhitespace)
        return;
    if (!twoFromCurrent || twoFromCurrent.tokenType !== TokenMap.marker) return;

    // this pattern: \v {#} text BR \v {#}
    if (
        nextToken?.tokenType === TokenMap.verticalWhitespace &&
        twoFromCurrent?.tokenType === TokenMap.marker &&
        twoFromCurrent.marker === "v"
    ) {
        // remove the vertical whitespace
        idsToFilterOut.push(nextToken.id);
    }
};

export const organizeByChapters = <T extends LintableToken>(
    parsedTokens: T[],
) => {
    const chapMatch = /\w{3}\s+(\d{1,3})/;
    const processed = parsedTokens.reduce(
        (acc, token) => {
            const chapterMatch = token?.sid?.match(chapMatch);

            const chap = chapterMatch?.[1];
            if (chap && chap !== acc.curIdx.toString()) {
                acc.curIdx = parseInt(chap, 10);
                acc.chapters[acc.curIdx] = [];
            }

            acc.chapters[acc.curIdx].push(createParsedToken<T>(token));
            return acc;
        },
        {
            curIdx: 0,
            chapters: {
                0: [],
            } as Record<number, T[]>,
        },
    );
    return processed.chapters;
};

export function prepareTokens<T extends LintableToken>(
    text: string,
    lexFn: (src: string) => Token[],
    bookCode?: string,
): { tokens: Array<T & Token>; bookCode: string } {
    const tokens = lexFn(text) as Array<T & Token>;
    const bookCodeToUse =
        bookCode ||
        tokens
            .find(
                (t) =>
                    t?.tokenType === TokenMap.bookCode ||
                    t.type === TokenMap.bookCode,
            )
            ?.text?.trim();
    if (!bookCodeToUse) {
        throw new Error("No book code found");
    }
    const { mutCurChap, mutCurVerse, mutCurSid } = getMutSidVals(bookCodeToUse);

    for (let i = 0; i < tokens.length; i++) {
        prepareLexedToken(tokens[i], i);
        assignSid({
            index: i,
            currentToken: tokens[i],
            tokens,
            bookCode: bookCodeToUse,
            mutCurChap,
            mutCurVerse,
            mutCurSid,
        });
    }
    return { tokens, bookCode: bookCodeToUse };
}
export function preparedAlreadyGivenTokens<T extends LintableToken>(
    tokens: T[],
) {
    const bookCode = tokens
        .find((t) => t.tokenType === TokenMap.bookCode)
        ?.text?.trim();
    if (!bookCode) {
        throw new Error("No book code found");
    }
    //   we need references and not values here, hence object wrapping
    const { mutCurChap, mutCurVerse, mutCurSid } = getMutSidVals(bookCode);
    for (let i = 0; i < tokens.length; i++) {
        prepareLexedToken(tokens[i], i);
        assignSid({
            index: i,
            currentToken: tokens[i],
            tokens,
            bookCode,
            mutCurChap,
            mutCurVerse,
            mutCurSid,
        });
    }

    return { tokens, bookCode };
}

function prepareLexedToken<T extends Token | LintableToken>(
    token: T,
    i: number,
): asserts token is T & LintableToken {
    const markersToUnify = new Set([
        "idMarker",
        "chapterMarker",
        "verseMarker",
        "chapterAltOpen",
        "verseAltOpen",
        "chapterPublished",
        "versePublished",
    ]);

    // figure out the type string from either field
    let typeToUse: string = "";
    // order matters here. if already has tokenType computed, ie from lexical side on lint, use that.
    if ("tokenType" in token) {
        typeToUse = token.tokenType ?? "";
    } else if ("type" in token) {
        typeToUse = token.type ?? "";
    }

    const normalizedType = markersToUnify.has(typeToUse)
        ? TokenMap.marker
        : typeToUse;

    // use id already on token if present, else the loop index
    (token as LintableToken).id ??= String(i);
    (token as LintableToken).tokenType = normalizedType;

    // assign marker if applicable
    if (normalizedType === TokenMap.marker) {
        (token as LintableToken).marker = markerTrimNoSlash(token.text);
    }
    if (normalizedType === TokenMap.endMarker) {
        (token as LintableToken).marker = markerTrimNoSlash(
            token.text.replace("*", ""),
        );
    }
}

export const LOOKAHEAD_MARKERS = new Set([
    "v",
    "p",
    "m",
    "mi",
    "pi",
    "q",
    "q1",
    "q2",
    "q3",
    "q4",
    "s",
    "s1",
    "s2",
    "s3",
    "s4",
    "s5",
    "b",
    "nb",
]);
type AssignSidArgs<T extends LintableToken> = {
    index: number;
    currentToken: T;
    tokens: T[];
    bookCode: string;
    mutCurChap: { val: string };
    mutCurVerse: { val: string | null };
    mutCurSid: { val: string };
};
function assignSid<T extends LintableToken>(args: AssignSidArgs<T>) {
    // was already assigned in a previous look ahead pass
    if (args.currentToken.sid) return;
    // if not a marker, and not already assigned, assign current sid
    if (args.currentToken.tokenType !== TokenMap.marker && args.mutCurSid) {
        args.currentToken.sid = args.mutCurSid.val;
        return;
    }
    if (args.currentToken.marker === "c") {
        const { expectedNumRangeToken: expectedNumToken } =
            skipSpaceLookForNextNumRange(args.tokens, args.index + 1);
        if (!expectedNumToken) return;
        if (expectedNumToken.tokenType === TokenMap.numberRange) {
            args.mutCurChap.val = expectedNumToken.text;
            const isValidNumRange = numRangeRe.test(
                expectedNumToken.text.trim(),
            );
            if (!isValidNumRange) {
                return;
            }
            args.mutCurChap.val = expectedNumToken.text;
            // chapters reset verses
            args.mutCurVerse.val = "0";
            const parsedNumRange = parseSid(
                `${args.bookCode} ${args.mutCurChap.val}:${args.mutCurVerse.val}`,
            );
            if (!parsedNumRange) return;
            args.mutCurSid.val = parsedNumRange.toSidString();
            args.currentToken.sid = args.mutCurSid.val;
            return;
        }
    }
    if (args.currentToken.marker === "v") {
        const { expectedNumRangeToken: expectedNumToken } =
            skipSpaceLookForNextNumRange(args.tokens, args.index + 1);
        if (!expectedNumToken) return;
        if (expectedNumToken.tokenType === TokenMap.numberRange) {
            args.mutCurVerse.val = expectedNumToken.text;
            const isValidNumRange = numRangeRe.test(
                expectedNumToken.text.trim(),
            );
            if (!isValidNumRange) {
                return;
            }
            const parsedNumRange = parseSid(
                `${args.bookCode} ${args.mutCurChap.val}:${expectedNumToken.text}`,
            );
            const newSid = parsedNumRange?.toSidString();
            if (!newSid) return;
            args.mutCurSid.val = newSid;
            args.currentToken.sid = newSid;
            return;
        }
    }
    // most markers and tokens read sid backwards, so if not a look ahead marker, assign current sid
    if (!LOOKAHEAD_MARKERS.has(args.currentToken.marker ?? "")) {
        args.currentToken.sid = args.mutCurSid.val;
        return;
    }
    // if we get here, we have a look ahead marker, so we need to walk forward until we hit a boundary condition
    assignSidsUntilBoundaryCondition(args);
}

function assignSidsUntilBoundaryCondition<T extends LintableToken>(
    args: AssignSidArgs<T>,
) {
    if (
        args.currentToken.tokenType !== TokenMap.marker ||
        !args.currentToken.marker
    )
        return;
    // const currentMarker = currentToken.marker;
    // from our current index + 1, walk until we hit a boundary.
    const collectedTokens: T[] = [args.currentToken];
    for (let i = args.index + 1; i < args.tokens.length; i++) {
        const nextToken = args.tokens[i];
        // looking ahead, normalize future tokens
        prepareLexedToken(nextToken, i);
        const nextTokenMarker = nextToken.marker;
        // chapters are hard breaks, we never read past them;
        if (nextTokenMarker === "c") {
            break;
        }
        // don't read past plain text
        if (
            nextToken.tokenType === TokenMap.text &&
            !nextToken.text.trim().length
        ) {
            break;
        }
        // don't read pass markers that don't read forward such as a \cl, which semantically makes sense to read back towards what's likely a nearest c
        if (
            nextToken.tokenType === TokenMap.marker &&
            !LOOKAHEAD_MARKERS.has(nextTokenMarker ?? "")
        ) {
            break;
        }
        // if we read past a v marker, break after checking the next token to ensure it's a number range
        if (nextTokenMarker === "v") {
            const { expectedNumRangeToken, tokensSeen } =
                skipSpaceLookForNextNumRange(args.tokens, i + 1);
            tokensSeen.forEach((t) => {
                collectedTokens.push(t);
            });
            if (!expectedNumRangeToken) return;
            const candidateNextVerseNum = expectedNumRangeToken.text.trim();
            if (
                !candidateNextVerseNum ||
                !numRangeRe.test(candidateNextVerseNum)
            ) {
                break;
            }
            //   if we get here, it's a v marker + valid num range, so we know their sid can be added to the forwarded walk
            collectedTokens.push(nextToken);
            collectedTokens.push(expectedNumRangeToken);
            //   update ctx mut vars for sid
            args.mutCurVerse.val = expectedNumRangeToken.text;
            const possibleNewSid = parseSid(
                `${args.bookCode} ${args.mutCurChap.val}:${args.mutCurVerse.val}`,
            );
            if (!possibleNewSid) {
                break;
            }
            args.mutCurSid.val = possibleNewSid.toSidString();
            // no further processing after handling v
            break;
        }
    }
    if (collectedTokens.length === 0) return;
    //   we've already peeked ahead to see if we should assign a new sid, so we can just assign the sid to all collected tokens
    collectedTokens.forEach((t) => {
        t.sid = args.mutCurSid.val;
    });
}
export type MutSidVals = ReturnType<typeof getMutSidVals>;
export function getMutSidVals(bookCode: string) {
    return {
        mutCurChap: { val: "0" },
        mutCurVerse: { val: null } as { val: string | null },
        mutCurSid: {
            val: makeSid({
                bookId: bookCode,
                chapter: 0,
            }),
        },
    };
}
function skipSpaceLookForNextNumRange<T extends LintableToken>(
    tokens: T[],
    idx: number,
) {
    let expectedNumRangeToken = tokens[idx];
    // any time we go in the future, we need to do our normalization step btw token types
    prepareLexedToken(expectedNumRangeToken, idx);
    const tokensSeen: T[] = [];
    tokensSeen.push(expectedNumRangeToken);
    let tmpIdx = idx;
    while (
        expectedNumRangeToken.tokenType === TokenMap.horizontalWhitespace ||
        expectedNumRangeToken.tokenType === TokenMap.verticalWhitespace
    ) {
        tmpIdx++;
        expectedNumRangeToken = tokens[tmpIdx];
        tokensSeen.push(expectedNumRangeToken);
        prepareLexedToken(expectedNumRangeToken, tmpIdx);
    }
    if (expectedNumRangeToken.tokenType === TokenMap.numberRange) {
        return { expectedNumRangeToken, tokensSeen };
    }
    return { tokensSeen };
}
