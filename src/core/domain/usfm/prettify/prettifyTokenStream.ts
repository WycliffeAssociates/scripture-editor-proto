import { TokenMap } from "@/core/domain/usfm/lex.ts";
import {
    ALL_CHAR_MARKERS,
    ALL_USFM_MARKERS,
    VALID_NOTE_MARKERS,
    VALID_PARA_MARKERS,
} from "@/core/domain/usfm/onionMarkers.ts";
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

const isMarkerishToken = (t: PrettifyToken): boolean =>
    t.tokenType === TokenMap.marker || t.tokenType === TokenMap.endMarker;

const isCharOrNoteMarkerToken = (t: PrettifyToken): boolean => {
    if (!isMarkerishToken(t)) return false;
    if (!t.marker) return false;
    return ALL_CHAR_MARKERS.has(t.marker) || VALID_NOTE_MARKERS.has(t.marker);
};

const isProtectedWhitespaceBoundary = (
    prev: PrettifyToken,
    curr: PrettifyToken,
): boolean => isCharOrNoteMarkerToken(prev) || isCharOrNoteMarkerToken(curr);

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
    if (isProtectedWhitespaceBoundary(prev, token)) return token;

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

function normalizeMarkerWhitespaceAtLineStart(
    tokens: PrettifyToken[],
): PrettifyToken[] {
    return tokens.map((token, index) => {
        if (token.tokenType !== TokenMap.marker) return token;
        const prev = index > 0 ? tokens[index - 1] : undefined;
        const atLineStart = !prev || isNlToken(prev);
        if (!atLineStart) return token;
        const trimmed = token.text.replace(/^\s+/, "");
        if (trimmed === token.text) return token;
        return { ...token, text: trimmed };
    });
}

function bridgeConsecutiveVerseMarkers(
    tokens: PrettifyToken[],
): PrettifyToken[] {
    const out: PrettifyToken[] = [];

    const parseIntVerse = (token: PrettifyToken): number | null => {
        if (token.tokenType !== TokenMap.numberRange) return null;
        const trimmed = token.text.trim();
        if (!/^\d+$/.test(trimmed)) return null;
        return Number.parseInt(trimmed, 10);
    };

    const withOriginalSpacing = (
        original: string,
        normalizedVerseRange: string,
    ): string => {
        const leading = original.match(/^\s*/)?.[0] ?? "";
        const trailing = original.match(/\s*$/)?.[0] ?? "";
        return `${leading}${normalizedVerseRange}${trailing}`;
    };

    for (let i = 0; i < tokens.length; i++) {
        const marker = tokens[i];
        const number = tokens[i + 1];

        const isVersePair =
            marker?.tokenType === TokenMap.marker &&
            marker.marker === "v" &&
            number?.tokenType === TokenMap.numberRange;
        if (!isVersePair) {
            out.push(marker);
            continue;
        }

        const firstVerse = parseIntVerse(number);
        if (firstVerse == null) {
            out.push(marker, number);
            i += 1;
            continue;
        }

        let endVerse = firstVerse;
        let j = i + 2;

        while (j + 1 < tokens.length) {
            let candidateMarkerIndex = j;
            while (
                candidateMarkerIndex < tokens.length &&
                tokens[candidateMarkerIndex]?.tokenType === TokenMap.text &&
                tokens[candidateMarkerIndex].text.trim() === ""
            ) {
                candidateMarkerIndex++;
            }

            const nextMarker = tokens[candidateMarkerIndex];
            const nextNumber = tokens[candidateMarkerIndex + 1];
            if (
                nextMarker?.tokenType !== TokenMap.marker ||
                nextMarker.marker !== "v" ||
                nextNumber?.tokenType !== TokenMap.numberRange
            ) {
                break;
            }

            const nextVerse = parseIntVerse(nextNumber);
            if (nextVerse == null || nextVerse !== endVerse + 1) break;

            endVerse = nextVerse;
            j = candidateMarkerIndex + 2;
        }

        if (endVerse === firstVerse) {
            out.push(marker, number);
            i += 1;
            continue;
        }

        out.push(marker, {
            ...number,
            text: withOriginalSpacing(number.text, `${firstVerse}-${endVerse}`),
        });
        i = j - 1;
    }

    return out;
}

function removeOrphanEmptyVerseBeforeContentfulVerse(
    tokens: PrettifyToken[],
): PrettifyToken[] {
    const out: PrettifyToken[] = [];

    const isVerseMarker = (token: PrettifyToken | undefined): boolean =>
        token?.tokenType === TokenMap.marker && token.marker === "v";
    const isNumberRange = (token: PrettifyToken | undefined): boolean =>
        token?.tokenType === TokenMap.numberRange;
    const isWhitespaceOnlyText = (token: PrettifyToken | undefined): boolean =>
        token?.tokenType === TokenMap.text && token.text.trim() === "";
    const isContentfulText = (token: PrettifyToken | undefined): boolean =>
        token?.tokenType === TokenMap.text && token.text.trim().length > 0;

    for (let i = 0; i < tokens.length; i++) {
        const marker = tokens[i];
        const number = tokens[i + 1];

        if (!isVerseMarker(marker) || !isNumberRange(number)) {
            out.push(marker);
            continue;
        }

        let nextMarkerIndex = i + 2;
        while (isWhitespaceOnlyText(tokens[nextMarkerIndex])) {
            nextMarkerIndex++;
        }

        const nextMarker = tokens[nextMarkerIndex];
        const nextNumber = tokens[nextMarkerIndex + 1];
        const nextText = tokens[nextMarkerIndex + 2];
        const shouldDropCurrentVerse =
            isVerseMarker(nextMarker) &&
            isNumberRange(nextNumber) &&
            isContentfulText(nextText);

        if (shouldDropCurrentVerse) {
            i = nextMarkerIndex - 1;
            continue;
        }

        out.push(marker);
    }

    return out;
}

function removeBridgeVerseEnumerators(
    tokens: PrettifyToken[],
): PrettifyToken[] {
    const out = [...tokens];

    const parseBridgeRange = (
        text: string,
    ): { start: number; end: number } | null => {
        const match = text.trim().match(/^(\d+)\s*-\s*(\d+)$/);
        if (!match) return null;
        const start = Number.parseInt(match[1], 10);
        const end = Number.parseInt(match[2], 10);
        if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
        if (start > end) return null;
        return { start, end };
    };

    const LEADING_NUMBER_PUNCTUATION =
        /^(\s*)(\d+)\s*([!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~-])\s*/;
    const INLINE_NUMBER_PUNCTUATION =
        /(^|[\s(])(\d+)\s*([!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~-])\s+/g;

    for (let i = 0; i < out.length - 1; i++) {
        const marker = out[i];
        const rangeToken = out[i + 1];
        const next = out[i + 2];

        if (
            marker?.tokenType !== TokenMap.marker ||
            marker.marker !== "v" ||
            rangeToken?.tokenType !== TokenMap.numberRange ||
            next?.tokenType !== TokenMap.text
        ) {
            continue;
        }

        const range = parseBridgeRange(rangeToken.text);
        if (!range) continue;

        const match = next.text.match(LEADING_NUMBER_PUNCTUATION);
        if (!match) continue;

        const candidateVerse = Number.parseInt(match[2], 10);
        if (candidateVerse < range.start || candidateVerse > range.end)
            continue;

        let replacement = `${match[1]}${next.text.slice(match[0].length)}`;

        replacement = replacement.replace(
            INLINE_NUMBER_PUNCTUATION,
            (full, prefix: string, verseNumRaw: string) => {
                const verseNum = Number.parseInt(verseNumRaw, 10);
                if (verseNum >= range.start && verseNum <= range.end) {
                    return `${prefix}`;
                }
                return full;
            },
        );

        out[i + 2] = { ...next, text: replacement };
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

    // 1. Keep verse token order as-is; bridging/cleanup handles malformed runs.
    const distributed = withNested;

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

    // 4. Convert runs like "\v 1 \v 2 \v 3" into "\v 1-3"
    // after duplicate number cleanup has already happened.
    const withVerseBridges = bridgeConsecutiveVerseMarkers(cleaned);

    // 5. Drop empty/orphan verse markers when the next verse marker carries the text
    // e.g. "\v 5 \v 4 Let..." -> "\v 4 Let...".
    const withOrphanVerseCleanup =
        removeOrphanEmptyVerseBeforeContentfulVerse(withVerseBridges);

    // 6. Remove duplicated leading verse enumerators from bridged verse text,
    // e.g. "\v 1-3 1. Text" -> "\v 1-3 Text".
    const withBridgeEnumeratorCleanup = removeBridgeVerseEnumerators(
        withOrphanVerseCleanup,
    );

    // 7. Ensure default \p exists before the first verse after chapter intro.
    const withDefaultParagraphs = insertDefaultParagraphAfterChapterIntro(
        withBridgeEnumeratorCleanup,
    );

    // 8. Insert linebreaks before markers
    const withBefore: PrettifyToken[] = [];
    for (let i = 0; i < withDefaultParagraphs.length; i++) {
        const token = withDefaultParagraphs[i];
        const prev = withBefore[withBefore.length - 1];
        withBefore.push(
            ...insertLinebreakBeforeParaMarkersInternal(token, prev),
        );
    }

    // 9. Insert linebreaks after markers
    const withAfter: PrettifyToken[] = [];
    for (let i = 0; i < withBefore.length; i++) {
        const token = withBefore[i];
        const next = withBefore[i + 1];
        withAfter.push(...insertLinebreakAfterParaMarkersInternal(token, next));
    }

    // 10. Ensure linebreak after chapter number range
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

    // 11. Remove duplicate linebreaks
    const dedupedLinebreaks = collapseConsecutiveLinebreaks(withChapterBreak);

    // 12. Markers at line-start should not carry inherited leading spaces.
    return normalizeMarkerWhitespaceAtLineStart(dedupedLinebreaks);
}
