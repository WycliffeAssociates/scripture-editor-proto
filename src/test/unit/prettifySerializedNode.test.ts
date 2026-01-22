import type { SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";
import { USFM_TEXT_NODE_TYPE, UsfmTokenTypes } from "@/app/data/editor.ts";
import type { SerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    applyPrettifyToNodeTree,
    collapseWhitespaceInTextNode,
    insertLinebreakAfterChapterNumberRange,
    insertLinebreakAfterParaMarkers,
    insertLinebreakBeforeParaMarkers,
    normalizeSpacingAfterParaMarkers,
    removeDuplicateVerseNumbers,
} from "@/app/domain/editor/utils/prettifySerializedNode.ts";

const createTextNode = (
    text: string,
    tokenType: string = UsfmTokenTypes.text,
    marker?: string,
): SerializedUSFMTextNode => ({
    type: USFM_TEXT_NODE_TYPE,
    lexicalType: USFM_TEXT_NODE_TYPE,
    tokenType,
    text,
    marker,
    show: true,
    isMutable: true,
    id: "test-id",
    version: 1,
    detail: 0,
    format: 0,
    mode: "normal",
    style: "",
});

describe("prettifySerializedNode utils", () => {
    describe("collapseWhitespaceInTextNode", () => {
        it("should collapse multiple spaces into one", () => {
            const node = createTextNode("  multiple    spaces  ");
            const result = collapseWhitespaceInTextNode(node);
            expect(result.text).toBe(" multiple spaces ");
        });

        it("should not affect non-text tokens", () => {
            const node = createTextNode("  1  ", UsfmTokenTypes.numberRange);
            const result = collapseWhitespaceInTextNode(node);
            expect(result.text).toBe("  1  ");
        });
    });

    describe("insertLinebreakAfterChapterNumberRange", () => {
        it("should insert linebreak after chapter number range", () => {
            const node = createTextNode("1", UsfmTokenTypes.numberRange, "c");
            const result = insertLinebreakAfterChapterNumberRange(node, {});
            expect(Array.isArray(result)).toBe(true);
            if (Array.isArray(result)) {
                expect(result).toHaveLength(2);
                expect(result[1].type).toBe("linebreak");
            }
        });

        it("should always insert linebreak even if one exists", () => {
            const node = createTextNode("1", UsfmTokenTypes.numberRange, "c");
            const result = insertLinebreakAfterChapterNumberRange(node, {
                nextSibling: { type: "linebreak", version: 1 },
            });
            expect(Array.isArray(result)).toBe(true);
            if (Array.isArray(result)) {
                expect(result).toHaveLength(2);
                expect(result[1].type).toBe("linebreak");
            }
        });

        it("should insert linebreak if marker is missing but previous sibling is \\c", () => {
            const node = createTextNode("1", UsfmTokenTypes.numberRange); // No marker
            const prevSibling = createTextNode(
                "\\c",
                UsfmTokenTypes.marker,
                "c",
            );
            const result = insertLinebreakAfterChapterNumberRange(node, {
                previousSibling: prevSibling,
            });
            expect(Array.isArray(result)).toBe(true);
            if (Array.isArray(result)) {
                expect(result).toHaveLength(2);
                expect(result[1].type).toBe("linebreak");
            }
        });
    });

    describe("removeDuplicateVerseNumbers", () => {
        it("should remove duplicate verse number from text node", () => {
            const verseNode = createTextNode(
                "5",
                UsfmTokenTypes.numberRange,
                "v",
            );
            const textNode = createTextNode(" 5 Can a bird...");
            const result = removeDuplicateVerseNumbers(textNode, {
                previousSibling: verseNode,
            });
            expect((result as SerializedUSFMTextNode).text).toBe(
                "Can a bird...",
            );
        });

        it("should remove duplicate verse number even if no space after", () => {
            const verseNode = createTextNode(
                "5",
                UsfmTokenTypes.numberRange,
                "v",
            );
            const textNode = createTextNode("5Can a bird...");
            const result = removeDuplicateVerseNumbers(textNode, {
                previousSibling: verseNode,
            });
            expect((result as SerializedUSFMTextNode).text).toBe(
                "Can a bird...",
            );
        });

        it("should remove duplicate verse number even if marker is missing on prev sibling", () => {
            const verseNode = createTextNode(
                "5",
                UsfmTokenTypes.numberRange,
                // No marker
            );
            const textNode = createTextNode(" 5 Can a bird...");
            const result = removeDuplicateVerseNumbers(textNode, {
                previousSibling: verseNode,
            });
            expect((result as SerializedUSFMTextNode).text).toBe(
                "Can a bird...",
            );
        });

        it("should not remove if number does not match", () => {
            const verseNode = createTextNode(
                "5",
                UsfmTokenTypes.numberRange,
                "v",
            );
            const textNode = createTextNode(" 6 Can a bird...");
            const result = removeDuplicateVerseNumbers(textNode, {
                previousSibling: verseNode,
            });
            expect((result as SerializedUSFMTextNode).text).toBe(
                " 6 Can a bird...",
            );
        });
    });

    describe("insertLinebreakBeforeParaMarkers", () => {
        it("should insert linebreak before para marker", () => {
            const node = createTextNode("\\p", UsfmTokenTypes.marker, "p");
            const result = insertLinebreakBeforeParaMarkers(node, {
                previousSibling: createTextNode("some text"),
            });
            expect(Array.isArray(result)).toBe(true);
            if (Array.isArray(result)) {
                expect(result).toHaveLength(2);
                expect(result[0].type).toBe("linebreak");
            }
        });

        it("should insert linebreak for poetry markers (ALWAYS)", () => {
            const node = createTextNode("\\q", UsfmTokenTypes.marker, "q");
            const result = insertLinebreakBeforeParaMarkers(node, {
                previousSibling: createTextNode("some text"),
                poetryMarkers: new Set(["q"]),
            });
            expect(Array.isArray(result)).toBe(true);
            if (Array.isArray(result)) {
                expect(result).toHaveLength(2);
                expect(result[0].type).toBe("linebreak");
            }
        });
    });

    describe("insertLinebreakAfterParaMarkers", () => {
        it("should insert linebreak after normal para marker", () => {
            const node = createTextNode("\\p", UsfmTokenTypes.marker, "p");
            // Not poetry
            const result = insertLinebreakAfterParaMarkers(node, {
                poetryMarkers: new Set(["q"]),
            });
            expect(Array.isArray(result)).toBe(true);
            if (Array.isArray(result)) {
                expect(result).toHaveLength(2);
                expect(result[1].type).toBe("linebreak");
            }
        });

        it("should NOT insert linebreak after poetry marker if next sibling is text", () => {
            const node = createTextNode("\\q", UsfmTokenTypes.marker, "q");
            const result = insertLinebreakAfterParaMarkers(node, {
                poetryMarkers: new Set(["q"]),
                nextSibling: createTextNode("some poetry text"),
            });
            expect(Array.isArray(result)).toBe(false);
        });

        it("should insert linebreak after poetry marker if next sibling is MARKER", () => {
            const node = createTextNode("\\q", UsfmTokenTypes.marker, "q");
            const result = insertLinebreakAfterParaMarkers(node, {
                poetryMarkers: new Set(["q"]),
                nextSibling: createTextNode("\\v", UsfmTokenTypes.marker, "v"),
            });
            expect(Array.isArray(result)).toBe(true);
            if (Array.isArray(result)) {
                expect(result).toHaveLength(2);
                expect(result[1].type).toBe("linebreak");
            }
        });
    });

    describe("normalizeSpacingAfterParaMarkers", () => {
        it("should normalize spacing after para marker", () => {
            const markerNode = createTextNode(
                "\\p",
                UsfmTokenTypes.marker,
                "p",
            );
            const textNode = createTextNode("    some text");
            const result = normalizeSpacingAfterParaMarkers(textNode, {
                previousSibling: markerNode,
            });
            expect(Array.isArray(result)).toBe(false);
            if (!Array.isArray(result)) {
                expect((result as SerializedUSFMTextNode).text).toBe(
                    " some text",
                );
            }
        });
    });

    describe("applyPrettifyToNodeTree", () => {
        it("should apply all transforms and remove duplicate linebreaks", () => {
            const nodes: SerializedLexicalNode[] = [
                createTextNode("\\p", UsfmTokenTypes.marker, "p"),
                createTextNode("    text with    spaces"),
                { type: "linebreak", version: 1 },
                { type: "linebreak", version: 1 },
                createTextNode("1", UsfmTokenTypes.numberRange, "c"),
            ];

            const result = applyPrettifyToNodeTree(nodes);

            expect(result.map((n) => n.type)).toContain("linebreak");
            // Should not have consecutive linebreaks
            for (let i = 0; i < result.length - 1; i++) {
                if (result[i].type === "linebreak") {
                    expect(result[i + 1].type).not.toBe("linebreak");
                }
            }
        });
    });
});
