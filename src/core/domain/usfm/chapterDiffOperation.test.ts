import { describe, expect, it } from "vitest";
import {
    diffChapterTokenStreams,
    flattenDiffMap,
    replaceChapterDiffsInMap,
    replaceManyChapterDiffsInMap,
} from "./chapterDiffOperation.ts";

type T = { sid: string; text: string; id: string };

describe("chapterDiffOperation", () => {
    it("returns block diffs with original/current token slices", () => {
        const baseline: T[] = [
            { sid: "GEN 1:1", text: "In ", id: "a" },
            { sid: "GEN 1:1", text: "the beginning", id: "b" },
        ];
        const current: T[] = [
            { sid: "GEN 1:1", text: "In ", id: "a" },
            { sid: "GEN 1:1", text: "the start", id: "b" },
        ];

        const diffs = diffChapterTokenStreams({
            baselineTokens: baseline,
            currentTokens: current,
        });

        expect(diffs).toHaveLength(1);
        expect(diffs[0]?.status).toBe("modified");
        expect(diffs[0]?.originalTokens.map((t) => t.text).join("")).toBe(
            "In the beginning",
        );
        expect(diffs[0]?.currentTokens.map((t) => t.text).join("")).toBe(
            "In the start",
        );
    });

    it("replaces chapter diffs immutably and prunes empty branches", () => {
        const withDiffs = replaceChapterDiffsInMap({
            previousMap: {},
            bookCode: "GEN",
            chapterNum: 1,
            chapterDiffs: [{ id: "x" }],
        });
        expect(withDiffs).toEqual({ GEN: { 1: [{ id: "x" }] } });

        const pruned = replaceChapterDiffsInMap({
            previousMap: withDiffs,
            bookCode: "GEN",
            chapterNum: 1,
            chapterDiffs: [],
        });
        expect(pruned).toEqual({});
    });

    it("supports bulk replacement and flattened filtering", () => {
        const next = replaceManyChapterDiffsInMap({
            previousMap: {},
            chapterDiffs: [
                {
                    bookCode: "GEN",
                    chapterNum: 1,
                    diffs: [{ status: "unchanged" }, { status: "modified" }],
                },
                {
                    bookCode: "EXO",
                    chapterNum: 2,
                    diffs: [{ status: "added" }],
                },
            ],
        });

        const visible = flattenDiffMap({
            diffsByChapter: next,
            include: (diff) => diff.status !== "unchanged",
        });

        expect(visible).toHaveLength(2);
        expect(visible.map((d) => d.status)).toEqual(["modified", "added"]);
    });
});
