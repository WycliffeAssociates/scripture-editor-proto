import type {
    SearchChapter,
    SearchHit,
    SearchQuery,
} from "@/core/domain/search/types.ts";

export function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSearchRegex(query: SearchQuery): RegExp {
    const escapedTerm = escapeRegex(query.term);
    const pattern = query.wholeWord ? `\\b${escapedTerm}\\b` : escapedTerm;
    const flags = query.matchCase ? "g" : "gi";
    return new RegExp(pattern, flags);
}

export function findAllMatches(args: {
    textToSearch: string;
    searchTerm: string;
    matchCase: boolean;
    matchWholeWord: boolean;
}): Array<{ start: number; end: number; matchedTerm: string }> {
    const { textToSearch, searchTerm, matchCase, matchWholeWord } = args;
    if (!searchTerm) return [];

    const regex = buildSearchRegex({
        term: searchTerm,
        matchCase,
        wholeWord: matchWholeWord,
    });
    const matches: Array<{ start: number; end: number; matchedTerm: string }> =
        [];

    let match: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: intentional assignment in condition
    while ((match = regex.exec(textToSearch)) !== null) {
        matches.push({
            start: match.index,
            end: match.index + match[0].length,
            matchedTerm: match[0],
        });
    }

    return matches;
}

export function findMatch(args: {
    textToSearch: string;
    searchTerm: string;
    matchCase: boolean;
    matchWholeWord: boolean;
}): { isMatch: boolean; matchedTerm: string | null } {
    const { textToSearch, searchTerm, matchCase, matchWholeWord } = args;
    if (!searchTerm) {
        return { isMatch: false, matchedTerm: null };
    }

    const regex = buildSearchRegex({
        term: searchTerm,
        matchCase,
        wholeWord: matchWholeWord,
    });
    const result = regex.exec(textToSearch);

    if (!result) {
        return { isMatch: false, matchedTerm: null };
    }

    return { isMatch: true, matchedTerm: result[0] };
}

export function searchChapters(
    chapters: SearchChapter[],
    query: SearchQuery,
): SearchHit[] {
    if (!query.term.trim()) return [];

    const hits: SearchHit[] = [];
    let naturalIndex = 0;

    for (const chapter of chapters) {
        for (const node of chapter.nodes) {
            const matches = findAllMatches({
                textToSearch: node.text,
                searchTerm: query.term,
                matchCase: query.matchCase,
                matchWholeWord: query.wholeWord,
            });

            for (
                let sidOccurrenceIndex = 0;
                sidOccurrenceIndex < matches.length;
                sidOccurrenceIndex++
            ) {
                const match = matches[sidOccurrenceIndex];
                hits.push({
                    sid: node.sid,
                    sidOccurrenceIndex,
                    bookCode: chapter.bookCode,
                    chapterNum: chapter.chapterNum,
                    text: node.text,
                    isCaseMismatch: query.term !== match.matchedTerm,
                    naturalIndex,
                });
                naturalIndex += 1;
            }
        }
    }

    return hits;
}
