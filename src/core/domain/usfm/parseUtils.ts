import type { Token } from "moo";
import { makeSid, parseSid } from "@/core/data/bible/bible.ts";
import type { LintableToken } from "@/core/data/usfm/lint.ts";
import { createParsedToken } from "@/core/data/usfm/parse.ts";
import {
    markerTrimNoSlash,
    numRangeRe,
    TokenMap,
    type TokenName,
    type TokenNameSubset,
} from "@/core/domain/usfm/lex.ts";

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
        "escapedMarker",
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
    // 1. Check if state needs updating based on current token
    if (args.currentToken.tokenType === TokenMap.marker) {
        const marker = args.currentToken.marker;
        if (marker === "c") {
            const { expectedNumRangeToken: expectedNumToken } =
                skipSpaceLookForNextNumRange(args.tokens, args.index + 1);
            if (expectedNumToken?.tokenType === TokenMap.numberRange) {
                const isValidNumRange = numRangeRe.test(
                    expectedNumToken.text.trim(),
                );
                if (isValidNumRange) {
                    args.mutCurChap.val = expectedNumToken.text;
                    // chapters reset verses
                    args.mutCurVerse.val = "0";
                    const parsedNumRange = parseSid(
                        `${args.bookCode} ${args.mutCurChap.val}:${args.mutCurVerse.val}`,
                    );
                    if (parsedNumRange) {
                        args.mutCurSid.val = parsedNumRange.toSidString();
                    }
                }
            }
        } else if (marker === "v") {
            const { expectedNumRangeToken: expectedNumToken } =
                skipSpaceLookForNextNumRange(args.tokens, args.index + 1);
            if (expectedNumToken?.tokenType === TokenMap.numberRange) {
                const isValidNumRange = numRangeRe.test(
                    expectedNumToken.text.trim(),
                );
                if (isValidNumRange) {
                    args.mutCurVerse.val = expectedNumToken.text;
                    const parsedNumRange = parseSid(
                        `${args.bookCode} ${args.mutCurChap.val}:${expectedNumToken.text}`,
                    );
                    if (parsedNumRange) {
                        args.mutCurSid.val = parsedNumRange.toSidString();
                    }
                }
            }
        }
    }

    // 2. Apply current state to token
    args.currentToken.sid = args.mutCurSid.val;
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
    if (idx >= tokens.length) return {};
    let expectedNumRangeToken = tokens[idx];
    // any time we go in the future, we need to do our normalization step btw token types
    prepareLexedToken(expectedNumRangeToken, idx);
    const tokensSeen: T[] = [];
    tokensSeen.push(expectedNumRangeToken);
    let tmpIdx = idx;
    while (
        (expectedNumRangeToken.tokenType === TokenMap.horizontalWhitespace ||
            expectedNumRangeToken.tokenType === TokenMap.verticalWhitespace) &&
        tmpIdx < tokens.length - 1
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
