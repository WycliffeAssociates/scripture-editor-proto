import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { walkChapters } from "@/app/domain/editor/utils/serializedTraversal.ts";
import { reduceSerializedNodesToText } from "@/app/domain/search/search.utils.ts";
import { type ParsedReference, parseSid } from "@/core/data/bible/bible.ts";
import { searchChapters } from "@/core/domain/search/searchEngine.ts";
import type {
    SearchChapter,
    SearchHit,
    SearchQuery,
} from "@/core/domain/search/types.ts";

export type SearchSource = "target" | "reference";

export type SearchResult = {
    sid: string;
    sidOccurrenceIndex: number;
    text: string;
    bibleIdentifier: string;
    chapNum: number;
    parsedSid: ParsedReference | null;
    isCaseMismatch: boolean;
    naturalIndex: number;
    source: SearchSource;
};

export type SearchContentProvider = {
    getTargetFiles: () => ParsedFile[];
    saveDirtyAndGetTargetFiles: () => ParsedFile[];
    getReferenceFiles: () => ParsedFile[];
};

export function chapterKey(bookCode: string, chapterNum: number): string {
    return `${bookCode}:${chapterNum}`;
}

export function listChapterKeys(files: ParsedFile[]): Set<string> {
    return new Set(
        files.flatMap((file) =>
            file.chapters.map((chapter) =>
                chapterKey(file.bookCode, chapter.chapNumber),
            ),
        ),
    );
}

export function buildSearchChapters(args: {
    files: ParsedFile[];
    searchUSFM: boolean;
    restrictToChapterKeys?: Set<string>;
}): SearchChapter[] {
    const out: SearchChapter[] = [];

    for (const { file, chapter } of walkChapters(args.files)) {
        if (args.restrictToChapterKeys) {
            const key = chapterKey(file.bookCode, chapter.chapNumber);
            if (!args.restrictToChapterKeys.has(key)) continue;
        }

        const sidRecord = reduceSerializedNodesToText(
            chapter.lexicalState.root.children,
            args.searchUSFM,
        );
        out.push({
            bookCode: file.bookCode,
            chapterNum: chapter.chapNumber,
            nodes: Object.entries(sidRecord).map(([sid, text]) => ({
                sid,
                text,
            })),
        });
    }

    return out;
}

export function buildTargetSidTextLookup(args: {
    files: ParsedFile[];
    searchUSFM: boolean;
}): Map<string, string> {
    const sidToText = new Map<string, string>();

    for (const { chapter } of walkChapters(args.files)) {
        const sidRecord = reduceSerializedNodesToText(
            chapter.lexicalState.root.children,
            args.searchUSFM,
        );
        for (const [sid, text] of Object.entries(sidRecord)) {
            sidToText.set(sid, text);
        }
    }

    return sidToText;
}

function toSearchResult(hit: SearchHit, source: SearchSource): SearchResult {
    return {
        sid: hit.sid,
        sidOccurrenceIndex: hit.sidOccurrenceIndex,
        text: hit.text,
        bibleIdentifier: hit.bookCode,
        chapNum: hit.chapterNum,
        parsedSid: parseSid(hit.sid),
        isCaseMismatch: hit.isCaseMismatch,
        naturalIndex: hit.naturalIndex,
        source,
    };
}

export function runSearch(args: {
    chapters: SearchChapter[];
    query: SearchQuery;
    source: SearchSource;
}): SearchResult[] {
    return searchChapters(args.chapters, args.query).map((hit) =>
        toSearchResult(hit, args.source),
    );
}

export function findChapter(
    files: ParsedFile[],
    ref: { bookCode: string; chapterNum: number },
): ParsedChapter | undefined {
    const file = files.find((item) => item.bookCode === ref.bookCode);
    return file?.chapters.find(
        (chapter) => chapter.chapNumber === ref.chapterNum,
    );
}
