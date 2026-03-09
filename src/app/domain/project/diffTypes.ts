import type { Change } from "diff";
import type { SerializedLexicalNode } from "lexical";
import type { DiffsByChapterMap } from "@/core/domain/usfm/usfmOnionDiffMap.ts";
import type {
    DiffTokenAlignment,
    DiffUndoSide,
} from "@/core/domain/usfm/usfmOnionTypes.ts";

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
