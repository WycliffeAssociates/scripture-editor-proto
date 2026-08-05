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
 * wraps the returned array in a fresh book object. Local to the incoming-
 * overlay flow: crash recovery no longer merges chapters on main, because the
 * host layers the backup into the corpus before main ever materializes it.
 */
function mergeBookChapters(
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

/**
 * Build the post-apply state by taking the LATEST store state and overlaying
 * only the affected chapters from a scratch draft. Untouched chapters alias
 * `latest`, so a concurrent commit to them is preserved; chapters/books the
 * scratch created (absent from `latest`) are folded in.
 */
export function overlayAffectedChapters(
  latest: ScriptureBookState[],
  scratch: ScriptureBookState[],
  affectedRefs: ChapterRef[],
): ScriptureBookState[] {
  const affectedByBook = new Map<string, Set<number>>();
  for (const ref of affectedRefs) {
    const set = affectedByBook.get(ref.bookCode) ?? new Set<number>();
    set.add(ref.chapterNum);
    affectedByBook.set(ref.bookCode, set);
  }
  const scratchByCode = new Map(scratch.map((book) => [book.bookCode, book]));
  const result = latest.map((book) => {
    const affectedNums = affectedByBook.get(book.bookCode);
    const scratchBook = scratchByCode.get(book.bookCode);
    if (!affectedNums || !scratchBook) return book;
    const scratchByNum = new Map(
      scratchBook.chapters.map((c) => [c.chapterNumber, c]),
    );
    // Replace only the affected chapters with their scratch versions; an
    // affected chapter absent from the scratch keeps its latest version.
    const replacements = new Map<number, ScriptureChapterState>();
    for (const num of affectedNums) {
      const chapter = scratchByNum.get(num);
      if (chapter) replacements.set(num, chapter);
    }
    return {
      ...book,
      chapters: mergeBookChapters(book.chapters, replacements),
    };
  });
  // Books that exist only in the scratch (newly created by the apply).
  const latestCodes = new Set(latest.map((book) => book.bookCode));
  for (const bookCode of affectedByBook.keys()) {
    if (latestCodes.has(bookCode)) continue;
    const scratchBook = scratchByCode.get(bookCode);
    if (scratchBook) result.push(scratchBook);
  }
  return result;
}
