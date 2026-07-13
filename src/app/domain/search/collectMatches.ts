// collectMatches.ts
//
// Turn a chapter's canonical tokens into token-anchored search matches.
// Matches resolve against the same store projection search reads, so a
// USFM-mode marker match (`\cl`) resolves like any other — the editor's
// rendered text-node tree is never consulted.

import { projectChapterTokens } from "@/app/domain/search/searchProjection.ts";
import type { SearchSource } from "@/app/domain/search/SearchService.ts";
import {
  matchHasGap,
  matchPaintRanges,
  resolveMatchAnchors,
} from "@/app/domain/search/tokenReplace.ts";
import type { SearchMatch } from "@/app/ui/hooks/search/searchTypes.ts";
import { findAllMatches } from "@/core/domain/search/searchEngine.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * Collect every match of `searchTerm` in one chapter, anchored to tokens. The
 * per-sid occurrence index matches `searchChapters`, so a `SearchMatch` and its
 * `SearchResult` agree on `(sid, sidOccurrenceIndex)`.
 */
export function collectChapterMatches(args: {
  tokens: readonly Token[];
  bookCode: string;
  chapterNum: number;
  searchUSFM: boolean;
  searchTerm: string;
  matchCase: boolean;
  matchWholeWord: boolean;
  source: SearchSource;
}): SearchMatch[] {
  if (!args.searchTerm.trim()) return [];
  const projection = projectChapterTokens({
    tokens: args.tokens,
    includeUSFM: args.searchUSFM,
  });

  const out: SearchMatch[] = [];
  for (const [sid, sidProjection] of projection) {
    const coveredIndices = new Set(
      sidProjection.segments.map((segment) => segment.tokenIndex),
    );
    const matches = findAllMatches({
      textToSearch: sidProjection.text,
      searchTerm: args.searchTerm,
      matchCase: args.matchCase,
      matchWholeWord: args.matchWholeWord,
    });
    matches.forEach((match, sidOccurrenceIndex) => {
      const anchors = resolveMatchAnchors(
        sidProjection,
        match.start,
        match.end,
      );
      if (!anchors) return;
      out.push({
        source: args.source,
        sid,
        sidOccurrenceIndex,
        bookCode: args.bookCode,
        chapterNum: args.chapterNum,
        ranges: matchPaintRanges(sidProjection, match.start, match.end),
        hasGap: matchHasGap({ tokens: args.tokens, anchors, coveredIndices }),
        matchedText: sidProjection.text.slice(match.start, match.end),
      });
    });
  }
  return out;
}
