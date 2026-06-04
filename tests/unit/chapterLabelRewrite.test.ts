import { describe, expect, it } from "vitest";
import {
    applyChapterLabelRewrites,
    fabricateChapterLabelRewrites,
    swapChapterLabelStem,
} from "@/app/domain/editor/annotations/chapterLabelRewrite.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

let nextId = 0;
function tok(
    kind: Token["kind"],
    source: string,
    extra: Partial<Token> = {},
): Token {
    nextId += 1;
    return { id: `t${nextId}`, kind, source, ...extra } as Token;
}

describe("swapChapterLabelStem", () => {
    it("swaps the stem but keeps the chapter number and its spacing", () => {
        expect(swapChapterLabelStem("Marika 14", "Wase")).toBe("Wase 14");
        expect(swapChapterLabelStem("Genesis 18", "Mwambo")).toBe("Mwambo 18");
    });

    it("swaps a number-less label wholesale", () => {
        expect(swapChapterLabelStem("Mazmur", "Salmo")).toBe("Salmo");
    });

    it("preserves surrounding whitespace", () => {
        expect(swapChapterLabelStem("  Marika 3 ", "Wase")).toBe("  Wase 3 ");
    });

    it("is a no-op when the label number is a separate token (no digits here)", () => {
        // Text token is just "Marika " (trailing space); the "14" lives in a
        // sibling number token that this function never sees.
        expect(swapChapterLabelStem("Marika ", "Wase")).toBe("Wase ");
    });
});

describe("fabricateChapterLabelRewrites", () => {
    function cl(label: string): Token[] {
        return [tok("marker", "\\cl", { marker: "cl" }), tok("text", label)];
    }

    it("rewrites only off-target labels, targeting the text token", () => {
        const tokens = [...cl("Wase 1"), ...cl("Marika 2"), ...cl("Marika 3")];
        const rewrites = fabricateChapterLabelRewrites(tokens, "Wase");

        // The two "Marika …" labels change; the "Wase 1" already on target does not.
        expect(rewrites.map((r) => r.to)).toEqual(["Wase 2", "Wase 3"]);
        expect(rewrites.every((r) => r.tokenId.length > 0)).toBe(true);
    });

    it("returns nothing when every label is already on target", () => {
        const tokens = [...cl("Wase 1"), ...cl("Wase 2")];
        expect(fabricateChapterLabelRewrites(tokens, "Wase")).toEqual([]);
    });
});

describe("applyChapterLabelRewrites", () => {
    it("replaces the matched tokens' source and leaves the rest by reference", () => {
        const marker = tok("marker", "\\cl", { marker: "cl" });
        const label = tok("text", "Marika 5");
        const tokens = [marker, label];

        const result = applyChapterLabelRewrites(tokens, [
            { tokenId: label.id, from: "Marika 5", to: "Wase 5" },
        ]);

        expect(result[1].source).toBe("Wase 5");
        // Untouched tokens are shared by reference (cheap, no needless churn).
        expect(result[0]).toBe(marker);
        // Input is not mutated.
        expect(label.source).toBe("Marika 5");
    });

    it("returns the same array when there are no rewrites", () => {
        const tokens = [tok("text", "x")];
        expect(applyChapterLabelRewrites(tokens, [])).toBe(tokens);
    });
});
