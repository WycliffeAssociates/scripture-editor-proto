import type {
    MatchFormattingScope,
    SkippedMarkerSuggestion,
    VerseAnchorMatchStats,
} from "@/core/domain/usfm/matchFormattingByVerseAnchors.ts";

export type FormatMatchingRunReport = {
    generatedAt: string;
    scope: MatchFormattingScope;
    chaptersScanned: number;
    chaptersModified: number;
    booksModified: number;
    stats: VerseAnchorMatchStats;
    suggestions: SkippedMarkerSuggestion[];
};
