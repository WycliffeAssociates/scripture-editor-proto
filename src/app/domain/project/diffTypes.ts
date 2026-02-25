import type { Change } from "diff";
import type { SerializedLexicalNode } from "lexical";
import type { DiffsByChapterMap } from "@/core/domain/usfm/chapterDiffOperation.ts";

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
};

export type DiffsByChapter = DiffsByChapterMap<ProjectDiff>;
