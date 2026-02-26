import { diffArrays } from "diff";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { isSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import type {
    ChapterRenderToken,
    ProjectDiff,
} from "@/app/domain/project/diffTypes.ts";
import { isValidParaMarker } from "@/core/data/usfm/tokens.ts";

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
    tokenChange: "unchanged" | "added" | "deleted" | "modified" | "paired";
    counterpartToken?: ChapterRenderToken;
};

export type ChapterRenderParagraph = {
    key: string;
    marker: string;
    sid: string;
    tokens: ChapterTokenWithOwner[];
};

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

function tokenComparableKey(token: ChapterRenderToken): string {
    if (token.node.type === "linebreak") return "linebreak";
    if (isSerializedUSFMTextNode(token.node)) {
        return [
            token.node.type,
            token.node.tokenType ?? "",
            token.node.marker ?? "",
            token.node.text ?? "",
        ].join("|");
    }
    return `${token.node.type}|${token.tokenType ?? ""}|${token.marker ?? ""}`;
}

function canPairAsModified(
    originalToken: ChapterRenderToken,
    currentToken: ChapterRenderToken,
): boolean {
    if (originalToken.node.type === "linebreak") return false;
    if (currentToken.node.type === "linebreak") return false;
    if (
        !isSerializedUSFMTextNode(originalToken.node) ||
        !isSerializedUSFMTextNode(currentToken.node)
    ) {
        return false;
    }
    return (
        originalToken.node.tokenType === currentToken.node.tokenType &&
        (originalToken.node.marker ?? "") === (currentToken.node.marker ?? "")
    );
}

type AlignedTokenInfo = {
    token: ChapterRenderToken;
    originalIndex: number;
    currentIndex: number;
    tokenChange: "unchanged" | "added" | "deleted" | "modified" | "paired";
    counterpartToken?: ChapterRenderToken;
};

function alignEntryTokens(args: {
    originalTokens: ChapterRenderToken[];
    currentTokens: ChapterRenderToken[];
}): {
    original: AlignedTokenInfo[];
    current: AlignedTokenInfo[];
} {
    const originalOut: AlignedTokenInfo[] = [];
    const currentOut: AlignedTokenInfo[] = [];

    const originalKeys = args.originalTokens.map(tokenComparableKey);
    const currentKeys = args.currentTokens.map(tokenComparableKey);
    const seq = diffArrays(originalKeys, currentKeys);

    let originalCursor = 0;
    let currentCursor = 0;

    for (let i = 0; i < seq.length; i++) {
        const part = seq[i];
        if (!part) continue;

        if (!part.added && !part.removed) {
            for (let j = 0; j < part.value.length; j++) {
                const originalToken = args.originalTokens[originalCursor + j];
                const currentToken = args.currentTokens[currentCursor + j];
                if (!originalToken || !currentToken) continue;
                originalOut.push({
                    token: originalToken,
                    originalIndex: originalCursor + j,
                    currentIndex: currentCursor + j,
                    tokenChange: "unchanged",
                    counterpartToken: currentToken,
                });
                currentOut.push({
                    token: currentToken,
                    originalIndex: originalCursor + j,
                    currentIndex: currentCursor + j,
                    tokenChange: "unchanged",
                    counterpartToken: originalToken,
                });
            }
            originalCursor += part.value.length;
            currentCursor += part.value.length;
            continue;
        }

        if (part.removed) {
            const next = seq[i + 1];
            if (next?.added) {
                const canSafePair =
                    part.value.length === 1 &&
                    next.value.length === 1 &&
                    (() => {
                        const originalToken =
                            args.originalTokens[originalCursor];
                        const currentToken = args.currentTokens[currentCursor];
                        if (!originalToken || !currentToken) return false;
                        return canPairAsModified(originalToken, currentToken);
                    })();

                if (canSafePair) {
                    const originalToken = args.originalTokens[originalCursor];
                    const currentToken = args.currentTokens[currentCursor];
                    if (originalToken && currentToken) {
                        originalOut.push({
                            token: originalToken,
                            originalIndex: originalCursor,
                            currentIndex: currentCursor,
                            tokenChange: "modified",
                            counterpartToken: currentToken,
                        });
                        currentOut.push({
                            token: currentToken,
                            originalIndex: originalCursor,
                            currentIndex: currentCursor,
                            tokenChange: "modified",
                            counterpartToken: originalToken,
                        });
                    }
                } else {
                    for (let j = 0; j < part.value.length; j++) {
                        const originalToken =
                            args.originalTokens[originalCursor + j];
                        if (!originalToken) continue;
                        originalOut.push({
                            token: originalToken,
                            originalIndex: originalCursor + j,
                            currentIndex: -1,
                            tokenChange: "deleted",
                        });
                    }
                    for (let j = 0; j < next.value.length; j++) {
                        const currentToken =
                            args.currentTokens[currentCursor + j];
                        if (!currentToken) continue;
                        currentOut.push({
                            token: currentToken,
                            originalIndex: -1,
                            currentIndex: currentCursor + j,
                            tokenChange: "added",
                        });
                    }
                }
                originalCursor += part.value.length;
                currentCursor += next.value.length;
                i += 1;
                continue;
            }

            for (let j = 0; j < part.value.length; j++) {
                const originalToken = args.originalTokens[originalCursor + j];
                if (!originalToken) continue;
                originalOut.push({
                    token: originalToken,
                    originalIndex: originalCursor + j,
                    currentIndex: -1,
                    tokenChange: "deleted",
                });
            }
            originalCursor += part.value.length;
            continue;
        }

        if (part.added) {
            for (let j = 0; j < part.value.length; j++) {
                const currentToken = args.currentTokens[currentCursor + j];
                if (!currentToken) continue;
                currentOut.push({
                    token: currentToken,
                    originalIndex: -1,
                    currentIndex: currentCursor + j,
                    tokenChange: "added",
                });
            }
            currentCursor += part.value.length;
        }
    }

    return { original: originalOut, current: currentOut };
}

export function buildChapterRenderParagraphs(args: {
    diffs: ProjectDiff[];
    viewType: "original" | "current";
    hideWhitespaceOnly?: boolean;
    showUsfmMarkers?: boolean;
}): ChapterRenderParagraph[] {
    const entries = toChapterViewEntries(args.diffs, {
        hideWhitespaceOnly: args.hideWhitespaceOnly,
        showUsfmMarkers: args.showUsfmMarkers,
    });
    const diffByKey = new Map(args.diffs.map((diff) => [diff.uniqueKey, diff]));

    const paragraphs: ChapterRenderParagraph[] = [];
    let currentParagraph: ChapterRenderParagraph | null = null;
    let paragraphIndex = 0;

    const ensureParagraph = () => {
        if (currentParagraph) return currentParagraph;
        const fallback: ChapterRenderParagraph = {
            key: `default-para-${paragraphIndex++}`,
            marker: "p",
            sid: "",
            tokens: [],
        };
        paragraphs.push(fallback);
        currentParagraph = fallback;
        return fallback;
    };

    entries.forEach((entry) => {
        const backingDiff = diffByKey.get(entry.uniqueKey);
        const aligned = alignEntryTokens({
            originalTokens: backingDiff?.originalRenderTokens ?? [],
            currentTokens: backingDiff?.currentRenderTokens ?? [],
        });
        const entryTokens =
            args.viewType === "original" ? aligned.original : aligned.current;

        entryTokens.forEach((tokenInfo) => {
            const token = tokenInfo.token;
            const tokenIndex =
                args.viewType === "original"
                    ? tokenInfo.originalIndex
                    : tokenInfo.currentIndex;
            let paragraph = ensureParagraph();
            if (
                token.tokenType === UsfmTokenTypes.marker &&
                token.marker &&
                isValidParaMarker(token.marker)
            ) {
                paragraph = {
                    key: `para-${paragraphIndex++}`,
                    marker: token.marker,
                    sid: token.sid,
                    tokens: [],
                };
                paragraphs.push(paragraph);
                currentParagraph = paragraph;
            }

            paragraph.tokens.push({
                key: tokenKey(token, `${entry.uniqueKey}-${tokenIndex}`),
                token,
                entry,
                isFirstTokenOfEntry: tokenIndex === 0,
                entryTokenIndex: tokenIndex,
                tokenChange: tokenInfo.tokenChange,
                counterpartToken: tokenInfo.counterpartToken,
            });
        });
    });

    return paragraphs;
}
