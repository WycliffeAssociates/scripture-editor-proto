import { describe, expect, it } from "vitest";
import {
    replaceLintErrorsForBook,
    replaceLintErrorsForChapter,
} from "@/app/ui/hooks/lintState.ts";
import {
    areLintErrorListsEqual,
    type LintError,
    LintErrorKeys,
} from "@/core/data/usfm/lint.ts";

function makeError(overrides: Partial<LintError>): LintError {
    return {
        message: "msg",
        sid: "GEN 1:1",
        msgKey: LintErrorKeys.unknownToken,
        nodeId: "n1",
        ...overrides,
    };
}

describe("lint state replacement", () => {
    it("replaces all errors for a book atomically", () => {
        const prev = [
            makeError({ sid: "GEN 1:1", nodeId: "gen-old-1" }),
            makeError({ sid: "GEN 2:3", nodeId: "gen-old-2" }),
            makeError({ sid: "EXO 1:1", nodeId: "exo-keep" }),
        ];

        const nextBook = [makeError({ sid: "GEN 1:9", nodeId: "gen-new-1" })];

        const next = replaceLintErrorsForBook(prev, "GEN", nextBook);

        expect(next).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    sid: "GEN 1:9",
                    nodeId: "gen-new-1",
                }),
                expect.objectContaining({ sid: "EXO 1:1", nodeId: "exo-keep" }),
            ]),
        );
        expect(next.some((e) => e.nodeId === "gen-old-1")).toBe(false);
        expect(next.some((e) => e.nodeId === "gen-old-2")).toBe(false);
    });

    it("replaces only a targeted chapter when requested", () => {
        const prev = [
            makeError({ sid: "GEN 1:1", nodeId: "gen-ch1-old" }),
            makeError({ sid: "GEN 2:1", nodeId: "gen-ch2-keep" }),
            makeError({ sid: "EXO 1:1", nodeId: "exo-keep" }),
        ];

        const next = replaceLintErrorsForChapter(prev, "GEN", 1, [
            makeError({ sid: "GEN 1:4", nodeId: "gen-ch1-new" }),
        ]);

        expect(next.some((e) => e.nodeId === "gen-ch1-old")).toBe(false);
        expect(next.some((e) => e.nodeId === "gen-ch2-keep")).toBe(true);
        expect(next.some((e) => e.nodeId === "exo-keep")).toBe(true);
        expect(next.some((e) => e.nodeId === "gen-ch1-new")).toBe(true);
    });
});

describe("lint error equality", () => {
    it("is order-insensitive and identity-aware", () => {
        const one = makeError({
            sid: "GEN 1:1",
            msgKey: LintErrorKeys.unknownToken,
            nodeId: "a",
            message: "A",
        });
        const two = makeError({
            sid: "GEN 1:2",
            msgKey: LintErrorKeys.isUnknownMarker,
            nodeId: "b",
            message: "B",
        });

        expect(areLintErrorListsEqual([one, two], [two, one])).toBe(true);
    });

    it("detects node identity differences even when message text matches", () => {
        const left = makeError({
            sid: "GEN 1:1",
            nodeId: "node-left",
            message: "Same",
        });
        const right = makeError({
            sid: "GEN 1:1",
            nodeId: "node-right",
            message: "Same",
        });

        expect(areLintErrorListsEqual([left], [right])).toBe(false);
    });
});
