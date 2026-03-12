import { describe, expect, it } from "vitest";
import { toOnionFlatTokens } from "@/core/domain/usfm/usfmOnionAdapters.ts";
import type { FlatToken } from "@/core/domain/usfm/usfmOnionTypes.ts";

describe("usfmOnionAdapters", () => {
    it("computes cumulative spans when adapting lintable tokens", () => {
        const tokens = toOnionFlatTokens([
            {
                id: "1",
                tokenType: "marker",
                text: "\\q ",
                sid: "REV 1:1",
                marker: "q",
                lintErrors: [],
            },
            {
                id: "2",
                tokenType: "text",
                text: "Hallelujah",
                sid: "REV 1:1",
                marker: undefined,
                lintErrors: [],
            },
        ]);

        expect(tokens).toHaveLength(2);
        expect(tokens[0]?.span.start).toBe(0);
        expect(tokens[0]?.span.end).toBe(3);
        expect(tokens[1]?.span.start).toBe(3);
        expect(tokens[1]?.span.end).toBe(13);
    });

    it("passes through existing onion flat tokens unchanged", () => {
        const flat: FlatToken[] = [
            {
                id: "a",
                kind: "newline",
                span: {
                    start: 4,
                    end: 7,
                },
                sid: "REV 1:1",
                marker: null,
                text: "\n",
            },
        ];
        const adapted = toOnionFlatTokens(flat);
        expect(adapted).toEqual(flat);
    });

    it("normalizes legacy flat token kinds to onion kind names", () => {
        const adapted = toOnionFlatTokens([
            {
                id: "a",
                kind: "verticalWhitespace",
                span: {
                    start: 4,
                    end: 5,
                },
                sid: "REV 1:1",
                marker: null,
                text: "\n",
            } satisfies FlatToken,
        ]);

        expect(adapted[0]?.kind).toBe("newline");
    });
});
