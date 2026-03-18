import { describe, expect, it } from "vitest";
import { mergeHorizontalWhitespaceToAdjacent } from "@/core/domain/usfm/parseUtils.ts";

type LintableToken = {
    id: string;
    text: string;
    tokenType: string;
    marker?: string;
    sid?: string;
    [key: string]: unknown;
};

let idCounter = 0;
function t(partial: {
    text: string;
    tokenType: string;
    marker?: string;
    sid?: string;
    id?: string;
}): LintableToken {
    return {
        id: partial.id ?? `t-${idCounter++}`,
        text: partial.text,
        tokenType: partial.tokenType,
        marker: partial.marker,
        sid: partial.sid,
    };
}

describe("mergeHorizontalWhitespaceToAdjacent", () => {
    it("pushes horizontal whitespace to the next token when possible", () => {
        const tokens = [
            t({ tokenType: "marker", text: "\\v", marker: "v" }),
            t({ tokenType: "ws", text: " " }),
            t({ tokenType: "numberRange", text: "1" }),
        ];

        const result = mergeHorizontalWhitespaceToAdjacent(tokens);

        expect(result.map((x) => x.tokenType)).toEqual([
            "marker",
            "numberRange",
        ]);
        expect(result[0]?.text).toBe("\\v");
        expect(result[1]?.text).toBe(" 1");
    });

    it("falls back to the previous token when whitespace is right before a linebreak", () => {
        const tokens = [
            t({ tokenType: "text", text: "word" }),
            t({ tokenType: "ws", text: " " }),
            t({ tokenType: "nl", text: "\n" }),
        ];

        const result = mergeHorizontalWhitespaceToAdjacent(tokens);

        expect(result.map((x) => x.tokenType)).toEqual(["text", "nl"]);
        expect(result[0]?.text).toBe("word ");
        expect(result[1]?.text).toBe("\n");
    });

    it("falls back to the previous token when whitespace is at end-of-stream", () => {
        const tokens = [
            t({ tokenType: "text", text: "end" }),
            t({ tokenType: "ws", text: " " }),
        ];

        const result = mergeHorizontalWhitespaceToAdjacent(tokens);

        expect(result.map((x) => x.tokenType)).toEqual(["text"]);
        expect(result[0]?.text).toBe("end ");
    });
});
