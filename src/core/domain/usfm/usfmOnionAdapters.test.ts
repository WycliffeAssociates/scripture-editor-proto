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
        expect(tokens[0]?.spanStart).toBe(0);
        expect(tokens[0]?.spanEnd).toBe(3);
        expect(tokens[1]?.spanStart).toBe(3);
        expect(tokens[1]?.spanEnd).toBe(13);
    });

    it("passes through existing onion flat tokens unchanged", () => {
        const flat: FlatToken[] = [
            {
                id: "a",
                kind: "marker",
                spanStart: 4,
                spanEnd: 7,
                sid: "REV 1:1",
                marker: "q",
                text: "\\q ",
            },
        ];
        const adapted = toOnionFlatTokens(flat);
        expect(adapted).toEqual(flat);
    });
});
