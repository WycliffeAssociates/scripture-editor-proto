import type {
    SearchResult,
    SearchSource,
} from "@/app/domain/search/SearchService.ts";
import type { MatchInNode } from "@/app/ui/hooks/useSearchHighlighter.ts";

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
