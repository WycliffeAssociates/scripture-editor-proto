import { t } from "@lingui/core/macro";
import type {
    DiffsByChapter,
    ProjectDiff,
} from "@/app/domain/project/diffTypes.ts";
import { sortListBySidCanonical } from "@/core/data/bible/bible.ts";

/**
 * Build chapter picker options for the diff modal's structured view.
 *
 * This keeps the modal free of raw map-walking logic and ensures chapter options
 * are both filtered for visible changes and sorted in canonical scripture order.
 */
export type ChapterOption = {
    value: string;
    label: string;
    bookCode: string;
    chapterNum: number;
};

function chapterKey(bookCode: string, chapterNum: number) {
    return `${bookCode}:${chapterNum}`;
}

function hasVisibleChangesInChapter(args: {
    chapterDiffs: ProjectDiff[];
    hideWhitespaceOnly: boolean;
}) {
    return args.chapterDiffs.some(
        (diff) =>
            diff.status !== "unchanged" &&
            (!args.hideWhitespaceOnly || !diff.isWhitespaceChange),
    );
}

export function buildChapterOptions(args: {
    diffsByChapter: DiffsByChapter;
    hideWhitespaceOnly: boolean;
    formatBookLabel: (bookCode: string) => string;
}): ChapterOption[] {
    const options: Array<ChapterOption & { sid: string }> = [];

    for (const bookCode of Object.keys(args.diffsByChapter)) {
        const chapters = args.diffsByChapter[bookCode];
        for (const chapterNumKey of Object.keys(chapters)) {
            const chapterNum = Number(chapterNumKey);
            if (Number.isNaN(chapterNum)) continue;
            const chapterDiffs = chapters[chapterNum] ?? [];
            if (
                !hasVisibleChangesInChapter({
                    chapterDiffs,
                    hideWhitespaceOnly: args.hideWhitespaceOnly,
                })
            ) {
                continue;
            }
            const chapterLabel =
                chapterNum === 0 ? t`Introduction` : String(chapterNum);

            options.push({
                value: chapterKey(bookCode, chapterNum),
                label: `${args.formatBookLabel(bookCode)} ${chapterLabel}`,
                bookCode,
                chapterNum,
                sid: `${bookCode} ${chapterNum}:1`,
            });
        }
    }

    return sortListBySidCanonical(options).map(
        ({ sid: _sid, ...option }) => option,
    );
}
