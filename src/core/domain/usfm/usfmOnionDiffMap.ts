/**
 * Helpers for storing and reshaping chapter-keyed diff maps in the app layer.
 *
 * Compare/save/history flows frequently update one chapter at a time while the UI
 * often wants either a nested lookup map or a flattened list.
 */
export type DiffsByChapterMap<TDiff> = Record<string, Record<number, TDiff[]>>;

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
