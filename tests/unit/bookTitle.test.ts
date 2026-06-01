import { describe, expect, it } from "vitest";
import { bookCodeToTitle } from "@/app/domain/project/bookTitle.ts";

const books = [
    { bookCode: "GEN", title: "Genesis" },
    { bookCode: "EXO", title: "Exodus" },
];

describe("bookCodeToTitle", () => {
    it("returns the matching book's title", () => {
        expect(bookCodeToTitle(books, { bookCode: "GEN" })).toBe("Genesis");
    });

    it("falls back to the code when no book matches (callers still get a label)", () => {
        expect(bookCodeToTitle(books, { bookCode: "LEV" })).toBe("LEV");
    });

    it("substitutes the title for the code inside a string (SID localization)", () => {
        expect(
            bookCodeToTitle(books, {
                bookCode: "GEN",
                replaceCodeInString: "GEN 1:1",
            }),
        ).toBe("Genesis 1:1");
    });

    it("leaves the string untouched when the code isn't found", () => {
        // No matching book → the code is returned, not the replace target.
        expect(
            bookCodeToTitle(books, {
                bookCode: "LEV",
                replaceCodeInString: "LEV 1:1",
            }),
        ).toBe("LEV");
    });
});
