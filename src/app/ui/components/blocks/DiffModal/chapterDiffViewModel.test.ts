import type { SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import type {
    ChapterRenderToken,
    ProjectDiff,
} from "@/app/domain/project/diffTypes.ts";
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

    it("re-aligns after removed linebreak so shared markers remain unchanged", () => {
        const marker = (id: string, marker: string): ChapterRenderToken => ({
            node: {
                type: "usfm-text-node",
                lexicalType: "usfm-text-node",
                version: 1,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                id,
                sid: "ISA 33:1",
                tokenType: UsfmTokenTypes.marker,
                marker,
                text: `\\${marker}`,
            } as unknown as SerializedLexicalNode,
            sid: "ISA 33:1",
            tokenType: UsfmTokenTypes.marker,
            marker,
        });
        const text = (id: string, value: string): ChapterRenderToken => ({
            node: {
                type: "usfm-text-node",
                lexicalType: "usfm-text-node",
                version: 1,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                id,
                sid: "ISA 33:1",
                tokenType: UsfmTokenTypes.text,
                text: value,
            } as unknown as SerializedLexicalNode,
            sid: "ISA 33:1",
            tokenType: UsfmTokenTypes.text,
        });
        const lineBreak: ChapterRenderToken = {
            node: { type: "linebreak", version: 1 } as SerializedLexicalNode,
            sid: "ISA 33:1",
        };

        const diff = makeDiff({
            uniqueKey: "isa-33-1",
            status: "modified",
            originalRenderTokens: [
                marker("m-v", "v"),
                text("t-1", " 1 test"),
                lineBreak,
                lineBreak,
                marker("m-s5", "s5"),
                lineBreak,
                marker("m-q1", "q1"),
            ],
            currentRenderTokens: [
                marker("m-v", "v"),
                text("t-1", " 1 test"),
                lineBreak,
                marker("m-s5", "s5"),
                lineBreak,
                marker("m-q1", "q1"),
            ],
        });

        const originalParagraphs = buildChapterRenderParagraphs({
            diffs: [diff],
            viewType: "original",
        });
        const currentParagraphs = buildChapterRenderParagraphs({
            diffs: [diff],
            viewType: "current",
        });

        const originalS5 = originalParagraphs
            .flatMap((p) => p.tokens)
            .find((token) => token.token.marker === "s5");
        const currentS5 = currentParagraphs
            .flatMap((p) => p.tokens)
            .find((token) => token.token.marker === "s5");
        const originalQ1 = originalParagraphs
            .flatMap((p) => p.tokens)
            .find((token) => token.token.marker === "q1");
        const currentQ1 = currentParagraphs
            .flatMap((p) => p.tokens)
            .find((token) => token.token.marker === "q1");

        expect(originalS5?.tokenChange).toBe("unchanged");
        expect(currentS5?.tokenChange).toBe("unchanged");
        expect(originalQ1?.tokenChange).toBe("unchanged");
        expect(currentQ1?.tokenChange).toBe("unchanged");
    });

    it("keeps marker/number tokens unchanged when only marker spacing differs", () => {
        const marker = (
            id: string,
            marker: string,
            textValue: string,
        ): ChapterRenderToken => ({
            node: {
                type: "usfm-text-node",
                lexicalType: "usfm-text-node",
                version: 1,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                id,
                sid: "REV 19:4",
                tokenType: UsfmTokenTypes.marker,
                marker,
                text: textValue,
            } as unknown as SerializedLexicalNode,
            sid: "REV 19:4",
            tokenType: UsfmTokenTypes.marker,
            marker,
        });
        const number = (id: string, value: string): ChapterRenderToken => ({
            node: {
                type: "usfm-text-node",
                lexicalType: "usfm-text-node",
                version: 1,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                id,
                sid: "REV 19:4",
                tokenType: UsfmTokenTypes.numberRange,
                text: value,
            } as unknown as SerializedLexicalNode,
            sid: "REV 19:4",
            tokenType: UsfmTokenTypes.numberRange,
        });
        const text = (id: string, value: string): ChapterRenderToken => ({
            node: {
                type: "usfm-text-node",
                lexicalType: "usfm-text-node",
                version: 1,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                id,
                sid: "REV 19:4",
                tokenType: UsfmTokenTypes.text,
                text: value,
            } as unknown as SerializedLexicalNode,
            sid: "REV 19:4",
            tokenType: UsfmTokenTypes.text,
        });

        const diff = makeDiff({
            uniqueKey: "rev-19-4",
            semanticSid: "REV 19:4",
            status: "modified",
            originalRenderTokens: [
                marker("m-v", "v", "\\v "),
                number("n-v", " 4"),
                text("t-v", " old"),
            ],
            currentRenderTokens: [
                marker("m-v", "v", "\\v"),
                number("n-v", "4"),
                text("t-v", " new"),
            ],
            originalAlignment: [
                { change: "unchanged", counterpartIndex: 0 },
                { change: "unchanged", counterpartIndex: 1 },
                { change: "modified", counterpartIndex: 2 },
            ],
            currentAlignment: [
                { change: "unchanged", counterpartIndex: 0 },
                { change: "unchanged", counterpartIndex: 1 },
                { change: "modified", counterpartIndex: 2 },
            ],
        });

        const originalTokens = buildChapterRenderParagraphs({
            diffs: [diff],
            viewType: "original",
        }).flatMap((paragraph) => paragraph.tokens);
        const currentTokens = buildChapterRenderParagraphs({
            diffs: [diff],
            viewType: "current",
        }).flatMap((paragraph) => paragraph.tokens);

        const originalMarker = originalTokens.find(
            (token) => token.token.tokenType === UsfmTokenTypes.marker,
        );
        const currentMarker = currentTokens.find(
            (token) => token.token.tokenType === UsfmTokenTypes.marker,
        );
        const originalNumber = originalTokens.find(
            (token) => token.token.tokenType === UsfmTokenTypes.numberRange,
        );
        const currentNumber = currentTokens.find(
            (token) => token.token.tokenType === UsfmTokenTypes.numberRange,
        );
        const originalText = originalTokens.find(
            (token) => token.token.tokenType === UsfmTokenTypes.text,
        );
        const currentText = currentTokens.find(
            (token) => token.token.tokenType === UsfmTokenTypes.text,
        );

        expect(originalMarker?.tokenChange).toBe("unchanged");
        expect(currentMarker?.tokenChange).toBe("unchanged");
        expect(originalNumber?.tokenChange).toBe("unchanged");
        expect(currentNumber?.tokenChange).toBe("unchanged");
        expect(originalText?.tokenChange).toBe("modified");
        expect(currentText?.tokenChange).toBe("modified");
    });

    it("treats marker/book-code boundary whitespace shifts as unchanged", () => {
        const marker = (
            id: string,
            marker: string,
            textValue: string,
        ): ChapterRenderToken => ({
            node: {
                type: "usfm-text-node",
                lexicalType: "usfm-text-node",
                version: 1,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                id,
                sid: "GEN 0:0",
                tokenType: UsfmTokenTypes.marker,
                marker,
                text: textValue,
            } as unknown as SerializedLexicalNode,
            sid: "GEN 0:0",
            tokenType: UsfmTokenTypes.marker,
            marker,
        });
        const bookCode = (id: string, value: string): ChapterRenderToken => ({
            node: {
                type: "usfm-text-node",
                lexicalType: "usfm-text-node",
                version: 1,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                id,
                sid: "GEN 0:0",
                tokenType: "bookCode",
                text: value,
            } as unknown as SerializedLexicalNode,
            sid: "GEN 0:0",
            tokenType: "bookCode",
        });
        const text = (id: string, value: string): ChapterRenderToken => ({
            node: {
                type: "usfm-text-node",
                lexicalType: "usfm-text-node",
                version: 1,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                id,
                sid: "GEN 0:0",
                tokenType: UsfmTokenTypes.text,
                text: value,
            } as unknown as SerializedLexicalNode,
            sid: "GEN 0:0",
            tokenType: UsfmTokenTypes.text,
        });

        const diff = makeDiff({
            uniqueKey: "gen-0-0",
            semanticSid: "GEN 0:0",
            status: "modified",
            originalRenderTokens: [
                marker("m-id", "id", "\\id"),
                bookCode("b-id", " GEN"),
                text("t-id", " Unlocked Literal Bible"),
            ],
            currentRenderTokens: [
                marker("m-id", "id", "\\id "),
                bookCode("b-id", "GEN"),
                text("t-id", " Unlocked Literal Bible"),
            ],
            originalAlignment: [
                { change: "modified", counterpartIndex: 0 },
                { change: "modified", counterpartIndex: 1 },
                { change: "unchanged", counterpartIndex: 2 },
            ],
            currentAlignment: [
                { change: "modified", counterpartIndex: 0 },
                { change: "modified", counterpartIndex: 1 },
                { change: "unchanged", counterpartIndex: 2 },
            ],
        });

        const originalTokens = buildChapterRenderParagraphs({
            diffs: [diff],
            viewType: "original",
        }).flatMap((paragraph) => paragraph.tokens);
        const currentTokens = buildChapterRenderParagraphs({
            diffs: [diff],
            viewType: "current",
        }).flatMap((paragraph) => paragraph.tokens);

        const originalMarker = originalTokens.find(
            (token) => token.token.tokenType === UsfmTokenTypes.marker,
        );
        const currentMarker = currentTokens.find(
            (token) => token.token.tokenType === UsfmTokenTypes.marker,
        );
        const originalBookCode = originalTokens.find(
            (token) => token.token.tokenType === "bookCode",
        );
        const currentBookCode = currentTokens.find(
            (token) => token.token.tokenType === "bookCode",
        );

        expect(originalMarker?.tokenChange).toBe("unchanged");
        expect(currentMarker?.tokenChange).toBe("unchanged");
        expect(originalBookCode?.tokenChange).toBe("unchanged");
        expect(currentBookCode?.tokenChange).toBe("unchanged");
    });

    it("keeps multi-token text replacements as modified pairs (not add/delete)", () => {
        const marker = (id: string): ChapterRenderToken => ({
            node: {
                type: "usfm-text-node",
                lexicalType: "usfm-text-node",
                version: 1,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                id,
                sid: "REV 19:5",
                tokenType: UsfmTokenTypes.marker,
                marker: "v",
                text: "\\v ",
            } as unknown as SerializedLexicalNode,
            sid: "REV 19:5",
            tokenType: UsfmTokenTypes.marker,
            marker: "v",
        });
        const number = (id: string): ChapterRenderToken => ({
            node: {
                type: "usfm-text-node",
                lexicalType: "usfm-text-node",
                version: 1,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                id,
                sid: "REV 19:5",
                tokenType: UsfmTokenTypes.numberRange,
                text: " 5",
            } as unknown as SerializedLexicalNode,
            sid: "REV 19:5",
            tokenType: UsfmTokenTypes.numberRange,
        });
        const text = (id: string, value: string): ChapterRenderToken => ({
            node: {
                type: "usfm-text-node",
                lexicalType: "usfm-text-node",
                version: 1,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                id,
                sid: "REV 19:5",
                tokenType: UsfmTokenTypes.text,
                text: value,
            } as unknown as SerializedLexicalNode,
            sid: "REV 19:5",
            tokenType: UsfmTokenTypes.text,
        });

        const diff = makeDiff({
            uniqueKey: "rev-19-5",
            semanticSid: "REV 19:5",
            status: "modified",
            originalRenderTokens: [
                marker("m-v"),
                number("n-v"),
                text("t-a", " alpha"),
                text("t-b", " beta"),
            ],
            currentRenderTokens: [
                marker("m-v"),
                number("n-v"),
                text("t-a", " alphaz"),
                text("t-b", " betaz"),
            ],
            originalAlignment: [
                { change: "unchanged", counterpartIndex: 0 },
                { change: "unchanged", counterpartIndex: 1 },
                { change: "modified", counterpartIndex: 2 },
                { change: "modified", counterpartIndex: 3 },
            ],
            currentAlignment: [
                { change: "unchanged", counterpartIndex: 0 },
                { change: "unchanged", counterpartIndex: 1 },
                { change: "modified", counterpartIndex: 2 },
                { change: "modified", counterpartIndex: 3 },
            ],
        });

        const originalTokens = buildChapterRenderParagraphs({
            diffs: [diff],
            viewType: "original",
        }).flatMap((paragraph) => paragraph.tokens);
        const currentTokens = buildChapterRenderParagraphs({
            diffs: [diff],
            viewType: "current",
        }).flatMap((paragraph) => paragraph.tokens);

        const originalTextChanges = originalTokens
            .filter((token) => token.token.tokenType === UsfmTokenTypes.text)
            .map((token) => token.tokenChange);
        const currentTextChanges = currentTokens
            .filter((token) => token.token.tokenType === UsfmTokenTypes.text)
            .map((token) => token.tokenChange);
        const hasAddDelete = [...originalTokens, ...currentTokens].some(
            (token) =>
                token.tokenChange === "added" ||
                token.tokenChange === "deleted",
        );

        expect(originalTextChanges).toEqual(["modified", "modified"]);
        expect(currentTextChanges).toEqual(["modified", "modified"]);
        expect(hasAddDelete).toBe(false);
    });
});
