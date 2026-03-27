import type { Change } from "diff";
import type { SerializedLexicalNode } from "lexical";
import type { DiffsByChapterMap } from "@/core/domain/usfm/usfmOnionDiffMap.ts";
import type {
    DiffTokenAlignment,
    DiffUndoSide,
} from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * UI-facing diff types for scripture save/compare flows.
 *
 * The core USFM diff engine returns token-oriented data. These types represent
 * the richer shape the React UI needs for modal rendering, chapter grouping, and
 * apply/revert actions.
 */
export type ChapterRenderToken = {
    node: SerializedLexicalNode;
    sid: string;
    tokenType?: string;
    marker?: string;
};

export type ProjectDiff = {
    uniqueKey: string;
    semanticSid: string;
    status: "added" | "deleted" | "modified" | "unchanged";
    originalDisplayText: string;
    currentDisplayText: string;
    originalTextOnly?: string;
    currentTextOnly?: string;
    wordDiff?: Change[];
    bookCode: string;
    chapterNum: number;
    isWhitespaceChange?: boolean;
    isUsfmStructureChange?: boolean;
    originalRenderTokens?: ChapterRenderToken[];
    currentRenderTokens?: ChapterRenderToken[];
    originalAlignment?: DiffTokenAlignment[];
    currentAlignment?: DiffTokenAlignment[];
    undoSide?: DiffUndoSide;
};

export type DiffsByChapter = DiffsByChapterMap<ProjectDiff>;
