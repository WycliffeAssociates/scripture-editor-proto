import type { SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";
import { createSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { buildSidContentMapForChapter } from "@/app/domain/editor/serialization/lexicalToUsfm.ts";

describe("lexicalToUsfm", () => {
    describe("buildSidContentMapForChapter", () => {
        it("should create a new verse block when encountering a new SID", () => {
            const chapterNodeList = [
                createSerializedUSFMTextNode({
                    id: "test-id-1",
                    sid: "GEN 1:1",
                    text: "\\v ",
                    tokenType: "verseMarker",
                }),
            ];

            const result = buildSidContentMapForChapter(chapterNodeList);

            expect(result["GEN 1:1"]).toBeDefined();
            expect(result["GEN 1:1"].semanticSid).toBe("GEN 1:1");
            expect(result["GEN 1:1"].nodes.length).toBeGreaterThan(0);
            expect(result["GEN 1:1"].displaySid).toBe("GEN 1:1");
            expect(result["GEN 1:1"].previousSid).toBeNull();
        });

        it("should detect out-of-order verses and set detail", () => {
            const chapterNodeList = [
                createSerializedUSFMTextNode({
                    id: "test-id-1",
                    sid: "GEN 1:1",
                    text: "\\v ",
                    tokenType: "verseMarker",
                }),
                createSerializedUSFMTextNode({
                    id: "test-id-2",
                    sid: "GEN 1:3",
                    text: "\\v ",
                    tokenType: "verseMarker",
                }),
            ];

            const result = buildSidContentMapForChapter(chapterNodeList);

            expect(result["GEN 1:3"]).toBeDefined();
            expect(result["GEN 1:3"].detail).toBe(
                "Out of order (expected v. 2)",
            );
        });

        it("should set previousBlockKey correctly", () => {
            const chapterNodeList = [
                createSerializedUSFMTextNode({
                    id: "test-id-1",
                    sid: "GEN 1:1",
                    text: "\\v ",
                    tokenType: "verseMarker",
                }),
                createSerializedUSFMTextNode({
                    id: "test-id-2",
                    sid: "GEN 1:2",
                    text: "\\v ",
                    tokenType: "verseMarker",
                }),
            ];

            const result = buildSidContentMapForChapter(chapterNodeList);

            expect(result["GEN 1:1"].previousSid).toBeNull();
            expect(result["GEN 1:2"].previousSid).toBe("GEN 1:1");
        });

        it("should increment blockCounter for each new verse", () => {
            const chapterNodeList = [
                createSerializedUSFMTextNode({
                    id: "test-id-1",
                    sid: "GEN 1:1",
                    text: "\\v ",
                    tokenType: "verseMarker",
                }),
                createSerializedUSFMTextNode({
                    id: "test-id-2",
                    sid: "GEN 1:2",
                    text: "\\v ",
                    tokenType: "verseMarker",
                }),
            ];

            const result = buildSidContentMapForChapter(chapterNodeList);

            expect(result["GEN 1:1"].foundOrder).toBe(0);
            expect(result["GEN 1:2"].foundOrder).toBe(1);
        });

        it("should handle nested element nodes with children", () => {
            const chapterNodeList = [
                createSerializedUSFMTextNode({
                    id: "test-id-1",
                    sid: "GEN 1:1",
                    text: "\\v ",
                    tokenType: "verseMarker",
                }),
                {
                    type: "paragraph",
                    children: [
                        createSerializedUSFMTextNode({
                            id: "test-id-2",
                            sid: "GEN 1:1",
                            text: "Some text content",
                            tokenType: "text",
                        }),
                        {
                            type: "linebreak",
                        },
                        createSerializedUSFMTextNode({
                            id: "test-id-3",
                            sid: "GEN 1:1",
                            text: "More text",
                            tokenType: "text",
                        }),
                    ],
                } as {
                    type: string;
                    version: number;
                    children: (
                        | SerializedLexicalNode
                        | { type: string; version?: number }
                    )[];
                },
            ];

            const result = buildSidContentMapForChapter(chapterNodeList);

            expect(result["GEN 1:1"]).toBeDefined();
            expect(result["GEN 1:1"].nodes.length).toBe(4); // verse marker + 3 nested children
            expect(result["GEN 1:1"].plainTextStructure).toBe(
                "Some text content\nMore text",
            );
        });

        it("should handle follower nodes (line breaks) correctly", () => {
            const chapterNodeList = [
                createSerializedUSFMTextNode({
                    id: "test-id-1",
                    sid: "GEN 1:1",
                    text: "\\v ",
                    tokenType: "verseMarker",
                }),
                createSerializedUSFMTextNode({
                    id: "test-id-2",
                    sid: "GEN 1:1",
                    text: "Verse text",
                    tokenType: "text",
                }),
                {
                    type: "linebreak",
                    version: 1,
                } as SerializedLexicalNode,
                createSerializedUSFMTextNode({
                    id: "test-id-3",
                    sid: "GEN 1:1",
                    text: "More verse text",
                    tokenType: "text",
                }),
            ];

            const result = buildSidContentMapForChapter(chapterNodeList);

            expect(result["GEN 1:1"]).toBeDefined();
            expect(result["GEN 1:1"].nodes.length).toBe(4); // verse marker + 3 nodes
            expect(result["GEN 1:1"].plainTextStructure).toBe(
                "Verse text\nMore verse text",
            );
            expect(result["GEN 1:1"].fullText).toBe(
                "\\v Verse text\nMore verse text",
            );
        });
    });
});
