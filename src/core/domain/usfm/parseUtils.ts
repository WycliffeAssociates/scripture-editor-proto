import { makeSid, parseSid } from "@/core/data/bible/bible.ts";
import { numRangeRe } from "@/core/domain/usfm/lex.ts";

/**
 * Shared token-level parsing helpers used while projecting raw/serialized USFM into
 * the token streams and SID annotations the editor and search/history layers rely
 * on.
 */
type WhitespaceMergeToken = {
    tokenType: string;
    text: string;
    marker?: string;
    sid?: string;
};

export type TokenForSidCalculation = {
    tokenType: string;
    text: string;
    marker?: string;
    sid?: string;
    numberInfo?: { start: number; end?: number };
};

/**
 * Move inline horizontal whitespace onto neighboring text-like tokens so later
 * structural passes do not have to treat standalone whitespace tokens as content.
 */
export const mergeHorizontalWhitespaceToAdjacent = (
    tokens: WhitespaceMergeToken[],
): WhitespaceMergeToken[] => {
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t?.tokenType === " " || t?.tokenType === "ws") {
            const prev = tokens[i - 1];
            const next = tokens[i + 1];
            if (next && next.tokenType !== "nl") {
                next.text = `${t.text}${next.text}`;
            } else if (prev) {
                prev.text += t.text;
            } else {
                continue;
            }
            tokens.splice(i, 1);
            i--;
        }
    }
    return tokens;
};
function getNumRangeAfterMarker<T extends TokenForSidCalculation>(
    tokens: T[],
    markerIdx: number,
) {
    let idx = markerIdx + 1;
    while (
        idx < tokens.length &&
        (tokens[idx]?.tokenType === " " ||
            tokens[idx]?.tokenType === "ws" ||
            tokens[idx]?.tokenType === "nl")
    ) {
        idx++;
    }
    const t = tokens[idx];
    if (t?.tokenType !== "numberRange") return null;
    if (t.numberInfo) {
        const { start, end } = t.numberInfo;
        return end != null && end !== start ? `${start}-${end}` : `${start}`;
    }
    const value = t.text?.trim();
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
 * Add SIDs in-place across a token stream using chapter/verse marker context.
 *
 * This is a core bridge from raw tokenization into the anchor-addressable model the
 * rest of Zephyr uses for navigation, diffing, lint, and reference sync.
 */
export function mutAddSids<T extends TokenForSidCalculation>(
    tokens: T[],
    bookCode: string,
): void {
    const introSid = makeSid({
        bookId: bookCode,
        chapter: 0,
        verseStart: 0,
        verseEnd: 0,
    });

    if (!tokens.length) return;

    let currentSid = introSid;
    let currentChapter = 0;
    let verseDupCounters = new Map<string, number>();

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (!t) continue;

        if (t.tokenType === "marker" && t.marker === "c") {
            const chapStr = getNumRangeAfterMarker(tokens, i);
            if (chapStr && numRangeRe.test(chapStr)) {
                const chapNum = Number.parseInt(chapStr, 10);
                if (Number.isFinite(chapNum)) {
                    currentChapter = chapNum;
                    verseDupCounters = new Map<string, number>();
                    currentSid = makeSid({
                        bookId: bookCode,
                        chapter: currentChapter,
                        verseStart: 0,
                        verseEnd: 0,
                    });
                }
            }
        }

        if (t.tokenType === "marker" && t.marker === "v") {
            const verseStr = getNumRangeAfterMarker(tokens, i);
            if (verseStr && numRangeRe.test(verseStr)) {
                const baseSid = makeVerseSid(
                    bookCode,
                    currentChapter,
                    verseStr,
                );
                const seenCount = verseDupCounters.get(baseSid) ?? 0;
                if (seenCount === 0) {
                    verseDupCounters.set(baseSid, 1);
                    currentSid = baseSid;
                } else {
                    verseDupCounters.set(baseSid, seenCount + 1);
                    currentSid = `${baseSid}_dup_${seenCount}`;
                }
            }
        }

        t.sid = currentSid;
    }
}
