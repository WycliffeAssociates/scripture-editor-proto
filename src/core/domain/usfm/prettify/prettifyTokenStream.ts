import {
    ALL_USFM_MARKERS,
    VALID_PARA_MARKERS,
} from "@/core/data/usfm/tokens.ts";
import { TokenMap } from "@/core/domain/usfm/lex.ts";
import {
    POETRY_MARKERS,
    PRETTIFY_LINEBREAK_BEFORE_AND_AFTER_MARKERS,
    PRETTIFY_LINEBREAK_BEFORE_IF_NEXT_MARKER_MARKERS,
    PRETTIFY_LINEBREAK_BEFORE_MARKERS,
} from "./prettifyMarkers.ts";

export type PrettifyToken = {
    tokenType: string;
    text: string;
    marker?: string;
    sid?: string;
    id?: string;
    inPara?: string;
    inChars?: string[];
    attributes?: Record<string, string>;
    content?: PrettifyToken[];
    [key: string]: unknown;
};

export type PrettifyContext = {
    previousSibling?: PrettifyToken;
    nextSibling?: PrettifyToken;
    poetryMarkers?: Set<string>;
};

const createNlToken = (): PrettifyToken => ({
    tokenType: TokenMap.verticalWhitespace,
    text: "\n",
});

const isNlToken = (t: PrettifyToken): boolean =>
    t.tokenType === TokenMap.verticalWhitespace;

const isTextLike = (t: PrettifyToken): boolean =>
    t.tokenType === TokenMap.marker ||
    t.tokenType === TokenMap.endMarker ||
    t.tokenType === TokenMap.numberRange ||
    t.tokenType === TokenMap.text;

/**
 * Inserts a default paragraph marker (`\\p`) after chapter intro material when the
 * chapter begins with a verse marker and there is no explicit paragraph marker
 * in between.
 *
 * This is a structural normalization helper used by editor-side prettify flows.
 * It intentionally does NOT add trailing whitespace to the marker token; downstream
 * spacing transforms should ensure separators where needed.
 */
export function insertDefaultParagraphAfterChapterIntro(
    tokens: PrettifyToken[],
): PrettifyToken[] {
    const out: PrettifyToken[] = [];

    let inChapterIntro = false;
    let sawParaMarkerInIntro = false;
    let sawChapterMarker = false;
    let sawChapterNumber = false;

    const isChapterMarker = (t: PrettifyToken) =>
        t.tokenType === TokenMap.marker && t.marker === "c";
    const isVerseMarker = (t: PrettifyToken) =>
        t.tokenType === TokenMap.marker && t.marker === "v";
    const isParaMarker = (t: PrettifyToken) =>
        t.tokenType === TokenMap.marker &&
        !!t.marker &&
        VALID_PARA_MARKERS.has(t.marker);

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];

        if (isChapterMarker(t)) {
            // Reset for the new chapter.
            sawChapterMarker = true;
            sawChapterNumber = false;
            inChapterIntro = false;
            sawParaMarkerInIntro = false;
            out.push(t);
            continue;
        }

        // After \c we expect a chapter numberRange, then usually a linebreak.
        if (sawChapterMarker && !sawChapterNumber) {
            if (t.tokenType === TokenMap.numberRange) {
                sawChapterNumber = true;
            }
            out.push(t);
            continue;
        }

        if (sawChapterMarker && sawChapterNumber && !inChapterIntro) {
            // Start intro region once we hit the first token after chapter number.
            inChapterIntro = true;
        }

        if (inChapterIntro) {
            if (isParaMarker(t)) {
                sawParaMarkerInIntro = true;
            }

            if (isVerseMarker(t) && !sawParaMarkerInIntro) {
                out.push({
                    tokenType: TokenMap.marker,
                    text: "\\p",
                    marker: "p",
                    sid: t.sid,
                    inPara: "p",
                });
                // Only insert once per chapter intro.
                sawParaMarkerInIntro = true;
            }

            // Stop intro once we hit the first verse marker (or another chapter marker).
            if (isVerseMarker(t)) {
                inChapterIntro = false;
            }
        }

        out.push(t);
    }

    return out;
}

/**
 * Scans for malformed markers (e.g. "\\ \\v ") in text/error tokens.
 * If found and valid, splits the token into a Marker token and a Text token.
 */
export function recoverMalformedMarkers(
    token: PrettifyToken,
): PrettifyToken | PrettifyToken[] {
    if (
        (token.tokenType === TokenMap.text ||
            token.tokenType === TokenMap.error) &&
        typeof token.text === "string"
    ) {
        const regex = /\\([a-zA-Z0-9]+)\s/;
        const match = token.text.match(regex);
        if (match) {
            const capturedMarker = match[1];
            if (ALL_USFM_MARKERS.has(capturedMarker)) {
                const markerText = `\\${capturedMarker}`;
                const markerToken: PrettifyToken = {
                    ...token,
                    tokenType: TokenMap.marker,
                    marker: capturedMarker,
                    text: markerText,
                };

                const matchIndex = match.index ?? 0;
                const remainingText = token.text.slice(
                    matchIndex + markerText.length,
                );

                const textToken: PrettifyToken = {
                    ...token,
                    tokenType: TokenMap.text,
                    text: remainingText,
                    marker: undefined,
                };

                return [markerToken, textToken];
            }
        }
    }
    return token;
}

/**
 * Replaces multiple horizontal spaces/tabs with a single space.
 */
export function collapseWhitespaceInTextNode(
    token: PrettifyToken,
): PrettifyToken {
    if (token.tokenType !== TokenMap.text) return token;
    const newText = token.text.replace(/[ \t]+/g, " ");
    if (newText === token.text) return token;
    return { ...token, text: newText };
}

/**
 * Ensures at least one space exists between adjacent inline tokens.
 */
export function ensureSpaceBetweenNodes(
    token: PrettifyToken,
    context: PrettifyContext,
): PrettifyToken {
    if (isNlToken(token)) return token;
    const prev = context.previousSibling;
    if (!prev || isNlToken(prev)) return token;
    if (!isTextLike(token) || !isTextLike(prev)) return token;

    const prevEndsWithSpace = /\s$/.test(prev.text);
    const currStartsWithSpace = /^\s/.test(token.text);
    if (!prevEndsWithSpace && !currStartsWithSpace) {
        return { ...token, text: ` ${token.text}` };
    }
    return token;
}

/**
 * Detects the pattern "\\v 5 5" and removes the duplicate number from the text token.
 */
export function removeDuplicateVerseNumbers(
    token: PrettifyToken,
    context: PrettifyContext,
): PrettifyToken {
    if (token.tokenType !== TokenMap.text) return token;
    const prev = context.previousSibling;
    if (!prev) return token;
    if (prev.tokenType !== TokenMap.numberRange) return token;
    const verseNumber = prev.text.trim();
    const regex = new RegExp(`^\\s*${verseNumber}\\s*`);
    if (!regex.test(token.text)) return token;
    return { ...token, text: token.text.replace(regex, "") };
}

/**
 * Reduce multiple spaces between a paragraph marker and its content to a single space.
 */
export function normalizeSpacingAfterParaMarkers(
    token: PrettifyToken,
    context: PrettifyContext,
): PrettifyToken {
    if (token.tokenType !== TokenMap.text) return token;
    const prev = context.previousSibling;
    if (!prev) return token;
    if (prev.tokenType !== TokenMap.marker) return token;
    if (!prev.marker) return token;

    if (PRETTIFY_LINEBREAK_BEFORE_MARKERS.has(prev.marker)) {
        const newText = token.text.replace(/^ +/, " ");
        if (newText === token.text) return token;
        return { ...token, text: newText };
    }

    return token;
}

/**
 * Removes vertical whitespace tokens when they are unwanted.
 */
export function removeUnwantedLinebreaks(
    token: PrettifyToken,
    context: PrettifyContext,
): PrettifyToken | PrettifyToken[] {
    if (!isNlToken(token)) return token;

    const prev = context.previousSibling;
    const next = context.nextSibling;
    const prevMarker =
        prev?.tokenType === TokenMap.marker ? prev.marker : undefined;
    const nextIsMarker = next?.tokenType === TokenMap.marker;
    const nextMarker = nextIsMarker ? next.marker : undefined;

    // Keep after structural markers
    if (
        prevMarker &&
        PRETTIFY_LINEBREAK_BEFORE_AND_AFTER_MARKERS.has(prevMarker)
    ) {
        return token;
    }

    // Conditional-after markers (ex: poetry)
    if (
        prevMarker &&
        PRETTIFY_LINEBREAK_BEFORE_IF_NEXT_MARKER_MARKERS.has(prevMarker)
    ) {
        if (nextIsMarker) return token;
        return [];
    }

    // Remove after markers that only require a linebreak before
    if (prevMarker && PRETTIFY_LINEBREAK_BEFORE_MARKERS.has(prevMarker)) {
        return [];
    }

    // Remove before verse markers, except after chapter numberRange
    if (nextMarker === "v") {
        const prevIsChapterNum =
            prev?.tokenType === TokenMap.numberRange && prev.marker === "c";
        if (prevIsChapterNum) return token;
        return [];
    }

    return token;
}

export type PendingVerse = {
    verseNumber: string;
    resultIndex: number;
};

/**
 * Distributes combined verse text (e.g. "\\v 1 \\v 2 1. TextOne 2. TextTwo")
 * to their respective verse markers.
 */
export function distributeCombinedVerseText(
    tokens: PrettifyToken[],
): PrettifyToken[] {
    const result: PrettifyToken[] = [];
    const pendingVerses: PendingVerse[] = [];

    const isVerseMarkerToken = (t: PrettifyToken) =>
        t.tokenType === TokenMap.marker && t.marker === "v";

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        // Clear pending verses if we encounter a marker that is not a verse marker
        if (token.tokenType === TokenMap.marker && token.marker !== "v") {
            pendingVerses.length = 0;
        } else if (
            token.tokenType !== TokenMap.marker &&
            token.tokenType !== TokenMap.text &&
            token.tokenType !== TokenMap.numberRange &&
            token.tokenType !== TokenMap.error &&
            !isNlToken(token)
        ) {
            // Clear pending verses on non-usfm tokens (except vertical whitespace)
            pendingVerses.length = 0;
        }

        // Check for Verse Marker + Number
        if (token.tokenType === TokenMap.numberRange) {
            const prev = result[result.length - 1];
            if (prev && isVerseMarkerToken(prev)) {
                result.push(token);
                pendingVerses.push({
                    verseNumber: token.text.trim(),
                    resultIndex: result.length,
                });
                continue;
            }
        }

        // Text node after pending verses
        if (token.tokenType === TokenMap.text && pendingVerses.length > 0) {
            const text = token.text;
            const matches: { verse: string; start: number }[] = [];

            for (const pv of pendingVerses) {
                const escapedVerse = pv.verseNumber.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&",
                );
                const regex = new RegExp(`${escapedVerse}[. )]`);
                const match = regex.exec(text);
                if (match) {
                    matches.push({ verse: pv.verseNumber, start: match.index });
                }
            }

            if (matches.length > 0) {
                matches.sort((a, b) => a.start - b.start);
                const preText = text.slice(0, matches[0].start);

                if (preText.length > 0) {
                    const remainingToken: PrettifyToken = {
                        ...token,
                        text: preText,
                    };
                    const insertionIndex = result.length;
                    result.push(remainingToken);
                    for (const p of pendingVerses) {
                        if (p.resultIndex >= insertionIndex) p.resultIndex++;
                    }
                }

                for (let m = 0; m < matches.length; m++) {
                    const match = matches[m];
                    const nextStart = matches[m + 1]?.start ?? text.length;
                    const segmentText = text.slice(match.start, nextStart);

                    const pvIndex = pendingVerses.findIndex(
                        (p) => p.verseNumber === match.verse,
                    );
                    if (pvIndex !== -1) {
                        const pv = pendingVerses[pvIndex];
                        const newToken: PrettifyToken = {
                            ...token,
                            text: segmentText,
                        };

                        result.splice(pv.resultIndex, 0, newToken);

                        for (const p of pendingVerses) {
                            if (p.resultIndex >= pv.resultIndex)
                                p.resultIndex++;
                        }
                        pendingVerses.splice(pvIndex, 1);
                    }
                }

                continue;
            }

            // No matches => clear pending verses to prevent false matches later
            pendingVerses.length = 0;
        }

        result.push(token);
    }

    return result;
}

function insertLinebreakBeforeParaMarkersInternal(
    token: PrettifyToken,
    prev: PrettifyToken | undefined,
): PrettifyToken[] {
    if (token.tokenType !== TokenMap.marker || !token.marker) return [token];
    if (!PRETTIFY_LINEBREAK_BEFORE_MARKERS.has(token.marker)) return [token];
    if (!prev) return [token];
    if (isNlToken(prev)) return [token];
    return [createNlToken(), token];
}

function insertLinebreakAfterParaMarkersInternal(
    token: PrettifyToken,
    next: PrettifyToken | undefined,
): PrettifyToken[] {
    if (token.tokenType !== TokenMap.marker || !token.marker) return [token];

    const marker = token.marker;
    const isAlwaysAfter =
        PRETTIFY_LINEBREAK_BEFORE_AND_AFTER_MARKERS.has(marker);
    const isAfterIfNextMarker =
        PRETTIFY_LINEBREAK_BEFORE_IF_NEXT_MARKER_MARKERS.has(marker);

    if (isAfterIfNextMarker) {
        const nextIsMarker = next?.tokenType === TokenMap.marker;
        if (!nextIsMarker) return [token];
        if (next && isNlToken(next)) return [token];
        return [token, createNlToken()];
    }

    if (isAlwaysAfter) {
        if (next && isNlToken(next)) return [token];
        return [token, createNlToken()];
    }

    return [token];
}

function insertLinebreakAfterChapterNumberRangeInternal(
    token: PrettifyToken,
    prev: PrettifyToken | undefined,
    next: PrettifyToken | undefined,
): PrettifyToken[] {
    if (token.tokenType !== TokenMap.numberRange) return [token];
    const isChapter =
        token.marker === "c" ||
        (prev?.tokenType === TokenMap.marker && prev.marker === "c");
    if (!isChapter) return [token];
    if (next && isNlToken(next)) return [token, createNlToken()];
    return [token, createNlToken()];
}

export function insertLinebreakBeforeParaMarkers(
    token: PrettifyToken,
    context: PrettifyContext,
): PrettifyToken | PrettifyToken[] {
    const res = insertLinebreakBeforeParaMarkersInternal(
        token,
        context.previousSibling,
    );
    return res.length === 1 ? res[0] : res;
}

export function insertLinebreakAfterParaMarkers(
    token: PrettifyToken,
    context: PrettifyContext,
): PrettifyToken | PrettifyToken[] {
    const res = insertLinebreakAfterParaMarkersInternal(
        token,
        context.nextSibling,
    );
    return res.length === 1 ? res[0] : res;
}

export function insertLinebreakAfterChapterNumberRange(
    token: PrettifyToken,
    context: PrettifyContext,
): PrettifyToken | PrettifyToken[] {
    const res = insertLinebreakAfterChapterNumberRangeInternal(
        token,
        context.previousSibling,
        context.nextSibling,
    );
    return res.length === 1 ? res[0] : res;
}

function collapseConsecutiveLinebreaks(
    tokens: PrettifyToken[],
): PrettifyToken[] {
    const out: PrettifyToken[] = [];
    for (const t of tokens) {
        if (isNlToken(t) && isNlToken(out[out.length - 1] as PrettifyToken)) {
            continue;
        }
        out.push(t);
    }
    return out;
}

/**
 * Main prettify entry: operates on a flat token stream and returns a new flat token stream.
 * Recurses into `content` (notes) as well.
 */
export function prettifyTokenStream(
    tokens: PrettifyToken[],
    poetryMarkers: Set<string> = POETRY_MARKERS,
): PrettifyToken[] {
    // 0. Recurse into nested content first
    const withNested = tokens.map((t) => {
        if (!t.content || !Array.isArray(t.content)) return t;
        const nextContent = prettifyTokenStream(t.content, poetryMarkers);
        // Preserve object identity if nothing changed.
        if (nextContent === t.content) return t;
        return { ...t, content: nextContent };
    });

    // 1. Distribute combined verse text
    const distributed = distributeCombinedVerseText(withNested);

    // 2. Merge adjacent text tokens with same sid+marker+tokenType
    const merged: PrettifyToken[] = [];
    for (const t of distributed) {
        const last = merged[merged.length - 1];
        if (
            last &&
            t.tokenType === TokenMap.text &&
            last.tokenType === TokenMap.text &&
            (last.sid ?? "") === (t.sid ?? "") &&
            (last.marker ?? "") === (t.marker ?? "")
        ) {
            merged[merged.length - 1] = { ...last, text: last.text + t.text };
            continue;
        }
        merged.push(t);
    }

    // 3. Single-token fixes + remove unwanted linebreaks
    const cleaned: PrettifyToken[] = [];
    for (let i = 0; i < merged.length; i++) {
        const token = merged[i];
        const prev = cleaned[cleaned.length - 1];
        const next = merged[i + 1];

        // Recover malformed markers (can split)
        const recovered = recoverMalformedMarkers(token);
        if (Array.isArray(recovered)) {
            cleaned.push(...recovered);
            continue;
        }

        let current = recovered as PrettifyToken;

        // Space normalization is applied to all text-like tokens (marker/number/text/endMarker)
        // to prevent glued tokens like "1\\v".
        current = ensureSpaceBetweenNodes(current, {
            previousSibling: prev,
        });

        if (current.tokenType === TokenMap.text) {
            current = collapseWhitespaceInTextNode(current);
            current = removeDuplicateVerseNumbers(current, {
                previousSibling: prev,
            });
            current = normalizeSpacingAfterParaMarkers(current, {
                previousSibling: prev,
                poetryMarkers,
            });
        }

        if (isNlToken(current)) {
            const maybe = removeUnwantedLinebreaks(current, {
                previousSibling: prev,
                nextSibling: next,
                poetryMarkers,
            });
            if (Array.isArray(maybe) && maybe.length === 0) {
                continue;
            }
            cleaned.push(maybe as PrettifyToken);
            continue;
        }

        cleaned.push(current);
    }

    // 4. Insert linebreaks before markers
    const withBefore: PrettifyToken[] = [];
    for (let i = 0; i < cleaned.length; i++) {
        const token = cleaned[i];
        const prev = withBefore[withBefore.length - 1];
        withBefore.push(
            ...insertLinebreakBeforeParaMarkersInternal(token, prev),
        );
    }

    // 5. Insert linebreaks after markers
    const withAfter: PrettifyToken[] = [];
    for (let i = 0; i < withBefore.length; i++) {
        const token = withBefore[i];
        const next = withBefore[i + 1];
        withAfter.push(...insertLinebreakAfterParaMarkersInternal(token, next));
    }

    // 6. Ensure linebreak after chapter number range
    const withChapterBreak: PrettifyToken[] = [];
    for (let i = 0; i < withAfter.length; i++) {
        const token = withAfter[i];
        const prev = withChapterBreak[withChapterBreak.length - 1];
        const next = withAfter[i + 1];
        withChapterBreak.push(
            ...insertLinebreakAfterChapterNumberRangeInternal(
                token,
                prev,
                next,
            ),
        );
    }

    // 7. Remove duplicate linebreaks
    return collapseConsecutiveLinebreaks(withChapterBreak);
}

/**
 * Rehydrates a flat list of tokens back into paragraph-grouped token streams.
 * This is for core token streams only (NOT Lexical paragraph containers).
 */
export function groupFlatTokensIntoParagraphRuns(
    tokens: PrettifyToken[],
): PrettifyToken[][] {
    const runs: PrettifyToken[][] = [];
    let current: PrettifyToken[] = [];
    for (const t of tokens) {
        if (
            t.tokenType === TokenMap.marker &&
            t.marker &&
            VALID_PARA_MARKERS.has(t.marker)
        ) {
            if (current.length) runs.push(current);
            current = [t];
            continue;
        }
        current.push(t);
    }
    if (current.length) runs.push(current);
    return runs;
}
