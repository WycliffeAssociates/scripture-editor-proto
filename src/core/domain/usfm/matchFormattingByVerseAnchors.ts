import { parseSid } from "@/core/data/bible/bible.ts";
import { VALID_PARA_MARKERS } from "@/core/domain/usfm/onionMarkers.ts";
import type { TokenEnvelope } from "@/core/domain/usfm/tokenEnvelope.ts";

/**
 * Match-formatting aligns source formatting to target scripture content using verse
 * anchors as the stable join key.
 *
 * This lets the app apply formatting or marker styling from one scripture source to
 * another without blindly replacing text content.
 */
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

const isLinebreakToken = (token: TokenEnvelope | undefined): boolean =>
    token?.tokenType === "nl";

const isVerseMarkerToken = (token: TokenEnvelope | undefined): boolean =>
    token?.tokenType === "marker" && token.marker === "v";

const isNumberRangeToken = (token: TokenEnvelope | undefined): boolean =>
    token?.tokenType === "numberRange";

const isContentfulTextToken = (token: TokenEnvelope | undefined): boolean =>
    token?.tokenType === "text" && token.text.trim().length > 0;

const isStructureMarkerToken = (token: TokenEnvelope | undefined): boolean =>
    token?.tokenType === "marker" &&
    !!token.marker &&
    (token.marker === "s5" || VALID_PARA_MARKERS.has(token.marker));

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
        if (isStructureMarkerToken(token)) {
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
        if (isLinebreakToken(token) || isStructureMarkerToken(token)) {
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

function findTrailingBoundaryStart(body: TokenEnvelope[]): number {
    let trailingStart = body.length;
    for (let i = body.length - 1; i >= 0; i--) {
        const token = body[i];
        if (isLinebreakToken(token) || isStructureMarkerToken(token)) {
            trailingStart = i;
            continue;
        }
        break;
    }
    return trailingStart;
}

function collectIntraVerseMarkers(
    body: TokenEnvelope[],
    bodyFirstContentIndex: number,
    trailingBoundaryStart: number,
): Array<{ token: TokenEnvelope; index: number }> {
    const markers: Array<{ token: TokenEnvelope; index: number }> = [];
    for (let i = bodyFirstContentIndex + 1; i < body.length; i++) {
        if (i >= trailingBoundaryStart) continue;
        const token = body[i];
        if (!isStructureMarkerToken(token)) continue;
        markers.push({ token, index: i });
    }
    return markers;
}

function findMissingIntraVerseMarkers({
    sourceTokens,
    sourceSegment,
    targetTokens,
    targetSegment,
}: {
    sourceTokens: TokenEnvelope[];
    sourceSegment: VerseSegment;
    targetTokens: TokenEnvelope[];
    targetSegment: VerseSegment;
}): Array<{
    token: TokenEnvelope;
    index: number;
    sourceMarkerPosition: number;
}> {
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

    return missingMarkers;
}

function buildTargetSegmentWithSourceIntraVerseMarkers({
    sourceTokens,
    sourceSegment,
    targetTokens,
    targetSegment,
}: {
    sourceTokens: TokenEnvelope[];
    sourceSegment: VerseSegment;
    targetTokens: TokenEnvelope[];
    targetSegment: VerseSegment;
}): TokenEnvelope[] {
    const segmentTokens = targetTokens.slice(
        targetSegment.startIndex,
        targetSegment.endIndex,
    );
    const missingMarkers = findMissingIntraVerseMarkers({
        sourceTokens,
        sourceSegment,
        targetTokens,
        targetSegment,
    });
    if (missingMarkers.length === 0) return segmentTokens;

    const insertions = missingMarkers.flatMap(
        ({ token, sourceMarkerPosition }) => [
            cloneTokenForInsert(
                token,
                `${targetSegment.key}-body-${sourceMarkerPosition}`,
            ),
            { tokenType: "nl", text: "\n" } satisfies TokenEnvelope,
        ],
    );
    return [...segmentTokens, ...insertions];
}

export function matchFormattingByVerseAnchors({
    targetTokens,
    sourceTokens,
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

        const sourceSegment = sourceMap.get(key);
        const matchedSegmentTokens = sourceSegment
            ? buildTargetSegmentWithSourceIntraVerseMarkers({
                  sourceTokens,
                  sourceSegment,
                  targetTokens: normalizedTargetTokens,
                  targetSegment,
              })
            : normalizedTargetTokens.slice(
                  targetSegment.startIndex,
                  targetSegment.endIndex,
              );
        output.push(...matchedSegmentTokens);
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
