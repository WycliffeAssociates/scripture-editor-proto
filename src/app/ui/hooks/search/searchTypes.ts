import type {
    SearchResult,
    SearchSource,
} from "@/app/domain/search/SearchService.ts";
import type { MatchInNode } from "@/app/ui/hooks/useSearchHighlighter.ts";

/**
 * Search hook payloads layered on top of the lower-level search service.
 *
 * The domain search service returns chapter/result matches. These UI types add
 * editor-node and highlight bookkeeping needed for navigation and replace flows.
 */
export type SearchMatch = MatchInNode & {
    source: SearchSource;
    sid?: string;
    sidOccurrenceIndex?: number;
};

export type SearchRunResult = {
    sortedResults: SearchResult[];
    searchMatches: SearchMatch[];
};

export type SearchRunScope = "project" | "currentChapter";

export type SearchRunOptionOverrides = {
    matchCase?: boolean;
    matchWholeWord?: boolean;
    searchUSFM?: boolean;
    searchReference?: boolean;
};
