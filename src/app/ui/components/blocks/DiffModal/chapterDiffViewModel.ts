import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { isSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import type {
    ChapterRenderToken,
    ProjectDiff,
} from "@/app/domain/project/diffTypes.ts";
import { isValidParaMarker } from "@/core/domain/usfm/onionMarkers.ts";
import type { DiffTokenAlignment } from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * View-model helpers for the structured chapter diff renderer.
 *
 * The compare layer produces diff blocks; the chapter view needs those blocks
 * expanded into token ownership, paragraph grouping, and alignment metadata that
 * still resembles a scripture chapter.
 */
export type ChapterViewEntry = {
    uniqueKey: string;
    semanticSid: string;
    status: ProjectDiff["status"];
    originalText: string;
    currentText: string;
    isUsfmStructureChange: boolean;
    canRevert: boolean;
    diffToRevert?: ProjectDiff;
};

type ToChapterViewEntriesOptions = {
    hideWhitespaceOnly?: boolean;
    showUsfmMarkers?: boolean;
};

export type ChapterTokenWithOwner = {
    key: string;
    token: ChapterRenderToken;
    entry: ChapterViewEntry;
    isFirstTokenOfEntry: boolean;
    entryTokenIndex: number;
    entryTokenCount: number;
    counterpartEntryTokenIndex: number;
    tokenChange: "unchanged" | "added" | "deleted" | "modified" | "paired";
    counterpartToken?: ChapterRenderToken;
};

export type ChapterRenderParagraph = {
    key: string;
    marker: string;
    sid: string;
    tokens: ChapterTokenWithOwner[];
};

/**
 * Convert raw project diffs into chapter-view entries with display text and
 * action metadata ready for rendering.
 */
export function toChapterViewEntries(
    diffs: ProjectDiff[],
    options: ToChapterViewEntriesOptions = {},
): ChapterViewEntry[] {
    return diffs.map((diff) => {
        const shouldHideWhitespace =
            options.hideWhitespaceOnly && diff.isWhitespaceChange;
        const status: ProjectDiff["status"] = shouldHideWhitespace
            ? "unchanged"
            : diff.status;
        const canRevert = status !== "unchanged";
        const showUsfmMarkers = options.showUsfmMarkers ?? false;
        const originalText = showUsfmMarkers
            ? diff.originalDisplayText
            : (diff.originalTextOnly ?? diff.originalDisplayText);
        const currentText = showUsfmMarkers
            ? diff.currentDisplayText
            : (diff.currentTextOnly ?? diff.currentDisplayText);

        return {
            uniqueKey: diff.uniqueKey,
            semanticSid: diff.semanticSid,
            status,
            originalText,
            currentText,
            isUsfmStructureChange: diff.isUsfmStructureChange ?? false,
            canRevert,
            diffToRevert: canRevert ? diff : undefined,
        };
    });
}

function tokenKey(token: ChapterRenderToken, fallback: string): string {
    if (isSerializedUSFMTextNode(token.node)) {
        return token.node.id ?? fallback;
    }
    if (token.node.type === "linebreak") return `${fallback}-br`;
    return `${fallback}-${token.node.type}`;
}

function buildEntryRenderTokens(args: {
    diff: ProjectDiff;
    viewType: "original" | "current";
    hideWhitespaceOnly?: boolean;
    showUsfmMarkers?: boolean;
}): ChapterTokenWithOwner[] {
    const entry = toChapterViewEntries([args.diff], {
        hideWhitespaceOnly: args.hideWhitespaceOnly,
        showUsfmMarkers: args.showUsfmMarkers,
    })[0];
    if (!entry) return [];

    const originalTokens = args.diff.originalRenderTokens ?? [];
    const currentTokens = args.diff.currentRenderTokens ?? [];
    const alignedFromDiffOriginal = toAlignedTokenInfoFromDiff({
        tokens: originalTokens,
        alignment: args.diff.originalAlignment,
        counterpartTokens: currentTokens,
        side: "original",
    });
    const alignedFromDiffCurrent = toAlignedTokenInfoFromDiff({
        tokens: currentTokens,
        alignment: args.diff.currentAlignment,
        counterpartTokens: originalTokens,
        side: "current",
    });
    const aligned =
        alignedFromDiffOriginal && alignedFromDiffCurrent
            ? {
                  original: alignedFromDiffOriginal,
                  current: alignedFromDiffCurrent,
              }
            : passthroughAlignedTokens({
                  originalTokens,
                  currentTokens,
              });
    normalizeEquivalentBoundaryWhitespace(aligned);
    const entryTokens =
        args.viewType === "original" ? aligned.original : aligned.current;

    return entryTokens.map((tokenInfo) => {
        const token = tokenInfo.token;
        const tokenIndex =
            args.viewType === "original"
                ? tokenInfo.originalIndex
                : tokenInfo.currentIndex;
        return {
            key: tokenKey(
                token,
                `${entry.uniqueKey}-${Math.max(tokenIndex, 0)}-${entryTokens.indexOf(tokenInfo)}`,
            ),
            token,
            entry,
            isFirstTokenOfEntry: tokenInfo === entryTokens[0],
            entryTokenIndex: tokenIndex,
            entryTokenCount: entryTokens.length,
            counterpartEntryTokenIndex:
                args.viewType === "original"
                    ? tokenInfo.currentIndex
                    : tokenInfo.originalIndex,
            tokenChange: tokenInfo.tokenChange,
            counterpartToken: tokenInfo.counterpartToken,
        };
    });
}

type AlignedTokenInfo = {
    token: ChapterRenderToken;
    originalIndex: number;
    currentIndex: number;
    tokenChange: "unchanged" | "added" | "deleted" | "modified" | "paired";
    counterpartToken?: ChapterRenderToken;
};

function tokenSignature(token: ChapterRenderToken): string | null {
    if (!isSerializedUSFMTextNode(token.node)) return null;
    return `${token.node.tokenType ?? ""}::${token.node.marker ?? ""}::${token.node.type}`;
}

function normalizeEquivalentBoundaryWhitespace(args: {
    original: AlignedTokenInfo[];
    current: AlignedTokenInfo[];
}) {
    for (
        let originalIndex = 0;
        originalIndex < args.original.length - 1;
        originalIndex++
    ) {
        const originalLeft = args.original[originalIndex];
        const originalRight = args.original[originalIndex + 1];
        if (!originalLeft || !originalRight) continue;

        const currentLeftIndex = originalLeft.currentIndex;
        const currentRightIndex = originalRight.currentIndex;
        if (currentLeftIndex < 0 || currentRightIndex < 0) continue;
        if (currentRightIndex !== currentLeftIndex + 1) continue;

        const currentLeft = args.current[currentLeftIndex];
        const currentRight = args.current[currentRightIndex];
        if (!currentLeft || !currentRight) continue;
        if (
            currentLeft.originalIndex !== originalIndex ||
            currentRight.originalIndex !== originalIndex + 1
        ) {
            continue;
        }

        if (
            !isSerializedUSFMTextNode(originalLeft.token.node) ||
            !isSerializedUSFMTextNode(originalRight.token.node) ||
            !isSerializedUSFMTextNode(currentLeft.token.node) ||
            !isSerializedUSFMTextNode(currentRight.token.node)
        ) {
            continue;
        }

        const originalPairText =
            originalLeft.token.node.text + originalRight.token.node.text;
        const currentPairText =
            currentLeft.token.node.text + currentRight.token.node.text;
        if (originalPairText !== currentPairText) continue;

        const sameLeftShape =
            tokenSignature(originalLeft.token) ===
            tokenSignature(currentLeft.token);
        const sameRightShape =
            tokenSignature(originalRight.token) ===
            tokenSignature(currentRight.token);
        if (!sameLeftShape || !sameRightShape) continue;

        const hasBoundaryChange =
            originalLeft.tokenChange === "modified" ||
            originalRight.tokenChange === "modified" ||
            currentLeft.tokenChange === "modified" ||
            currentRight.tokenChange === "modified";
        if (!hasBoundaryChange) continue;

        originalLeft.tokenChange = "unchanged";
        originalRight.tokenChange = "unchanged";
        currentLeft.tokenChange = "unchanged";
        currentRight.tokenChange = "unchanged";
    }
}

function toAlignedTokenInfoFromDiff(args: {
    tokens: ChapterRenderToken[];
    alignment?: DiffTokenAlignment[];
    counterpartTokens: ChapterRenderToken[];
    side: "original" | "current";
}): AlignedTokenInfo[] | null {
    if (!args.alignment) return null;
    if (args.alignment.length !== args.tokens.length) return null;

    return args.tokens
        .map((token, index) => {
            const metadata = args.alignment?.[index];
            if (!metadata) return null;
            const counterpartIndex = metadata.counterpartIndex;
            const counterpartToken =
                counterpartIndex != null && counterpartIndex >= 0
                    ? args.counterpartTokens[counterpartIndex]
                    : undefined;
            return {
                token,
                originalIndex:
                    args.side === "original" ? index : (counterpartIndex ?? -1),
                currentIndex:
                    args.side === "current" ? index : (counterpartIndex ?? -1),
                tokenChange:
                    metadata.change === "added" ||
                    metadata.change === "deleted" ||
                    metadata.change === "modified"
                        ? metadata.change
                        : "unchanged",
                counterpartToken,
            } as AlignedTokenInfo;
        })
        .filter((value): value is AlignedTokenInfo => Boolean(value));
}

function passthroughAlignedTokens(args: {
    originalTokens: ChapterRenderToken[];
    currentTokens: ChapterRenderToken[];
}): {
    original: AlignedTokenInfo[];
    current: AlignedTokenInfo[];
} {
    return {
        original: args.originalTokens.map((token, index) => ({
            token,
            originalIndex: index,
            currentIndex: index < args.currentTokens.length ? index : -1,
            tokenChange: "unchanged",
            counterpartToken: args.currentTokens[index],
        })),
        current: args.currentTokens.map((token, index) => ({
            token,
            originalIndex: index < args.originalTokens.length ? index : -1,
            currentIndex: index,
            tokenChange: "unchanged",
            counterpartToken: args.originalTokens[index],
        })),
    };
}

export function buildChapterRenderParagraphs(args: {
    diffs: ProjectDiff[];
    viewType: "original" | "current";
    hideWhitespaceOnly?: boolean;
    showUsfmMarkers?: boolean;
}): ChapterRenderParagraph[] {
    const paragraphs: ChapterRenderParagraph[] = [];
    let currentParagraph: ChapterRenderParagraph | null = null;
    let paragraphIndex = 0;

    const ensureParagraph = () => {
        if (currentParagraph) return currentParagraph;
        const fallback: ChapterRenderParagraph = {
            key: `merged-default-${paragraphIndex++}`,
            marker: "p",
            sid: "",
            tokens: [],
        };
        paragraphs.push(fallback);
        currentParagraph = fallback;
        return fallback;
    };

    args.diffs
        .flatMap((diff) =>
            buildEntryRenderTokens({
                diff,
                viewType: args.viewType,
                hideWhitespaceOnly: args.hideWhitespaceOnly,
                showUsfmMarkers: args.showUsfmMarkers,
            }),
        )
        .forEach((tokenWithOwner) => {
            const token = tokenWithOwner.token;
            let paragraph: ChapterRenderParagraph;
            if (
                token.tokenType === UsfmTokenTypes.marker &&
                token.marker &&
                isValidParaMarker(token.marker)
            ) {
                paragraph = {
                    key: `${tokenWithOwner.entry.uniqueKey}-para-${paragraphIndex++}`,
                    marker: token.marker,
                    sid: token.sid,
                    tokens: [],
                };
                paragraphs.push(paragraph);
                currentParagraph = paragraph;
            } else {
                paragraph = ensureParagraph();
                if (!paragraph.sid) {
                    paragraph.sid = token.sid;
                }
            }

            paragraph.tokens.push(tokenWithOwner);
        });

    return paragraphs;
}
