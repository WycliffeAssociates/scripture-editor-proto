import { describe, expect, it } from "vitest";
import { diffSidBlocks } from "./sidBlockDiff.ts";
import { applyRevertByBlockId } from "./sidBlockRevert.ts";
import { buildSidBlocks } from "./sidBlocks.ts";

type T = { sid: string; text: string; id?: string };

describe("sidBlocks", () => {
    it("groups contiguous runs of same sid", () => {
        const tokens: T[] = [
            { sid: "GEN 1:1", text: "A", id: "1" },
            { sid: "GEN 1:1", text: "B", id: "2" },
            { sid: "GEN 1:2", text: "C", id: "3" },
            { sid: "GEN 1:2", text: "D", id: "4" },
        ];
        const blocks = buildSidBlocks(tokens);
        expect(blocks).toHaveLength(2);
        expect(blocks[0]?.semanticSid).toBe("GEN 1:1");
        expect(blocks[0]?.textFull).toBe("AB");
        expect(blocks[1]?.semanticSid).toBe("GEN 1:2");
        expect(blocks[1]?.textFull).toBe("CD");
    });

    it("uses first token id for stable block ids", () => {
        const tokens: T[] = [
            { sid: "GEN 1:1", text: "A", id: "tok-aaa" },
            { sid: "GEN 1:1", text: "B", id: "tok-bbb" },
        ];
        const blocks = buildSidBlocks(tokens);
        expect(blocks[0]?.blockId).toBe("GEN 1:1::tok-aaa");
    });

    it("treats non-consecutive repeated sid as distinct blocks", () => {
        const tokens: T[] = [
            { sid: "GEN 1:1", text: "A", id: "a" },
            { sid: "GEN 1:2", text: "B", id: "b" },
            { sid: "GEN 1:1", text: "C", id: "c" },
        ];
        const blocks = buildSidBlocks(tokens);
        expect(blocks).toHaveLength(3);
        expect(blocks[0]?.blockId).toBe("GEN 1:1::a");
        expect(blocks[2]?.blockId).toBe("GEN 1:1::c");
    });
});

describe("sidBlockDiff + sidBlockRevert", () => {
    it("marks modified blocks and reverts by block id", () => {
        const baseline: T[] = [
            { sid: "GEN 1:1", text: "Hello ", id: "a" },
            { sid: "GEN 1:1", text: "world", id: "b" },
            { sid: "GEN 1:2", text: "Ok", id: "c" },
        ];
        const current: T[] = [
            { sid: "GEN 1:1", text: "Hello ", id: "a" },
            { sid: "GEN 1:1", text: "wurld", id: "b" },
            { sid: "GEN 1:2", text: "Ok", id: "c" },
        ];

        const baselineBlocks = buildSidBlocks(baseline);
        const currentBlocks = buildSidBlocks(current);
        const diffs = diffSidBlocks(baselineBlocks, currentBlocks);
        expect(diffs).toHaveLength(2);
        const modified = diffs.find((diff) => diff.status === "modified");
        expect(modified).toBeDefined();
        if (modified?.blockId) {
            const next = applyRevertByBlockId({
                diffBlockId: modified.blockId,
                baselineTokens: baseline,
                currentTokens: current,
            });
            expect(next.map((t) => t.text).join("")).toBe("Hello worldOk");
        }
    });

    it("coalesces same-SID id drift into modified and can revert", () => {
        const baseline: T[] = [
            { sid: "ISA 33:9", text: "Alpha", id: "orig-id" },
        ];
        const current: T[] = [{ sid: "ISA 33:9", text: "Beta", id: "new-id" }];

        const baselineBlocks = buildSidBlocks(baseline);
        const currentBlocks = buildSidBlocks(current);
        const diffs = diffSidBlocks(baselineBlocks, currentBlocks);

        expect(diffs).toHaveLength(1);
        expect(diffs[0]?.status).toBe("modified");
        expect(diffs[0]?.semanticSid).toBe("ISA 33:9");

        const reverted = applyRevertByBlockId({
            diffBlockId: diffs[0]?.blockId ?? "",
            baselineTokens: baseline,
            currentTokens: current,
        });
        expect(reverted.map((t) => t.text).join("")).toBe("Alpha");
    });

    it("coalesces non-adjacent id drift and keeps unchanged text unchanged", () => {
        const baseline: T[] = [
            { sid: "ISA 33:9", text: "Verse 9", id: "orig-9" },
            { sid: "ISA 33:10", text: "Verse 10", id: "orig-10" },
        ];
        const current: T[] = [
            { sid: "ISA 33:9", text: "Verse 9 edited", id: "new-9" },
            { sid: "ISA 33:10", text: "Verse 10", id: "new-10" },
        ];

        const baselineBlocks = buildSidBlocks(baseline);
        const currentBlocks = buildSidBlocks(current);
        const diffs = diffSidBlocks(baselineBlocks, currentBlocks);

        expect(diffs).toHaveLength(2);
        expect(diffs.find((d) => d.semanticSid === "ISA 33:9")?.status).toBe(
            "modified",
        );
        expect(diffs.find((d) => d.semanticSid === "ISA 33:10")?.status).toBe(
            "unchanged",
        );
        expect(diffs.some((d) => d.status === "added")).toBe(false);
        expect(diffs.some((d) => d.status === "deleted")).toBe(false);
    });
});
