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

export type TokenForSidCalculation = {
    tokenType: string;
    text: string;
    marker?: string;
};

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

    for (let i = 0; i < tokens.length; i++) {
        prepareLexedToken(tokens[i], i);
    }

    const sids = computeSidsReverse(tokens, bookCodeToUse);

    for (let i = 0; i < tokens.length; i++) {
        tokens[i].sid = sids[i];
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
    for (let i = 0; i < tokens.length; i++) {
        prepareLexedToken(tokens[i], i);
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

function getNumRangeAfterMarker<T extends TokenForSidCalculation>(
    tokens: T[],
    markerIdx: number,
) {
    let idx = markerIdx + 1;
    while (
        idx < tokens.length &&
        (tokens[idx]?.tokenType === TokenMap.horizontalWhitespace ||
            tokens[idx]?.tokenType === TokenMap.verticalWhitespace)
    ) {
        idx++;
    }
    const t = tokens[idx];
    if (t?.tokenType !== TokenMap.numberRange) return null;
    const value = t.text.trim();
    if (!value) return null;
    return value;
}

function makeVerseSid(bookCode: string, chapter: number, verse: string) {
    const parsed = parseSid(`${bookCode} ${chapter}:${verse}`);
    if (parsed) return parsed.toSidString();
    // Fallback: chapter-level marker if the verse value is malformed.
    return makeSid({ bookId: bookCode, chapter, verseStart: 0, verseEnd: 0 });
}

/**
 * Computes SIDs in reverse.
 *
 * Key behavior:
 * - Markers between verses are attributed to the *following* verse (better for diff blocks).
 * - Tokens before `\\v 1` in a chapter are attributed to chapter `:0`.
 * - Tokens before the first chapter marker are attributed to `0:0` (intro material).
 */
export function computeSidsReverse<T extends TokenForSidCalculation>(
    tokens: T[],
    bookCode: string,
): string[] {
    const introSid = makeSid({
        bookId: bookCode,
        chapter: 0,
        verseStart: 0,
        verseEnd: 0,
    });

    if (!tokens.length) return [];

    const result = Array.from({ length: tokens.length }, () => introSid);

    // Identify chapter segments (we treat the `\\c` marker itself as part of the new chapter).
    const chapterStarts: Array<{ idx: number; chap: number }> = [];
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t?.tokenType !== TokenMap.marker) continue;
        if (t.marker !== "c") continue;

        const chapStr = getNumRangeAfterMarker(tokens, i);
        if (!chapStr) continue;
        if (!numRangeRe.test(chapStr)) continue;

        const chapNum = Number.parseInt(chapStr, 10);
        if (!Number.isFinite(chapNum)) continue;
        chapterStarts.push({ idx: i, chap: chapNum });
    }

    if (!chapterStarts.length) {
        // If there's no chapter marker at all, treat the entire file as intro material.
        return result;
    }

    // Intro material before the first `\\c`.
    for (let i = 0; i < chapterStarts[0].idx; i++) {
        result[i] = introSid;
    }

    // Per-chapter reverse attribution.
    for (let s = 0; s < chapterStarts.length; s++) {
        const start = chapterStarts[s].idx;
        const end =
            s + 1 < chapterStarts.length
                ? chapterStarts[s + 1].idx - 1
                : tokens.length - 1;
        const chapter = chapterStarts[s].chap;

        const chapter0Sid = makeSid({
            bookId: bookCode,
            chapter,
            verseStart: 0,
            verseEnd: 0,
        });

        // Forward: map each index to the current verse number.
        let curVerse = "0";
        const verseForIndex = new Array<string>(end - start + 1);
        for (let i = start; i <= end; i++) {
            const t = tokens[i];
            if (t?.tokenType === TokenMap.marker && t.marker === "v") {
                const verseStr = getNumRangeAfterMarker(tokens, i);
                if (verseStr && numRangeRe.test(verseStr)) {
                    curVerse = verseStr.trim();
                }
            }
            verseForIndex[i - start] = curVerse;
        }

        // Reverse: attribute every token to the verse derived from the next text node.
        let currentSid: string | null = null;
        const pending: number[] = [];

        for (let i = end; i >= start; i--) {
            const t = tokens[i];

            if (t?.tokenType === TokenMap.text) {
                const verse = verseForIndex[i - start];
                currentSid =
                    verse && verse !== "0"
                        ? makeVerseSid(bookCode, chapter, verse)
                        : chapter0Sid;

                // Anything after the last text token belongs to that SID.
                for (const pendingIdx of pending) {
                    result[pendingIdx] = currentSid;
                }
                pending.length = 0;
            }

            if (currentSid) {
                result[i] = currentSid;
            } else {
                pending.push(i);
            }

            // Once we pass `\\v 1`, everything earlier in the chapter becomes chapter `:0`.
            if (t?.tokenType === TokenMap.marker && t.marker === "v") {
                const verse = verseForIndex[i - start];
                const verseStart = Number.parseInt(verse, 10);
                if (Number.isFinite(verseStart) && verseStart === 1) {
                    currentSid = chapter0Sid;
                }
            }
        }

        // No text tokens in this chapter segment: default to chapter `:0`.
        if (!currentSid) {
            for (let i = start; i <= end; i++) {
                result[i] = chapter0Sid;
            }
            continue;
        }

        // Remaining pending (edge case): use whatever SID we're currently in.
        for (const pendingIdx of pending) {
            result[pendingIdx] = currentSid;
        }
    }

    return result;
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
                verseStart: 0,
                verseEnd: 0,
            }),
        },
    };
}
