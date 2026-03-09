import { describe, expect, it } from "vitest";
import {
    areLintIssueListsEqual,
    replaceLintErrorsForBook,
    replaceLintErrorsForChapter,
} from "@/app/ui/hooks/lintState.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

function makeError(overrides: Partial<LintIssue>): LintIssue {
    return {
        message: "msg",
        code: "unknown-token",
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
        const prev = [
            makeError({ sid: "GEN 1:1", tokenId: "gen-old-1" }),
            makeError({ sid: "GEN 2:3", tokenId: "gen-old-2" }),
            makeError({ sid: "EXO 1:1", tokenId: "exo-keep" }),
        ];

        const nextBook = [makeError({ sid: "GEN 1:9", tokenId: "gen-new-1" })];

        const next = replaceLintErrorsForBook(prev, "GEN", nextBook);

        expect(next).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    sid: "GEN 1:9",
                    tokenId: "gen-new-1",
                }),
                expect.objectContaining({
                    sid: "EXO 1:1",
                    tokenId: "exo-keep",
                }),
            ]),
        );
        expect(next.some((e) => e.tokenId === "gen-old-1")).toBe(false);
        expect(next.some((e) => e.tokenId === "gen-old-2")).toBe(false);
    });

    it("replaces only a targeted chapter when requested", () => {
        const prev = [
            makeError({ sid: "GEN 1:1", tokenId: "gen-ch1-old" }),
            makeError({ sid: "GEN 2:1", tokenId: "gen-ch2-keep" }),
            makeError({ sid: "EXO 1:1", tokenId: "exo-keep" }),
        ];

        const next = replaceLintErrorsForChapter(prev, "GEN", 1, [
            makeError({ sid: "GEN 1:4", tokenId: "gen-ch1-new" }),
        ]);

        expect(next.some((e) => e.tokenId === "gen-ch1-old")).toBe(false);
        expect(next.some((e) => e.tokenId === "gen-ch2-keep")).toBe(true);
        expect(next.some((e) => e.tokenId === "exo-keep")).toBe(true);
        expect(next.some((e) => e.tokenId === "gen-ch1-new")).toBe(true);
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
