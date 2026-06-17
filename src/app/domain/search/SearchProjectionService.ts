import type { SearchResult } from "@/app/domain/search/SearchService.ts";
import { sortListBySidCanonical } from "@/core/data/bible/bible.ts";

export type SortOption = "canonical" | "caseMismatch";

/**
 * Search execution produces raw result sets; this module reshapes them for UI use.
 * That includes deduping, ordering, and aligning target/reference result sets so
 * the search pane can render meaningful side-by-side comparisons.
 */
export function dedupeByVerse(items: SearchResult[]): SearchResult[] {
  const keyOf = (item: SearchResult) =>
    [item.source, item.bibleIdentifier, item.chapNum, item.sid].join("|");

  // First pass: tally how many occurrences each verse holds.
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // Second pass: keep the first occurrence per verse, stamped with the tally so
  // every row knows whether it has more than one match (drives the stepper).
  const seen = new Set<string>();
  const deduped: SearchResult[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...item, occurrenceCount: counts.get(key) ?? 1 });
  }

  return deduped;
}

export function buildPairKey(result: SearchResult): string {
  return [
    result.sid,
    result.sidOccurrenceIndex,
    result.bibleIdentifier,
    result.chapNum,
    result.naturalIndex,
  ].join("|");
}

export function applySort(
  items: SearchResult[],
  sortOption: SortOption,
): SearchResult[] {
  const copy = [...items];

  if (sortOption === "canonical") {
    sortListBySidCanonical(copy);
    return copy;
  }

  if (sortOption === "caseMismatch") {
    copy.sort((a, b) => {
      if (a.isCaseMismatch !== b.isCaseMismatch) {
        return a.isCaseMismatch ? -1 : 1;
      }
      return 0;
    });
    return copy;
  }

  return copy;
}

export function pairReferenceResultsToTarget(args: {
  referenceResults: SearchResult[];
  targetSidText: Map<string, string>;
}): SearchResult[] {
  return args.referenceResults.map((sourceResult) => ({
    ...sourceResult,
    text: args.targetSidText.get(sourceResult.sid) ?? "",
    isCaseMismatch: false,
    source: "target" as const,
  }));
}

export function alignTargetResultsToReferenceOrder(args: {
  referenceResults: SearchResult[];
  unsortedTargetResults: SearchResult[];
}): SearchResult[] {
  const targetByPairKey = new Map(
    args.unsortedTargetResults.map((result) => [buildPairKey(result), result]),
  );

  return args.referenceResults.flatMap((refResult) => {
    const pairedTarget = targetByPairKey.get(buildPairKey(refResult));
    return pairedTarget ? [pairedTarget] : [];
  });
}
