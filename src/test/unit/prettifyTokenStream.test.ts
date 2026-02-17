import { describe, expect, it } from "vitest";
import { TokenMap } from "@/core/domain/usfm/lex.ts";
import {
    type PrettifyToken,
    prettifyTokenStream,
} from "@/core/domain/usfm/prettify/prettifyTokenStream.ts";

describe("core prettifyTokenStream", () => {
    it("preserves unknown token types + metadata", () => {
        const tokens = [
            {
                tokenType: "__custom__",
                text: "",
                custom: 123,
            } as PrettifyToken & { custom: number },
        ];

        const result = prettifyTokenStream(tokens);
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            tokenType: "__custom__",
            text: "",
            custom: 123,
        });
    });

    it("recurses into nested content", () => {
        const tokens: PrettifyToken[] = [
            {
                tokenType: "__nested__",
                text: "\\f ",
                marker: "f",
                content: [
                    { tokenType: TokenMap.text, text: "a  b" },
                    { tokenType: TokenMap.text, text: "\t\tc" },
                ],
            },
        ];

        const result = prettifyTokenStream(tokens);
        expect(result).toHaveLength(1);
        expect(result[0]?.content).toMatchObject([
            { tokenType: TokenMap.text, text: "a b c" },
        ]);
    });

    it("bridges consecutive verse markers into a verse range", () => {
        const tokens: PrettifyToken[] = [
            { tokenType: TokenMap.marker, marker: "v", text: "\\v" },
            { tokenType: TokenMap.numberRange, marker: "v", text: "1" },
            { tokenType: TokenMap.marker, marker: "v", text: "\\v" },
            { tokenType: TokenMap.numberRange, marker: "v", text: "2" },
            { tokenType: TokenMap.marker, marker: "v", text: "\\v" },
            { tokenType: TokenMap.numberRange, marker: "v", text: "3" },
            { tokenType: TokenMap.text, text: "  asdf asdf" },
        ];

        const result = prettifyTokenStream(tokens);

        expect(result).toMatchObject([
            { tokenType: TokenMap.marker, marker: "v" },
            { tokenType: TokenMap.numberRange, marker: "v", text: " 1-3" },
            { tokenType: TokenMap.text, text: " asdf asdf" },
        ]);
    });

    it("removes duplicated verse number text and then bridges verse markers", () => {
        const tokens: PrettifyToken[] = [
            { tokenType: TokenMap.marker, marker: "v", text: "\\v" },
            { tokenType: TokenMap.numberRange, marker: "v", text: "14" },
            { tokenType: TokenMap.text, text: " 14" },
            { tokenType: TokenMap.marker, marker: "v", text: "\\v" },
            { tokenType: TokenMap.numberRange, marker: "v", text: "15" },
            { tokenType: TokenMap.text, text: " text" },
        ];

        const result = prettifyTokenStream(tokens);

        expect(result).toMatchObject([
            { tokenType: TokenMap.marker, marker: "v" },
            { tokenType: TokenMap.numberRange, marker: "v", text: " 14-15" },
            { tokenType: TokenMap.text, text: " text" },
        ]);
    });

    it("inserts default \\p before first verse after a chapter marker when missing", () => {
        const tokens: PrettifyToken[] = [
            { tokenType: TokenMap.marker, marker: "c", text: "\\c" },
            { tokenType: TokenMap.numberRange, marker: "c", text: "1" },
            { tokenType: TokenMap.marker, marker: "v", text: "\\v" },
            { tokenType: TokenMap.numberRange, marker: "v", text: "1" },
            { tokenType: TokenMap.text, text: " In the beginning" },
        ];

        const result = prettifyTokenStream(tokens);
        const pIndex = result.findIndex(
            (t) => t.tokenType === TokenMap.marker && t.marker === "p",
        );
        const vIndex = result.findIndex(
            (t) => t.tokenType === TokenMap.marker && t.marker === "v",
        );

        expect(pIndex).toBeGreaterThanOrEqual(0);
        expect(vIndex).toBeGreaterThanOrEqual(0);
        expect(pIndex).toBeLessThan(vIndex);
    });

    it("removes leading verse enumerator from already-bridged verse text", () => {
        const tokens: PrettifyToken[] = [
            { tokenType: TokenMap.marker, marker: "v", text: "\\v" },
            { tokenType: TokenMap.numberRange, marker: "v", text: "1-3" },
            { tokenType: TokenMap.text, text: " 1. James, a servant..." },
        ];

        const result = prettifyTokenStream(tokens);

        expect(result).toMatchObject([
            { tokenType: TokenMap.marker, marker: "v" },
            { tokenType: TokenMap.numberRange, marker: "v", text: " 1-3" },
            { tokenType: TokenMap.text, text: " James, a servant..." },
        ]);
    });

    it("keeps leading enumerator when number is outside the bridge range", () => {
        const tokens: PrettifyToken[] = [
            { tokenType: TokenMap.marker, marker: "v", text: "\\v" },
            { tokenType: TokenMap.numberRange, marker: "v", text: "1" },
            { tokenType: TokenMap.marker, marker: "v", text: "\\v" },
            { tokenType: TokenMap.numberRange, marker: "v", text: "2" },
            { tokenType: TokenMap.text, text: " 3. Outside range text" },
        ];

        const result = prettifyTokenStream(tokens);

        expect(result).toMatchObject([
            { tokenType: TokenMap.marker, marker: "v" },
            { tokenType: TokenMap.numberRange, marker: "v", text: " 1-2" },
            { tokenType: TokenMap.text, text: " 3. Outside range text" },
        ]);
    });

    it("removes inline enumerators that are inside the bridge range", () => {
        const tokens: PrettifyToken[] = [
            { tokenType: TokenMap.marker, marker: "v", text: "\\v" },
            { tokenType: TokenMap.numberRange, marker: "v", text: "1-3" },
            {
                tokenType: TokenMap.text,
                text: " 1. James... 2. Consider it pure joy... 3. because you know...",
            },
        ];

        const result = prettifyTokenStream(tokens);
        const textNode = result.find((t) => t.tokenType === TokenMap.text);
        expect(textNode?.text).toBe(
            " James... Consider it pure joy... because you know...",
        );
    });

    it("drops an empty verse marker when the next verse marker has content", () => {
        const tokens: PrettifyToken[] = [
            { tokenType: TokenMap.marker, marker: "v", text: "\\v" },
            { tokenType: TokenMap.numberRange, marker: "v", text: "5" },
            { tokenType: TokenMap.marker, marker: "v", text: "\\v" },
            { tokenType: TokenMap.numberRange, marker: "v", text: "4" },
            { tokenType: TokenMap.text, text: " Let perseverance finish" },
        ];

        const result = prettifyTokenStream(tokens);

        expect(result).toMatchObject([
            { tokenType: TokenMap.marker, marker: "v" },
            { tokenType: TokenMap.numberRange, marker: "v", text: " 4" },
            { tokenType: TokenMap.text, text: " Let perseverance finish" },
        ]);
    });

    it("does not leave a leading space on paragraph markers at line start", () => {
        const tokens: PrettifyToken[] = [
            { tokenType: TokenMap.marker, marker: "s5", text: "\\s5" },
            { tokenType: TokenMap.marker, marker: "q", text: "\\q" },
            {
                tokenType: TokenMap.marker,
                marker: "v",
                text: "\\v",
            },
            { tokenType: TokenMap.numberRange, marker: "v", text: "3" },
            { tokenType: TokenMap.text, text: " He will be like a tree" },
        ];

        const result = prettifyTokenStream(tokens);
        const qToken = result.find(
            (t) => t.tokenType === TokenMap.marker && t.marker === "q",
        );
        expect(qToken?.text).toBe("\\q");
    });
});
