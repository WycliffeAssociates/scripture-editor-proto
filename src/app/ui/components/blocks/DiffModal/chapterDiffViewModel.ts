import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { isSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import type {
    ChapterRenderToken,
    ProjectDiff,
} from "@/app/ui/hooks/useSave.tsx";
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
        const entryTokens =
            args.viewType === "original"
                ? (backingDiff?.originalRenderTokens ?? [])
                : (backingDiff?.currentRenderTokens ?? []);

        entryTokens.forEach((token, tokenIndex) => {
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
            });
        });
    });

    return paragraphs;
}
