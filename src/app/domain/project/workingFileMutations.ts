import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";

export type ChapterRef = { bookCode: string; chapterNum: number };

export function findChapter(
    files: ParsedFile[],
    bookCode: string,
    chapterNum: number,
): ParsedChapter | undefined {
    return files
        .find((file) => file.bookCode === bookCode)
        ?.chapters.find((chapter) => chapter.chapNumber === chapterNum);
}

export function listDirtyChapterRefs(files: ParsedFile[]): ChapterRef[] {
    const result: ChapterRef[] = [];
    for (const file of files) {
        for (const chapter of file.chapters) {
            if (!chapter.dirty) continue;
            result.push({
                bookCode: file.bookCode,
                chapterNum: chapter.chapNumber,
            });
        }
    }
    return result;
}

export function getAllChapterRefs(files: ParsedFile[]): ChapterRef[] {
    return files.flatMap((file) =>
        file.chapters.map((chapter) => ({
            bookCode: file.bookCode,
            chapterNum: chapter.chapNumber,
        })),
    );
}

export function getDirtyFiles(files: ParsedFile[]): ParsedFile[] {
    return files.filter((file) =>
        file.chapters.some((chapter) => chapter.dirty),
    );
}

export function hasUnsavedChanges(files: ParsedFile[]): boolean {
    return files.some((file) => file.chapters.some((chapter) => chapter.dirty));
}
