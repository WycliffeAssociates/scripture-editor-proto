import type {
  PackedTranslationNotesBook,
  TranslationNotesItem,
} from "@/core/library/LibraryItem.ts";

/**
 * Raw markdown note entry returned to the reference UI after it has narrowed to
 * Translation Notes.
 */
export type TranslationNoteEntry = {
  documentId: string;
  bookCode: string;
  chapterNumber: number;
  verseNumber: number;
  rawMarkdown: string;
};

type TranslationNoteAnchor = {
  bookCode: string;
  chapterNumber: number;
};

/**
 * Reads the note set needed by the reference pane for a single scripture
 * anchor. This is an app-facing adapter over the loaded TN noun/runtime seam.
 */
export async function loadTranslationNotesForAnchor(args: {
  resource: TranslationNotesItem;
  anchor: TranslationNoteAnchor;
}): Promise<TranslationNoteEntry[]> {
  const packedBook = await args.resource.readBook(
    args.anchor.bookCode.toUpperCase(),
  );
  if (!packedBook) {
    return [];
  }

  return loadPackedTranslationNotesForAnchor(packedBook, args.anchor);
}

async function loadPackedTranslationNotesForAnchor(
  packedBook: PackedTranslationNotesBook,
  anchor: TranslationNoteAnchor,
): Promise<TranslationNoteEntry[]> {
  const chapter = packedBook.chapters.find(
    (candidate) => candidate.chapterNumber === anchor.chapterNumber,
  );
  if (!chapter) {
    return [];
  }

  return [...chapter.verses]
    .map((verse) => ({
      documentId: `${packedBook.bookCode}:${anchor.chapterNumber}:${verse.verseNumber}`,
      bookCode: packedBook.bookCode,
      chapterNumber: anchor.chapterNumber,
      verseNumber: verse.verseNumber,
      rawMarkdown: verse.rawMarkdown,
    }))
    .sort((left, right) => left.verseNumber - right.verseNumber);
}
