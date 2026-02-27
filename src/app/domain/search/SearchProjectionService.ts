import type { SearchResult } from "@/app/domain/search/SearchService.ts";
import { sortListBySidCanonical } from "@/core/data/bible/bible.ts";

export type SortOption = "canonical" | "caseMismatch";

export function dedupeByVerse(items: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    const deduped: SearchResult[] = [];

    for (const item of items) {
        const key = [
            item.source,
            item.bibleIdentifier,
            item.chapNum,
            item.sid,
        ].join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(item);
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
        args.unsortedTargetResults.map((result) => [
            buildPairKey(result),
            result,
        ]),
    );

    return args.referenceResults.flatMap((refResult) => {
        const pairedTarget = targetByPairKey.get(buildPairKey(refResult));
        return pairedTarget ? [pairedTarget] : [];
    });
}
