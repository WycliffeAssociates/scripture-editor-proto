import { describe, expect, expectTypeOf, it } from "vitest";
import type { PackedTranslationNotesBook } from "@/core/library/stores/PackedTranslationNotesRepository.ts";
import {
    createPackedTranslationNotesBook,
    isPackedTranslationNotesReadable,
    normalizeTranslationNotesBookCode,
    readPackedTranslationNotesChapter,
    readPackedTranslationNotesVerse,
    type PackedTranslationNotesReadable,
} from "@/core/library/stores/PackedTranslationNotesRepository.ts";

describe("translation notes contracts", () => {
    it("normalizes packed per-book TN storage without raw markdown paths", () => {
        const packed = createPackedTranslationNotesBook({
            bookCode: " luk ",
            chapters: {
                " 22 ": {
                    " 71 ": '# Why do we still need a witness?\n\n"We have no further need for witnesses!"',
                    " 72 ": "Another note.",
                },
                "": {
                    "1": "ignored",
                },
            },
        });

        expect(packed).toEqual({
            bookCode: "LUK",
            chapters: {
                "22": {
                    "71": '# Why do we still need a witness?\n\n"We have no further need for witnesses!"',
                    "72": "Another note.",
                },
            },
        });
        expect(
            readPackedTranslationNotesChapter({
                book: packed,
                chapterNumber: 22,
            }),
        ).toEqual({
            "71": '# Why do we still need a witness?\n\n"We have no further need for witnesses!"',
            "72": "Another note.",
        });
        expect(
            readPackedTranslationNotesVerse({
                book: packed,
                chapterNumber: 22,
                verseNumber: 71,
            }),
        ).toBe('# Why do we still need a witness?\n\n"We have no further need for witnesses!"');
        expect(normalizeTranslationNotesBookCode(" luk ")).toBe("LUK");
        expectTypeOf(packed).toEqualTypeOf<PackedTranslationNotesBook>();
        expectTypeOf<keyof PackedTranslationNotesBook>().not.toMatchTypeOf<
            "relativePath"
        >();
        expectTypeOf<keyof PackedTranslationNotesBook>().not.toMatchTypeOf<
            "browsePath"
        >();
        expectTypeOf<keyof PackedTranslationNotesBook>().not.toMatchTypeOf<
            "documentId"
        >();
    });

    it("pins the TN-specific read capability to packed book access", async () => {
        const packed = createPackedTranslationNotesBook({
            bookCode: "luk",
            chapters: {
                "22": {
                    "71": "A note.",
                },
            },
        });

        const readable: PackedTranslationNotesReadable = {
            listTranslationNotesBookCodes: async () => ["LUK", "MAT"],
            readPackedTranslationNotesBook: async (bookCode) =>
                bookCode.toUpperCase() === packed.bookCode ? packed : null,
        };

        expectTypeOf<
            PackedTranslationNotesReadable["listTranslationNotesBookCodes"]
        >().parameters.toEqualTypeOf<[]>();
        expectTypeOf<
            PackedTranslationNotesReadable["readPackedTranslationNotesBook"]
        >().parameters.toEqualTypeOf<[bookCode: string]>();
        expectTypeOf<keyof PackedTranslationNotesReadable>().toEqualTypeOf<
            "listTranslationNotesBookCodes" | "readPackedTranslationNotesBook"
        >();
        expectTypeOf<keyof PackedTranslationNotesReadable>().not.toMatchTypeOf<
            "listDocuments"
        >();
        expectTypeOf<keyof PackedTranslationNotesReadable>().not.toMatchTypeOf<
            "readDocument"
        >();
        expect(isPackedTranslationNotesReadable(readable)).toBe(true);
        await expect(readable.listTranslationNotesBookCodes()).resolves.toEqual([
            "LUK",
            "MAT",
        ]);
        await expect(
            readable.readPackedTranslationNotesBook("LUK"),
        ).resolves.toEqual(packed);
        await expect(
            readable.readPackedTranslationNotesBook("JHN"),
        ).resolves.toBeNull();
    });
});
