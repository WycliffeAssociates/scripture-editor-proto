import type {
  SearchResult,
  SearchSource,
} from "@/app/domain/search/SearchService.ts";
import type { TokenPaintRange } from "@/app/domain/search/tokenReplace.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";

/**
 * Search hook payloads layered on top of the lower-level search service.
 *
 * The domain search service returns chapter/result matches. These UI types add
 * the token-anchored bookkeeping the editor needs to paint, scroll to, and
 * replace a match — resolved against the canonical token store, not the live
 * Lexical node tree (so USFM-mode marker matches resolve like any other).
 */

export type { TokenPaintRange };

/**
 * A resolved search match, anchored to tokens rather than a Lexical node.
 *
 * `ranges` are the text-like paint ranges (a marker token match in USFM mode
 * paints across its own literal source). `hasGap` marks a match that crosses
 * hidden inline markup and is find-only in regular mode (see `matchHasGap`).
 */
export type SearchMatch = {
  source: SearchSource;
  sid: string;
  sidOccurrenceIndex: number;
  bookCode: string;
  chapterNum: number;
  ranges: TokenPaintRange[];
  hasGap: boolean;
  /** The matched substring (from the projection), for inline affordance labels. */
  matchedText: string;
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
  referenceFiles?: ScriptureBookState[];
};

/**
 * Options for collecting a chapter's matches: per-run overrides layered over
 * the base toggles, plus the resolved USFM-projection flag.
 */
export type CollectMatchOptions = SearchRunOptionOverrides & {
  baseMatchCase: boolean;
  baseMatchWholeWord: boolean;
  searchUSFM: boolean;
};
