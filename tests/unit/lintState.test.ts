import { describe, expect, it } from "vitest";
import {
    areLintIssueListsEqual,
    buildLintMessagesByBook,
    flattenLintMessagesByBook,
    replaceLintErrorsForBook,
    replaceLintErrorsForChapter,
} from "@/app/ui/hooks/lintState.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

function makeError(overrides: Partial<LintIssue>): LintIssue {
    return {
        message: "msg",
        code: "unknown-token",
        severity: "warning",
        marker: null,
        messageParams: {},
        sid: "GEN 1:1",
        tokenId: "n1",
        relatedTokenId: null,
        span: { start: 0, end: 1 },
        relatedSpan: null,
        fix: null,
        ...overrides,
    };
}

describe("lint state replacement", () => {
    it("replaces all errors for a book atomically", () => {
        const prev = buildLintMessagesByBook([
            makeError({ sid: "GEN 1:1", tokenId: "gen-old-1" }),
            makeError({ sid: "GEN 2:3", tokenId: "gen-old-2" }),
            makeError({ sid: "EXO 1:1", tokenId: "exo-keep" }),
        ]);

        const nextBook = [makeError({ sid: "GEN 1:9", tokenId: "gen-new-1" })];

        const next = replaceLintErrorsForBook(prev, "GEN", nextBook);

        expect(next.GEN).toEqual([
            expect.objectContaining({
                sid: "GEN 1:9",
                tokenId: "gen-new-1",
            }),
        ]);
        expect(next.EXO).toEqual([
            expect.objectContaining({
                sid: "EXO 1:1",
                tokenId: "exo-keep",
            }),
        ]);
        expect(next.GEN?.some((e) => e.tokenId === "gen-old-1")).toBe(false);
        expect(next.GEN?.some((e) => e.tokenId === "gen-old-2")).toBe(false);
    });

    it("replaces only a targeted chapter when requested", () => {
        const prev = buildLintMessagesByBook([
            makeError({ sid: "GEN 1:1", tokenId: "gen-ch1-old" }),
            makeError({ sid: "GEN 2:1", tokenId: "gen-ch2-keep" }),
            makeError({ sid: "EXO 1:1", tokenId: "exo-keep" }),
        ]);

        const next = replaceLintErrorsForChapter(prev, "GEN", 1, [
            makeError({ sid: "GEN 1:4", tokenId: "gen-ch1-new" }),
        ]);

        expect(next.GEN?.some((e) => e.tokenId === "gen-ch1-old")).toBe(false);
        expect(next.GEN?.some((e) => e.tokenId === "gen-ch2-keep")).toBe(true);
        expect(next.EXO?.some((e) => e.tokenId === "exo-keep")).toBe(true);
        expect(next.GEN?.some((e) => e.tokenId === "gen-ch1-new")).toBe(true);
    });

    it("creates a missing book entry when replacing a new book", () => {
        const prev = buildLintMessagesByBook([
            makeError({ sid: "GEN 1:1", tokenId: "gen-old-1" }),
        ]);
        const newBookErrors = [makeError({ sid: "EXO 1:1", tokenId: "exo-1" })];

        const next = replaceLintErrorsForBook(prev, "EXO", newBookErrors);

        expect(next.EXO).toBeDefined();
        expect(next.EXO).toEqual(newBookErrors);
        expect(next.GEN).toEqual(prev.GEN);
    });

    it("returns previous map when replacing a book with the same array reference", () => {
        const sharedErrors = [makeError({ sid: "GEN 1:1", tokenId: "gen-1" })];
        const prev = {
            GEN: sharedErrors,
        };

        const next = replaceLintErrorsForBook(prev, "GEN", sharedErrors);

        expect(next).toBe(prev);
    });

    it("flattens book-keyed lint into a stable sorted list", () => {
        const messagesByBook = {
            EXO: [makeError({ sid: "EXO 2:1", tokenId: "exo-2" })],
            GEN: [
                makeError({ sid: "GEN 2:1", tokenId: "gen-2" }),
                makeError({ sid: "GEN 1:1", tokenId: "gen-1" }),
            ],
        };

        const flat = flattenLintMessagesByBook(messagesByBook);

        expect(flat.map((issue) => issue.sid)).toEqual([
            "GEN 1:1",
            "GEN 2:1",
            "EXO 2:1",
        ]);
    });
});

describe("lint issue equality", () => {
    it("is order-insensitive and identity-aware", () => {
        const one = makeError({
            sid: "GEN 1:1",
            code: "unknown-token",
            tokenId: "a",
            message: "A",
        });
        const two = makeError({
            sid: "GEN 1:2",
            code: "unknown-marker",
            tokenId: "b",
            message: "B",
        });

        expect(areLintIssueListsEqual([one, two], [two, one])).toBe(true);
    });

    it("detects token identity differences even when message text matches", () => {
        const left = makeError({
            sid: "GEN 1:1",
            tokenId: "node-left",
            message: "Same",
        });
        const right = makeError({
            sid: "GEN 1:1",
            tokenId: "node-right",
            message: "Same",
        });

        expect(areLintIssueListsEqual([left], [right])).toBe(false);
    });
});
