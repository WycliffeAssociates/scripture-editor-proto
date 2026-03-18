import { parseSid } from "@/core/data/bible/bible.ts";
import { VALID_PARA_MARKERS } from "@/core/domain/usfm/onionMarkers.ts";
import type { TokenEnvelope } from "@/core/domain/usfm/tokenEnvelope.ts";

export type MatchFormattingScope = "chapter" | "book" | "project";
export type TargetMarkerPreservationMode =
    | "strip_all"
    | "keep_all"
    | "recommended";

export type SkippedMarkerSuggestion = {
    id: string;
    reason: "intra_verse_placement_ambiguous";
    scope: MatchFormattingScope;
    bookCode?: string;
    chapter?: number;
    verse: string;
    marker: string;
    sourceVerseTextExcerpt: string;
    sourceMarkerLocalContext: string;
    sourceBlockExcerpt: string;
    targetVerseTextExcerpt: string;
};

export type VerseAnchorMatchStats = {
    matchedVerses: number;
    sourceOnlyVerses: number;
    targetOnlyVerses: number;
    insertedBoundaryMarkers: number;
    skippedSuggestions: number;
};

export type MatchFormattingByVerseAnchorsResult = {
    tokens: TokenEnvelope[];
    suggestions: SkippedMarkerSuggestion[];
    stats: VerseAnchorMatchStats;
};

type VerseSegment = {
    key: string;
    verseText: string;
    startIndex: number;
    numberIndex: number;
    endIndex: number;
};

const PRELUDE_COPY_ALLOWED_MARKERS = VALID_PARA_MARKERS;
const DISALLOWED_SOURCE_MARKERS = new Set(["s5"]);

const isLinebreakToken = (token: TokenEnvelope | undefined): boolean =>
    token?.tokenType === "nl";

const isVerseMarkerToken = (token: TokenEnvelope | undefined): boolean =>
    token?.tokenType === "marker" && token.marker === "v";

const isNumberRangeToken = (token: TokenEnvelope | undefined): boolean =>
    token?.tokenType === "numberRange";

const isContentfulTextToken = (token: TokenEnvelope | undefined): boolean =>
    token?.tokenType === "text" && token.text.trim().length > 0;

const isParagraphMarkerToken = (token: TokenEnvelope | undefined): boolean =>
    token?.tokenType === "marker" &&
    !!token.marker &&
    PRELUDE_COPY_ALLOWED_MARKERS.has(token.marker);

const isStructureMarkerToken = (token: TokenEnvelope | undefined): boolean =>
    isParagraphMarkerToken(token) &&
    Boolean(token?.marker) &&
    !DISALLOWED_SOURCE_MARKERS.has(token?.marker || "");

const isDisallowedSourceMarkerToken = (
    token: TokenEnvelope | undefined,
): boolean =>
    token?.tokenType === "marker" &&
    !!token.marker &&
    DISALLOWED_SOURCE_MARKERS.has(token.marker);

function isPoetryMarkerToken(token: TokenEnvelope | undefined): boolean {
    return (
        token?.tokenType === "marker" &&
        !!token.marker &&
        token.marker.startsWith("q")
    );
}

function shouldKeepTargetParagraphMarker(
    token: TokenEnvelope,
    nextToken: TokenEnvelope | undefined,
    targetMarkerPreservation: TargetMarkerPreservationMode,
): boolean {
    if (isDisallowedSourceMarkerToken(token)) return false;

    if (targetMarkerPreservation === "keep_all") return true;
    if (targetMarkerPreservation === "strip_all") return false;

    // recommended:
    // - strip boundary-like markers followed by linebreak
    // - keep markers that appear inline before content
    // - keep poetry markers unless explicitly boundary-like
    if (isLinebreakToken(nextToken)) return false;
    if (isContentfulTextToken(nextToken)) return true;
    if (isPoetryMarkerToken(token)) return true;
    return false;
}

function stripTargetFormattingTokensByMode(
    tokens: TokenEnvelope[],
    targetMarkerPreservation: TargetMarkerPreservationMode,
): TokenEnvelope[] {
    const out: TokenEnvelope[] = [];
    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        if (!token) continue;
        if (isLinebreakToken(token)) continue;
        if (isParagraphMarkerToken(token)) {
            const nextToken = tokens[index + 1];
            if (
                !shouldKeepTargetParagraphMarker(
                    token,
                    nextToken,
                    targetMarkerPreservation,
                )
            ) {
                continue;
            }
        }
        out.push(token);
    }
    return out;
}

function normalizeWhitespaceAndJoin(parts: string[]): string {
    return parts.join("").replace(/\s+/g, " ").trim();
}

function tokenSnippet(tokens: TokenEnvelope[], maxChars = 180): string {
    const raw = normalizeWhitespaceAndJoin(
        tokens.map((token) => {
            if (token.tokenType === "nl") return " ";
            if (token.tokenType === "marker") {
                return token.text || `\\${token.marker ?? ""}`;
            }
            return token.text;
        }),
    );
    if (raw.length <= maxChars) return raw;
    return `${raw.slice(0, maxChars - 1)}…`;
}

function guessChapterFromTokens(
    tokens: TokenEnvelope[],
    index: number,
): number {
    for (let i = index; i >= 1; i--) {
        const maybeNumber = tokens[i];
        const maybeChapterMarker = tokens[i - 1];
        if (
            maybeChapterMarker.tokenType === "marker" &&
            maybeChapterMarker.marker === "c" &&
            maybeNumber.tokenType === "numberRange"
        ) {
            const parsed = Number.parseInt(maybeNumber.text.trim(), 10);
            if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
    }
    return 0;
}

function verseKey(chapter: number, verseText: string): string {
    return `${chapter}:${verseText}`;
}

function parseVerseSegments(tokens: TokenEnvelope[]): VerseSegment[] {
    const starts: Array<{
        index: number;
        numberIndex: number;
        chapter: number;
        verseText: string;
    }> = [];

    for (let i = 0; i < tokens.length - 1; i++) {
        const marker = tokens[i];
        const number = tokens[i + 1];
        if (!isVerseMarkerToken(marker) || !isNumberRangeToken(number))
            continue;

        const parsedSid = parseSid(number.sid ?? marker.sid ?? "");
        const chapterFromSid = parsedSid?.chapter ?? 0;
        const chapter =
            chapterFromSid > 0
                ? chapterFromSid
                : guessChapterFromTokens(tokens, i);
        const verseText = number.text.trim();

        starts.push({
            index: i,
            numberIndex: i + 1,
            chapter,
            verseText,
        });
        i += 1;
    }

    const segments: VerseSegment[] = [];
    for (let i = 0; i < starts.length; i++) {
        const current = starts[i];
        const next = starts[i + 1];
        const endIndex = next?.index ?? tokens.length;

        segments.push({
            key: verseKey(current.chapter, current.verseText),
            verseText: current.verseText,
            startIndex: current.index,
            numberIndex: current.numberIndex,
            endIndex,
        });
    }

    return segments;
}

function cloneTokenForInsert(
    token: TokenEnvelope,
    salt: string,
): TokenEnvelope {
    const cloned: TokenEnvelope = {
        tokenType: token.tokenType,
        text: token.text,
        marker: token.marker,
        sid: token.sid,
        inPara: token.inPara,
        inChars: token.inChars ? [...token.inChars] : undefined,
        attributes: token.attributes ? { ...token.attributes } : undefined,
        id:
            token.tokenType === "marker" || token.tokenType === "numberRange"
                ? `fmt-${salt}-${Math.random().toString(36).slice(2)}`
                : token.id,
    };
    return cloned;
}

function markerSignature(tokens: TokenEnvelope[]): string {
    return tokens
        .filter((token) => isStructureMarkerToken(token))
        .map((token) => token.marker)
        .join("|");
}

function findBoundaryStartBeforeVerse(
    tokens: TokenEnvelope[],
    verseStartIndex: number,
): number {
    let i = verseStartIndex - 1;
    while (i >= 0) {
        const token = tokens[i];
        if (
            isLinebreakToken(token) ||
            isStructureMarkerToken(token) ||
            isDisallowedSourceMarkerToken(token)
        ) {
            i -= 1;
            continue;
        }
        break;
    }
    return i + 1;
}

function extractBoundaryBeforeVerse(
    tokens: TokenEnvelope[],
    verseStartIndex: number,
): TokenEnvelope[] {
    const boundaryStart = findBoundaryStartBeforeVerse(tokens, verseStartIndex);
    return tokens
        .slice(boundaryStart, verseStartIndex)
        .filter(
            (token) => isLinebreakToken(token) || isStructureMarkerToken(token),
        );
}

function compactConsecutiveLinebreaks(
    tokens: TokenEnvelope[],
): TokenEnvelope[] {
    const out: TokenEnvelope[] = [];
    for (const token of tokens) {
        if (isLinebreakToken(token) && isLinebreakToken(out[out.length - 1])) {
            continue;
        }
        out.push(token);
    }
    return out;
}

function buildSkippedSuggestionsForSegment({
    scope,
    sourceTokens,
    sourceSegment,
    targetTokens,
    targetSegment,
}: {
    scope: MatchFormattingScope;
    sourceTokens: TokenEnvelope[];
    sourceSegment: VerseSegment;
    targetTokens: TokenEnvelope[];
    targetSegment: VerseSegment;
}): SkippedMarkerSuggestion[] {
    const sourceBody = sourceTokens.slice(
        sourceSegment.numberIndex + 1,
        sourceSegment.endIndex,
    );
    const targetBody = targetTokens.slice(
        targetSegment.numberIndex + 1,
        targetSegment.endIndex,
    );
    const firstContentIndex = sourceBody.findIndex((token) =>
        isContentfulTextToken(token),
    );
    if (firstContentIndex < 0) return [];

    const findTrailingBoundaryStart = (body: TokenEnvelope[]): number => {
        let trailingStart = body.length;
        for (let i = body.length - 1; i >= 0; i--) {
            const token = body[i];
            if (
                isLinebreakToken(token) ||
                isStructureMarkerToken(token) ||
                isDisallowedSourceMarkerToken(token)
            ) {
                trailingStart = i;
                continue;
            }
            break;
        }
        return trailingStart;
    };

    const collectIntraVerseMarkers = (
        body: TokenEnvelope[],
        bodyFirstContentIndex: number,
        trailingBoundaryStart: number,
    ): Array<{ token: TokenEnvelope; index: number }> => {
        const markers: Array<{ token: TokenEnvelope; index: number }> = [];
        for (let i = bodyFirstContentIndex + 1; i < body.length; i++) {
            if (i >= trailingBoundaryStart) continue;
            const token = body[i];
            if (!isStructureMarkerToken(token)) continue;
            markers.push({ token, index: i });
        }
        return markers;
    };

    const trailingBoundaryStart = findTrailingBoundaryStart(sourceBody);
    const allIntraVerseMarkers = collectIntraVerseMarkers(
        sourceBody,
        firstContentIndex,
        trailingBoundaryStart,
    );
    if (allIntraVerseMarkers.length === 0) return [];

    const targetFirstContentIndex = targetBody.findIndex((token) =>
        isContentfulTextToken(token),
    );
    const targetTrailingBoundaryStart = findTrailingBoundaryStart(targetBody);
    const targetIntraVerseMarkers =
        targetFirstContentIndex >= 0
            ? collectIntraVerseMarkers(
                  targetBody,
                  targetFirstContentIndex,
                  targetTrailingBoundaryStart,
              )
            : [];

    const missingMarkers: Array<{
        token: TokenEnvelope;
        index: number;
        sourceMarkerPosition: number;
    }> = [];
    let targetCursor = 0;
    for (
        let sourceMarkerPosition = 0;
        sourceMarkerPosition < allIntraVerseMarkers.length;
        sourceMarkerPosition++
    ) {
        const sourceMarker = allIntraVerseMarkers[sourceMarkerPosition];
        let matchedTargetIndex = -1;
        for (
            let candidateIndex = targetCursor;
            candidateIndex < targetIntraVerseMarkers.length;
            candidateIndex++
        ) {
            const targetMarker = targetIntraVerseMarkers[candidateIndex];
            if (targetMarker.token.marker === sourceMarker.token.marker) {
                matchedTargetIndex = candidateIndex;
                break;
            }
        }

        if (matchedTargetIndex >= 0) {
            targetCursor = matchedTargetIndex + 1;
            continue;
        }

        missingMarkers.push({
            token: sourceMarker.token,
            index: sourceMarker.index,
            sourceMarkerPosition,
        });
    }
    if (missingMarkers.length === 0) return [];

    return missingMarkers.map(({ token, index, sourceMarkerPosition }) => {
        const parsedSid = parseSid(token.sid ?? "");
        const contextStart = Math.max(0, index - 3);
        const contextEnd = Math.min(sourceBody.length, index + 4);
        const sourceContext = sourceBody.slice(contextStart, contextEnd);

        let blockEnd = sourceBody.length;
        for (let i = index + 1; i < sourceBody.length; i++) {
            if (isStructureMarkerToken(sourceBody[i])) {
                blockEnd = i;
                break;
            }
        }
        const sourceBlock = sourceBody.slice(index, blockEnd);

        return {
            id: [
                parsedSid?.book ?? "",
                sourceSegment.key,
                token.marker ?? "unknown",
                sourceMarkerPosition,
            ].join(":"),
            reason: "intra_verse_placement_ambiguous",
            scope,
            bookCode: parsedSid?.book,
            chapter: parsedSid?.chapter,
            verse: sourceSegment.verseText,
            marker: token.marker ?? "unknown",
            sourceVerseTextExcerpt: tokenSnippet(sourceBody),
            sourceMarkerLocalContext: tokenSnippet(sourceContext, 120),
            sourceBlockExcerpt: tokenSnippet(sourceBlock, 140),
            targetVerseTextExcerpt: tokenSnippet(targetBody),
        } as const;
    });
}

export function matchFormattingByVerseAnchors({
    targetTokens,
    sourceTokens,
    scope,
    targetMarkerPreservation = "strip_all",
}: {
    targetTokens: TokenEnvelope[];
    sourceTokens: TokenEnvelope[];
    scope: MatchFormattingScope;
    targetMarkerPreservation?: TargetMarkerPreservationMode;
}): MatchFormattingByVerseAnchorsResult {
    const normalizedTargetTokens = stripTargetFormattingTokensByMode(
        targetTokens,
        targetMarkerPreservation,
    );
    const sourceSegments = parseVerseSegments(sourceTokens);
    const targetSegments = parseVerseSegments(normalizedTargetTokens);

    const sourceMap = new Map(
        sourceSegments.map((segment) => [segment.key, segment]),
    );
    const targetMap = new Map(
        targetSegments.map((segment) => [segment.key, segment]),
    );

    const sourceKeys = new Set(sourceMap.keys());
    const targetKeys = new Set(targetMap.keys());
    const matchedKeys = new Set(
        [...sourceKeys].filter((key) => targetKeys.has(key)),
    );

    const boundaryByKey = new Map<string, TokenEnvelope[]>();
    for (const key of matchedKeys) {
        const sourceSegment = sourceMap.get(key);
        if (!sourceSegment) continue;
        const boundary = extractBoundaryBeforeVerse(
            sourceTokens,
            sourceSegment.startIndex,
        );
        boundaryByKey.set(key, boundary);
    }

    const suggestions: SkippedMarkerSuggestion[] = [];
    for (const key of matchedKeys) {
        const sourceSegment = sourceMap.get(key);
        const targetSegment = targetMap.get(key);
        if (!sourceSegment || !targetSegment) continue;
        suggestions.push(
            ...buildSkippedSuggestionsForSegment({
                scope,
                sourceTokens,
                sourceSegment,
                targetTokens: normalizedTargetTokens,
                targetSegment,
            }),
        );
    }

    if (targetSegments.length === 0) {
        return {
            tokens: normalizedTargetTokens,
            suggestions,
            stats: {
                matchedVerses: 0,
                sourceOnlyVerses: sourceKeys.size,
                targetOnlyVerses: 0,
                insertedBoundaryMarkers: 0,
                skippedSuggestions: suggestions.length,
            },
        };
    }

    const output: TokenEnvelope[] = [];
    let insertedBoundaryMarkers = 0;
    let cursor = 0;

    for (const targetSegment of targetSegments) {
        const key = targetSegment.key;
        const targetBoundaryStart = findBoundaryStartBeforeVerse(
            normalizedTargetTokens,
            targetSegment.startIndex,
        );
        const targetBoundary = normalizedTargetTokens.slice(
            targetBoundaryStart,
            targetSegment.startIndex,
        );
        const replacementBoundary = boundaryByKey.get(key);

        output.push(
            ...normalizedTargetTokens.slice(cursor, targetBoundaryStart),
        );

        if (replacementBoundary) {
            if (
                markerSignature(targetBoundary) !==
                markerSignature(replacementBoundary)
            ) {
                insertedBoundaryMarkers += replacementBoundary.filter((token) =>
                    isStructureMarkerToken(token),
                ).length;
            }
            const clonedPrelude = replacementBoundary.map((token, index) =>
                cloneTokenForInsert(token, `${key}-${index}`),
            );
            output.push(...clonedPrelude);
        } else {
            output.push(...targetBoundary);
        }

        output.push(
            ...normalizedTargetTokens.slice(
                targetSegment.startIndex,
                targetSegment.endIndex,
            ),
        );
        cursor = targetSegment.endIndex;
    }

    if (cursor < normalizedTargetTokens.length) {
        output.push(...normalizedTargetTokens.slice(cursor));
    }

    return {
        tokens: compactConsecutiveLinebreaks(output),
        suggestions,
        stats: {
            matchedVerses: matchedKeys.size,
            sourceOnlyVerses: [...sourceKeys].filter(
                (key) => !targetKeys.has(key),
            ).length,
            targetOnlyVerses: [...targetKeys].filter(
                (key) => !sourceKeys.has(key),
            ).length,
            insertedBoundaryMarkers,
            skippedSuggestions: suggestions.length,
        },
    };
}
