import type {
  MatchFormattingScope,
  SkippedMarkerSuggestion,
  VerseAnchorMatchStats,
} from "@/core/domain/usfm/matchFormattingByVerseAnchors.ts";

/**
 * UI-facing summary of one formatting-match run.
 *
 * The underlying formatter works in token space. This report is the reduced
 * payload the workspace UI needs in order to show counts, skipped suggestions,
 * and whether the review panel should open.
 */
export type FormatMatchingRunReport = {
  generatedAt: string;
  scope: MatchFormattingScope;
  chaptersScanned: number;
  chaptersModified: number;
  booksModified: number;
  stats: VerseAnchorMatchStats;
  suggestions: SkippedMarkerSuggestion[];
};
