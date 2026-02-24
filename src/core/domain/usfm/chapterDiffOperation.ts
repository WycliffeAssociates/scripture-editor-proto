import { diffSidBlocks, type SidBlockDiff } from "./sidBlockDiff.ts";
import { type BuildSidBlocksOptions, buildSidBlocks } from "./sidBlocks.ts";

export type ChapterTokenDiff<T extends object> = SidBlockDiff & {
    originalTokens: T[];
    currentTokens: T[];
};

export type DiffsByChapterMap<TDiff> = Record<string, Record<number, TDiff[]>>;

export function diffChapterTokenStreams<T extends object>({
    baselineTokens,
    currentTokens,
    buildOptions,
}: {
    baselineTokens: T[];
    currentTokens: T[];
    buildOptions?: BuildSidBlocksOptions<T>;
}): ChapterTokenDiff<T>[] {
    const baselineBlocks = buildSidBlocks(baselineTokens, buildOptions);
    const currentBlocks = buildSidBlocks(currentTokens, buildOptions);
    const diffs = diffSidBlocks(baselineBlocks, currentBlocks);

    return diffs.map((diff) => {
        const originalTokens = diff.original
            ? baselineTokens.slice(
                  diff.original.start,
                  diff.original.endExclusive,
              )
            : [];
        const currentTokensSlice = diff.current
            ? currentTokens.slice(diff.current.start, diff.current.endExclusive)
            : [];

        return {
            ...diff,
            originalTokens,
            currentTokens: currentTokensSlice,
        };
    });
}

export function replaceChapterDiffsInMap<TDiff>({
    previousMap,
    bookCode,
    chapterNum,
    chapterDiffs,
}: {
    previousMap: DiffsByChapterMap<TDiff>;
    bookCode: string;
    chapterNum: number;
    chapterDiffs: TDiff[];
}): DiffsByChapterMap<TDiff> {
    const next = { ...previousMap };
    const book = { ...(next[bookCode] ?? {}) };

    if (chapterDiffs.length === 0) {
        delete book[chapterNum];
    } else {
        book[chapterNum] = chapterDiffs;
    }

    if (Object.keys(book).length === 0) {
        delete next[bookCode];
    } else {
        next[bookCode] = book;
    }

    return next;
}

export function replaceManyChapterDiffsInMap<TDiff>({
    previousMap,
    chapterDiffs,
}: {
    previousMap: DiffsByChapterMap<TDiff>;
    chapterDiffs: Array<{
        bookCode: string;
        chapterNum: number;
        diffs: TDiff[];
    }>;
}): DiffsByChapterMap<TDiff> {
    let next = previousMap;

    for (const chapter of chapterDiffs) {
        next = replaceChapterDiffsInMap({
            previousMap: next,
            bookCode: chapter.bookCode,
            chapterNum: chapter.chapterNum,
            chapterDiffs: chapter.diffs,
        });
    }

    return next;
}

export function flattenDiffMap<TDiff>({
    diffsByChapter,
    include,
}: {
    diffsByChapter: DiffsByChapterMap<TDiff>;
    include?: (diff: TDiff) => boolean;
}): TDiff[] {
    const out: TDiff[] = [];

    for (const chapters of Object.values(diffsByChapter)) {
        for (const diffs of Object.values(chapters)) {
            out.push(...(include ? diffs.filter(include) : diffs));
        }
    }

    return out;
}
