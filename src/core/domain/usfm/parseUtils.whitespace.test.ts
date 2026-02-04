import { describe, expect, it } from "vitest";
import type { LintableToken } from "@/core/data/usfm/lint.ts";
import { TokenMap } from "@/core/domain/usfm/lex.ts";
import { mergeHorizontalWhitespaceToAdjacent } from "@/core/domain/usfm/parseUtils.ts";

let idCounter = 0;
function t(
    partial: Omit<LintableToken, "id"> & { id?: string },
): LintableToken {
    return {
        id: partial.id ?? `t-${idCounter++}`,
        text: partial.text,
        tokenType: partial.tokenType,
        marker: partial.marker,
        sid: partial.sid,
        inPara: partial.inPara,
        inChars: partial.inChars,
        lintErrors: partial.lintErrors,
        isParaMarker: partial.isParaMarker,
        isSyntheticParaMarker: partial.isSyntheticParaMarker,
        content: partial.content,
        attributes: partial.attributes,
    };
}

describe("mergeHorizontalWhitespaceToAdjacent", () => {
    it("pushes horizontal whitespace to the next token when possible", () => {
        const tokens = [
            t({ tokenType: TokenMap.marker, text: "\\v", marker: "v" }),
            t({ tokenType: TokenMap.horizontalWhitespace, text: " " }),
            t({ tokenType: TokenMap.numberRange, text: "1" }),
        ];

        const result = mergeHorizontalWhitespaceToAdjacent(tokens);

        expect(result.map((x) => x.tokenType)).toEqual([
            TokenMap.marker,
            TokenMap.numberRange,
        ]);
        expect(result[0]?.text).toBe("\\v");
        expect(result[1]?.text).toBe(" 1");
    });

    it("falls back to the previous token when whitespace is right before a linebreak", () => {
        const tokens = [
            t({ tokenType: TokenMap.text, text: "word" }),
            t({ tokenType: TokenMap.horizontalWhitespace, text: " " }),
            t({ tokenType: TokenMap.verticalWhitespace, text: "\n" }),
        ];

        const result = mergeHorizontalWhitespaceToAdjacent(tokens);

        expect(result.map((x) => x.tokenType)).toEqual([
            TokenMap.text,
            TokenMap.verticalWhitespace,
        ]);
        expect(result[0]?.text).toBe("word ");
        expect(result[1]?.text).toBe("\n");
    });

    it("falls back to the previous token when whitespace is at end-of-stream", () => {
        const tokens = [
            t({ tokenType: TokenMap.text, text: "end" }),
            t({ tokenType: TokenMap.horizontalWhitespace, text: " " }),
        ];

        const result = mergeHorizontalWhitespaceToAdjacent(tokens);

        expect(result.map((x) => x.tokenType)).toEqual([TokenMap.text]);
        expect(result[0]?.text).toBe("end ");
    });
});
