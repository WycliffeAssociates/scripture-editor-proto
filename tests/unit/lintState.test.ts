import { describe, expect, it } from "vitest";
import {
    areLintIssueListsEqual,
    buildLintMessagesByBookFromSnapshots,
    createLintSnapshot,
    flattenLintMessagesByBook,
} from "@/app/ui/hooks/lintState.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

function makeError(overrides: Partial<LintIssue>): LintIssue {
    return {
        message: "msg",
        template: "msg",
        code: "unknown-token",
        category: "structure",
        severity: "warning",
        issueType: "usfm",
        messageParams: {},
        sid: "GEN 1:1",
        tokenId: "n1",
        span: { start: 0, end: 1 },
        ...overrides,
    };
}

describe("lint state replacement", () => {
    it("rebuilds book-grouped lint from chapter snapshots", () => {
        const snapshots = {
            "GEN:1": createLintSnapshot({
                requestId: 1,
                bookCode: "GEN",
                chapter: 1,
                issues: [makeError({ sid: "GEN 1:1", tokenId: "gen-1" })],
                status: "ready",
            }),
            "GEN:2": createLintSnapshot({
                requestId: 2,
                bookCode: "GEN",
                chapter: 2,
                issues: [makeError({ sid: "GEN 2:1", tokenId: "gen-2" })],
                status: "pending",
            }),
            "EXO:1": createLintSnapshot({
                requestId: 3,
                bookCode: "EXO",
                chapter: 1,
                issues: [makeError({ sid: "EXO 1:1", tokenId: "exo-1" })],
                status: "ready",
            }),
        };

        const grouped = buildLintMessagesByBookFromSnapshots(snapshots);

        expect(grouped.GEN?.map((issue) => issue.tokenId)).toEqual([
            "gen-1",
            "gen-2",
        ]);
        expect(grouped.EXO?.map((issue) => issue.tokenId)).toEqual(["exo-1"]);
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
