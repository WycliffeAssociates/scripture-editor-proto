import type { SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import type { ProjectDiff } from "@/app/ui/hooks/useSave.tsx";
import {
    buildChapterRenderParagraphs,
    toChapterViewEntries,
} from "./chapterDiffViewModel.ts";

function makeDiff(overrides: Partial<ProjectDiff>): ProjectDiff {
    return {
        uniqueKey: "k-1",
        semanticSid: "GEN 1:1",
        status: "modified",
        originalDisplayText: "Old",
        currentDisplayText: "New",
        bookCode: "GEN",
        chapterNum: 1,
        ...overrides,
    };
}

describe("toChapterViewEntries", () => {
    it("keeps changed hunks revertable", () => {
        const entries = toChapterViewEntries([
            makeDiff({ uniqueKey: "a", status: "unchanged" }),
            makeDiff({ uniqueKey: "b", status: "modified" }),
            makeDiff({ uniqueKey: "c", status: "added" }),
            makeDiff({ uniqueKey: "d", status: "deleted" }),
        ]);

        expect(entries).toHaveLength(4);
        expect(entries[0]?.canRevert).toBe(false);
        expect(entries[1]?.canRevert).toBe(true);
        expect(entries[2]?.canRevert).toBe(true);
        expect(entries[3]?.canRevert).toBe(true);
    });

    it("treats whitespace-only hunks as unchanged when hidden", () => {
        const entries = toChapterViewEntries(
            [
                makeDiff({
                    uniqueKey: "w",
                    status: "modified",
                    isWhitespaceChange: true,
                }),
            ],
            { hideWhitespaceOnly: true },
        );

        expect(entries[0]?.status).toBe("unchanged");
        expect(entries[0]?.canRevert).toBe(false);
    });

    it("uses text-only values when USFM markers are hidden", () => {
        const entries = toChapterViewEntries([
            makeDiff({
                originalDisplayText: "\\v 1 In the beginning",
                currentDisplayText: "\\v 1 In the beginning",
                originalTextOnly: "In the beginning",
                currentTextOnly: "In the beginning",
                isUsfmStructureChange: true,
            }),
        ]);

        expect(entries[0]?.originalText).toBe("In the beginning");
        expect(entries[0]?.currentText).toBe("In the beginning");
        expect(entries[0]?.isUsfmStructureChange).toBe(true);
    });
});

describe("buildChapterRenderParagraphs", () => {
    it("starts a new paragraph at para markers across SID entries", () => {
        const diffs: ProjectDiff[] = [
            makeDiff({
                uniqueKey: "a",
                status: "unchanged",
                currentRenderTokens: [
                    {
                        node: {
                            type: "usfm-text-node",
                            lexicalType: "usfm-text-node",
                            version: 1,
                            detail: 0,
                            format: 0,
                            mode: "normal",
                            style: "",
                            id: "m-p",
                            sid: "GEN 5:0",
                            tokenType: UsfmTokenTypes.marker,
                            marker: "p",
                            text: "\\p",
                        } as unknown as SerializedLexicalNode,
                        sid: "GEN 5:0",
                        tokenType: UsfmTokenTypes.marker,
                        marker: "p",
                    },
                ],
            }),
            makeDiff({
                uniqueKey: "b",
                semanticSid: "GEN 5:1",
                status: "modified",
                currentRenderTokens: [
                    {
                        node: {
                            type: "usfm-text-node",
                            lexicalType: "usfm-text-node",
                            version: 1,
                            detail: 0,
                            format: 0,
                            mode: "normal",
                            style: "",
                            id: "m-v",
                            sid: "GEN 5:1",
                            tokenType: UsfmTokenTypes.marker,
                            marker: "v",
                            text: "\\v",
                        } as unknown as SerializedLexicalNode,
                        sid: "GEN 5:1",
                        tokenType: UsfmTokenTypes.marker,
                        marker: "v",
                    },
                    {
                        node: {
                            type: "usfm-text-node",
                            lexicalType: "usfm-text-node",
                            version: 1,
                            detail: 0,
                            format: 0,
                            mode: "normal",
                            style: "",
                            id: "n-v",
                            sid: "GEN 5:1",
                            tokenType: UsfmTokenTypes.numberRange,
                            text: " 1",
                        } as unknown as SerializedLexicalNode,
                        sid: "GEN 5:1",
                        tokenType: UsfmTokenTypes.numberRange,
                    },
                    {
                        node: {
                            type: "usfm-text-node",
                            lexicalType: "usfm-text-node",
                            version: 1,
                            detail: 0,
                            format: 0,
                            mode: "normal",
                            style: "",
                            id: "t-v",
                            sid: "GEN 5:1",
                            tokenType: UsfmTokenTypes.text,
                            text: " In the beginning",
                        } as unknown as SerializedLexicalNode,
                        sid: "GEN 5:1",
                        tokenType: UsfmTokenTypes.text,
                    },
                ],
            }),
        ];

        const paragraphs = buildChapterRenderParagraphs({
            diffs,
            viewType: "current",
        });

        expect(paragraphs).toHaveLength(2);
        expect(paragraphs[1]?.marker).toBe("p");
        expect(paragraphs[1]?.tokens).toHaveLength(4);
        expect(paragraphs[1]?.tokens[1]?.token.marker).toBe("v");
    });
});
