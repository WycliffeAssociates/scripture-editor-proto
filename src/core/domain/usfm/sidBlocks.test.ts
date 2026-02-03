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
        expect(diffs).toHaveLength(1);
        expect(diffs[0]?.status).toBe("modified");

        const next = applyRevertByBlockId({
            diffBlockId: diffs[0]!.blockId,
            baselineTokens: baseline,
            currentTokens: current,
        });
        expect(next.map((t) => t.text).join("")).toBe("Hello worldOk");
    });
});
