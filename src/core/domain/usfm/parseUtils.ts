import { makeSid, parseSid } from "@/core/data/bible/bible.ts";
import type { LegacyLintableToken as LintableToken } from "@/core/domain/usfm/legacyTokenTypes.ts";
import {
    numRangeRe,
    TokenMap,
    type TokenName,
    type TokenNameSubset,
} from "@/core/domain/usfm/lex.ts";

export type TokenForSidCalculation = {
    tokenType: string;
    text: string;
    marker?: string;
    sid?: string;
};

export const mergeHorizontalWhitespaceToAdjacent = (
    tokens: LintableToken[],
): LintableToken[] => {
    const wsTypes: TokenNameSubset = new Set([TokenMap.horizontalWhitespace]);

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t?.tokenType && wsTypes.has(t.tokenType as TokenName)) {
            const prev = tokens[i - 1];
            const next = tokens[i + 1];
            // Canonical whitespace placement:
            // Prefer leading whitespace on the *next* token so whitespace remains visible
            // even when the previous token (e.g. a marker) is hidden in some editor modes.
            // Fallback to trailing whitespace on the previous token only when we can't
            // push forward (e.g., end-of-stream or linebreak boundary).
            if (next && next.tokenType !== TokenMap.verticalWhitespace) {
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
 * Mutates tokens in-place, adding a `sid` for each token.
 *
 * Heuristic (simple, forward):
 * - Before the first `\\c`, everything is attributed to `0:0` (intro material).
 * - On `\\c <n>`, switch to chapter `n:0` (everything until first `\\v`).
 * - On `\\v <n|n-n>`, switch to verse `n` (everything until next `\\v` or `\\c`).
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

        if (t.tokenType === TokenMap.marker && t.marker === "c") {
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

        if (t.tokenType === TokenMap.marker && t.marker === "v") {
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
