import { describe, expect, it } from "vitest";
import { makeSid } from "@/core/data/bible/bible.ts";
import { lexUsfm, TokenMap } from "@/core/domain/usfm/lex.ts";
import { prepareTokens } from "@/core/domain/usfm/parseUtils.ts";

function findFirstMarkerSid(
    tokens: Array<{ tokenType: string; marker?: string; sid?: string }>,
    marker: string,
) {
    return tokens.find(
        (t) => t.tokenType === TokenMap.marker && t.marker === marker,
    )?.sid;
}

describe("computeSidsReverse (via prepareTokens)", () => {
    it("attributes markers between verses to the following verse (e.g. \\q before \\v 2 => 2)", () => {
        const usfm = `\\id GEN
\\c 8
\\p
\\v 1 Verse one.
\\q
\\v 2 Verse two.`;

        const { tokens } = prepareTokens(usfm, lexUsfm, "GEN");

        // Intro material (before first \\c) => 0:0
        expect(findFirstMarkerSid(tokens, "id")).toBe(
            makeSid({ bookId: "GEN", chapter: 0, verseStart: 0, verseEnd: 0 }),
        );

        // Chapter-start markers before \\v 1 => chapter :0
        expect(findFirstMarkerSid(tokens, "c")).toBe(
            makeSid({ bookId: "GEN", chapter: 8, verseStart: 0, verseEnd: 0 }),
        );
        expect(findFirstMarkerSid(tokens, "p")).toBe(
            makeSid({ bookId: "GEN", chapter: 8, verseStart: 0, verseEnd: 0 }),
        );

        // The \\q before \\v 2 should belong to verse 2.
        expect(findFirstMarkerSid(tokens, "q")).toBe(
            makeSid({ bookId: "GEN", chapter: 8, verseStart: 2, verseEnd: 2 }),
        );
    });

    it("attributes paragraph markers before a later verse to that later verse (e.g. \\p before \\v 24 => 24)", () => {
        const usfm = `\\id GEN
\\c 2
\\v 23 The man said,
\\q1 "This time, this one is bone of my bones"

\\p
\\v 24 Therefore a man will leave his father and his mother.`;

        const { tokens } = prepareTokens(usfm, lexUsfm, "GEN");

        // There is no chapter-start paragraph marker here; \\p should attach to verse 24.
        expect(findFirstMarkerSid(tokens, "p")).toBe(
            makeSid({
                bookId: "GEN",
                chapter: 2,
                verseStart: 24,
                verseEnd: 24,
            }),
        );
    });
});
