import { describe, expect, it } from "vitest";
import {
    deriveVerseNumberForInsertionFromTokens,
    parseVerseNumberRange,
} from "@/app/domain/editor/utils/verseNumberHeuristics.ts";

describe("verseNumberHeuristics", () => {
    describe("parseVerseNumberRange", () => {
        it("parses a single verse", () => {
            expect(parseVerseNumberRange("13")).toEqual({ start: 13, end: 13 });
        });

        it("parses a hyphenated range", () => {
            expect(parseVerseNumberRange("12-13")).toEqual({
                start: 12,
                end: 13,
            });
        });

        it("parses an en-dash range", () => {
            expect(parseVerseNumberRange("12–13")).toEqual({
                start: 12,
                end: 13,
            });
        });
    });

    describe("deriveVerseNumberForInsertionFromTokens", () => {
        it("uses prev verse end + 1 when inserting at end", () => {
            const tokens = [
                { tokenType: "marker", marker: "v", text: "\\v" },
                { tokenType: "numberRange", text: "12-13" },
                { tokenType: "text", text: " some text" },
            ];
            expect(
                deriveVerseNumberForInsertionFromTokens({
                    tokens,
                    anchorIndex: 2,
                }),
            ).toBe("14");
        });

        it("uses next verse start - 1 (min 1) when inserting at beginning", () => {
            const tokens = [
                { tokenType: "text", text: "start" },
                { tokenType: "marker", marker: "v", text: "\\v" },
                { tokenType: "numberRange", text: "1" },
            ];
            expect(
                deriveVerseNumberForInsertionFromTokens({
                    tokens,
                    anchorIndex: 0,
                }),
            ).toBe("1");
        });

        it("uses prev verse end + 1 when between verses", () => {
            const tokens = [
                { tokenType: "marker", marker: "v", text: "\\v" },
                { tokenType: "numberRange", text: "3" },
                { tokenType: "text", text: " text" },
                { tokenType: "marker", marker: "v", text: "\\v" },
                { tokenType: "numberRange", text: "8" },
            ];
            expect(
                deriveVerseNumberForInsertionFromTokens({
                    tokens,
                    anchorIndex: 2,
                }),
            ).toBe("4");
        });

        it("falls back to 1 when no nearby verses exist", () => {
            const tokens = [{ tokenType: "text", text: "no verses" }];
            expect(
                deriveVerseNumberForInsertionFromTokens({
                    tokens,
                    anchorIndex: 0,
                }),
            ).toBe("1");
        });
    });
});
