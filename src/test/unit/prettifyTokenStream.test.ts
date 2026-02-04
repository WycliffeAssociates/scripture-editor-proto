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
});
