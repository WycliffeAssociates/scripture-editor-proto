import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";

/**
 * Small selectors and helpers for the mutable scripture workspace file array.
 *
 * Keeping these traversals here prevents save/history/search flows from each
 * rewriting the same "find chapter / list dirty refs" loops inline.
 */
export type ChapterRef = { bookCode: string; chapterNum: number };

export function chapterRefsForBook(file: ScriptureBookState): ChapterRef[] {
  return file.chapters.map((chapter) => ({
    bookCode: file.bookCode,
    chapterNum: chapter.chapterNumber,
  }));
}

export function allChapterRefs(files: ScriptureBookState[]): ChapterRef[] {
  return files.flatMap(chapterRefsForBook);
}

export function findChapter(
  files: ScriptureBookState[],
  bookCode: string,
  chapterNum: number,
): ScriptureChapterState | undefined {
  return files
    .find((file) => file.bookCode === bookCode)
    ?.chapters.find((chapter) => chapter.chapterNumber === chapterNum);
}

export function listDirtyChapterRefs(
  files: ScriptureBookState[],
): ChapterRef[] {
  const result: ChapterRef[] = [];
  for (const file of files) {
    for (const chapter of file.chapters) {
      if (!chapter.dirty) continue;
      result.push({
        bookCode: file.bookCode,
        chapterNum: chapter.chapterNumber,
      });
    }
  }
  return result;
}

export function getDirtyFiles(
  files: ScriptureBookState[],
): ScriptureBookState[] {
  return files.filter((file) => file.chapters.some((chapter) => chapter.dirty));
}

/**
 * Layer a set of replacement chapters (keyed by chapter number) over a book's
 * existing chapters: a replacement for an existing number overrides it, a new
 * number is inserted, and the result is sorted ascending. Pure — the caller
 * wraps the returned array in a fresh book object. Shared by the incoming-
 * overlay and dirty-buffer recovery flows, which both merge a known set of
 * chapters onto a base book in chapter order.
 */
export function mergeBookChapters(
  base: readonly ScriptureChapterState[],
  replacements: ReadonlyMap<number, ScriptureChapterState>,
): ScriptureChapterState[] {
  const byNum = new Map<number, ScriptureChapterState>(
    base.map((chapter) => [chapter.chapterNumber, chapter]),
  );
  for (const [chapterNum, chapter] of replacements) {
    byNum.set(chapterNum, chapter);
  }
  return [...byNum.values()].sort((a, b) => a.chapterNumber - b.chapterNumber);
}
