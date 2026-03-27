import type { LibraryItemBase } from "@/core/library/items/UsfmScriptureItem.ts";

/**
 * Packed per-book Translation Notes payload used at runtime.
 *
 * Translation Notes are stored and loaded as raw markdown grouped by book and
 * chapter so the UI can render notes without materializing tens of thousands of
 * tiny files.
 */
export type PackedTranslationNotesBook = {
    bookCode: string;
    chapters: readonly PackedTranslationNotesChapter[];
};

export type PackedTranslationNotesChapter = {
    chapterNumber: number;
    verses: readonly PackedTranslationNotesVerse[];
};

export type PackedTranslationNotesVerse = {
    verseNumber: number;
    rawMarkdown: string;
};

/**
 * The Translation Notes noun returned by loaders.
 *
 * UI that narrows to `type === "translationNotes"` can use book/chapter verbs
 * directly and render raw markdown rather than treating TN as a generic
 * document collection.
 */
export type TranslationNotesItem = LibraryItemBase & {
    type: "translationNotes";
    listBookCodes(): Promise<readonly string[]>;
    readBook(bookCode: string): Promise<PackedTranslationNotesBook | null>;
    readChapter(
        bookCode: string,
        chapterNumber: number,
    ): Promise<Record<string, string> | null>;
};
