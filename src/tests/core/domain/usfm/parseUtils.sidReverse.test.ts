import { describe, expect, it } from "vitest";
import { makeSid } from "@/core/data/bible/bible.ts";
import { webUsfmOnionService } from "@/web/domain/usfm/WebUsfmOnionService.ts";

function findFirstMarkerSid(
    tokens: Array<{
        marker: string | null;
        sid: string | null;
        text: string;
    }>,
    marker: string,
) {
    return tokens.find((t) => t.marker === marker && t.text.startsWith("\\"))
        ?.sid;
}

function findMarkerSids(
    tokens: Array<{
        marker: string | null;
        sid: string | null;
        text: string;
    }>,
    marker: string,
) {
    return tokens
        .filter((t) => t.marker === marker && t.text.startsWith("\\"))
        .map((t) => t.sid);
}

describe("mutAddSids (via prepareTokens)", () => {
    it("attributes markers between verses to the previous verse (e.g. \\q before \\v 2 => 1)", async () => {
        const usfm = `\\id GEN
\\c 8
\\p
\\v 1 Verse one.
\\q
\\v 2 Verse two.`;

        const { tokens } = await webUsfmOnionService.projectUsfm(usfm);

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

        // The \\q before \\v 2 should belong to verse 1.
        expect(findFirstMarkerSid(tokens, "q")).toBe(
            makeSid({ bookId: "GEN", chapter: 8, verseStart: 1, verseEnd: 1 }),
        );
    });

    it("attributes paragraph markers before a later verse to the current verse (e.g. \\p before \\v 24 but after \\v 23 => 23)", async () => {
        const usfm = `\\id GEN
\\c 2
\\v 23 The man said,
\\q1 "This time, this one is bone of my bones"

\\p
\\v 24 Therefore a man will leave his father and his mother.`;

        const { tokens } = await webUsfmOnionService.projectUsfm(usfm);

        // \\p appears between verses and should attach to the previous verse.
        expect(findFirstMarkerSid(tokens, "p")).toBe(
            makeSid({
                bookId: "GEN",
                chapter: 2,
                verseStart: 23,
                verseEnd: 23,
            }),
        );
    });

    it("mangles repeated verse numbers within a chapter (e.g. second \\v 1 => 1_dup_1)", async () => {
        const usfm = `\\id GEN
\\c 1
\\v 1 First.
\\v 2 Second.
\\v 1 Duplicate one.`;

        const { tokens } = await webUsfmOnionService.projectUsfm(usfm);
        const vMarkerSids = findMarkerSids(tokens, "v");

        expect(vMarkerSids).toEqual([
            makeSid({ bookId: "GEN", chapter: 1, verseStart: 1, verseEnd: 1 }),
            makeSid({ bookId: "GEN", chapter: 1, verseStart: 2, verseEnd: 2 }),
            `${makeSid({
                bookId: "GEN",
                chapter: 1,
                verseStart: 1,
                verseEnd: 1,
            })}_dup_1`,
        ]);
    });
});
