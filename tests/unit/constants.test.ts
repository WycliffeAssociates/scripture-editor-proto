import { describe, expect, it } from "vitest";
import { TEST_ID_GENERATORS } from "@/app/data/constants.ts";

describe("TEST_ID_GENERATORS", () => {
    describe("projectListItem", () => {
        it("should generate test ID for project list item", () => {
            const result = TEST_ID_GENERATORS.projectListItem("My Project");
            expect(result).toBe("project-list-item-my-project");
        });

        it("should handle multiple spaces", () => {
            const result =
                TEST_ID_GENERATORS.projectListItem("My  Test  Project");
            expect(result).toBe("project-list-item-my-test-project");
        });

        it("should lowercase the input", () => {
            const result = TEST_ID_GENERATORS.projectListItem("MY PROJECT");
            expect(result).toBe("project-list-item-my-project");
        });
    });

    describe("bookChapterBtn", () => {
        it("should generate test ID for book chapter button", () => {
            const result = TEST_ID_GENERATORS.bookChapterBtn("MAT", 1);
            expect(result).toBe("book-control-mat-1");
        });

        it("should handle uppercase book codes", () => {
            const result = TEST_ID_GENERATORS.bookChapterBtn("MAT", 5);
            expect(result).toBe("book-control-mat-5");
        });
    });

    describe("projectListGroup", () => {
        it("should generate test ID for project list group", () => {
            const result = TEST_ID_GENERATORS.projectListGroup("English");
            expect(result).toBe("project-list-english");
        });

        it("should lowercase the language name", () => {
            const result = TEST_ID_GENERATORS.projectListGroup("ENGLISH");
            expect(result).toBe("project-list-english");
        });
    });

    describe("bookChapterPanel", () => {
        it("should generate test ID for book chapter panel", () => {
            const result = TEST_ID_GENERATORS.bookChapterPanel("MAT");
            expect(result).toBe("book-mat-chapters");
        });

        it("should lowercase the book code", () => {
            const result = TEST_ID_GENERATORS.bookChapterPanel("MAT");
            expect(result).toBe("book-mat-chapters");
        });
    });

    describe("diffCurrentPre", () => {
        it("should generate test ID for diff current pre with original view", () => {
            const result = TEST_ID_GENERATORS.diffCurrentPre("original");
            expect(result).toBe("save-diff-current-pre-original");
        });

        it("should generate test ID for diff current pre with current view", () => {
            const result = TEST_ID_GENERATORS.diffCurrentPre("current");
            expect(result).toBe("save-diff-current-pre-current");
        });
    });
});
