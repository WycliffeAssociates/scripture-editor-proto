import { describe, expect, it } from "vitest";
import type { DiffsByChapter } from "@/app/domain/project/diffTypes.ts";
import { buildChapterOptions } from "@/app/ui/components/blocks/DiffModal/chapterOptions.ts";

const formatBookLabel = (bookCode: string) => bookCode;

describe("buildChapterOptions", () => {
    it("includes only chapters with non-unchanged diffs", () => {
        const diffsByChapter: DiffsByChapter = {
            GEN: {
                1: [
                    {
                        uniqueKey: "GEN 1:1::1",
                        semanticSid: "GEN 1:1",
                        status: "unchanged",
                        originalDisplayText: "a",
                        currentDisplayText: "a",
                        bookCode: "GEN",
                        chapterNum: 1,
                        isWhitespaceChange: false,
                    },
                ],
                2: [
                    {
                        uniqueKey: "GEN 2:1::1",
                        semanticSid: "GEN 2:1",
                        status: "modified",
                        originalDisplayText: "a",
                        currentDisplayText: "b",
                        bookCode: "GEN",
                        chapterNum: 2,
                        isWhitespaceChange: false,
                    },
                ],
            },
        };

        const options = buildChapterOptions({
            diffsByChapter,
            hideWhitespaceOnly: false,
            formatBookLabel,
        });

        expect(options.map((o) => o.value)).toEqual(["GEN:2"]);
    });

    it("excludes whitespace-only chapters when hideWhitespaceOnly is true", () => {
        const diffsByChapter: DiffsByChapter = {
            ISA: {
                33: [
                    {
                        uniqueKey: "ISA 33:8::1",
                        semanticSid: "ISA 33:8",
                        status: "modified",
                        originalDisplayText: "a",
                        currentDisplayText: "a ",
                        bookCode: "ISA",
                        chapterNum: 33,
                        isWhitespaceChange: true,
                    },
                ],
                34: [
                    {
                        uniqueKey: "ISA 34:1::1",
                        semanticSid: "ISA 34:1",
                        status: "modified",
                        originalDisplayText: "a",
                        currentDisplayText: "b",
                        bookCode: "ISA",
                        chapterNum: 34,
                        isWhitespaceChange: false,
                    },
                ],
            },
        };

        const options = buildChapterOptions({
            diffsByChapter,
            hideWhitespaceOnly: true,
            formatBookLabel,
        });

        expect(options.map((o) => o.value)).toEqual(["ISA:34"]);
    });
});
