import type { SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";
import { USFM_TEXT_NODE_TYPE, UsfmTokenTypes } from "@/app/data/editor.ts";
import type { SerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    applyPrettifyToNodeTree,
    collapseWhitespaceInTextNode,
    distributeCombinedVerseText,
    ensureSpaceBetweenNodes,
    insertLinebreakAfterChapterNumberRange,
    insertLinebreakAfterParaMarkers,
    insertLinebreakBeforeParaMarkers,
    normalizeSpacingAfterParaMarkers,
    recoverMalformedMarkers,
    removeDuplicateVerseNumbers,
    removeInterVerseLinebreaks,
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

    describe("ensureSpaceBetweenNodes", () => {
        it("should add space between Marker and Text if missing", () => {
            const markerNode = createTextNode(
                "\\v",
                UsfmTokenTypes.marker,
                "v",
            );
            const textNode = createTextNode("Text");
            const result = ensureSpaceBetweenNodes(textNode, {
                previousSibling: markerNode,
            });
            expect((result as SerializedUSFMTextNode).text).toBe(" Text");
        });

        it("should add space between Marker and Marker if missing", () => {
            const markerNode1 = createTextNode(
                "\\p",
                UsfmTokenTypes.marker,
                "p",
            );
            // Note: createTextNode sets text to first arg.
            const markerNode2 = createTextNode(
                "\\v",
                UsfmTokenTypes.marker,
                "v",
            );
            const result = ensureSpaceBetweenNodes(markerNode2, {
                previousSibling: markerNode1,
            });
            expect((result as SerializedUSFMTextNode).text).toBe(" \\v");
        });

        it("should NOT add space if previous sibling ends with space", () => {
            const prevNode = createTextNode("Text ");
            const node = createTextNode("More");
            const result = ensureSpaceBetweenNodes(node, {
                previousSibling: prevNode,
            });
            expect((result as SerializedUSFMTextNode).text).toBe("More");
        });

        it("should NOT add space if current node starts with space", () => {
            const prevNode = createTextNode("Text");
            const node = createTextNode(" More");
            const result = ensureSpaceBetweenNodes(node, {
                previousSibling: prevNode,
            });
            expect((result as SerializedUSFMTextNode).text).toBe(" More");
        });

        it("should ignore linebreaks", () => {
            const linebreak = {
                type: "linebreak",
                version: 1,
            } as SerializedLexicalNode;
            const node = createTextNode("Text");
            const result = ensureSpaceBetweenNodes(node, {
                previousSibling: linebreak,
            });
            expect(result).toBe(node);
        });
    });

    describe("recoverMalformedMarkers", () => {
        it("should recover malformed marker and split node", () => {
            const node = createTextNode(
                "\\ \\v 13 13 Text",
                UsfmTokenTypes.text,
            );
            const result = recoverMalformedMarkers(node);

            expect(Array.isArray(result)).toBe(true);
            if (Array.isArray(result)) {
                expect(result).toHaveLength(2);

                const markerNode = result[0] as SerializedUSFMTextNode;
                const textNode = result[1] as SerializedUSFMTextNode;

                expect(markerNode.tokenType).toBe(UsfmTokenTypes.marker);
                expect(markerNode.marker).toBe("v");
                expect(markerNode.text).toBe("\\v");

                // Expect space to be preserved in text node
                expect(textNode.tokenType).toBe(UsfmTokenTypes.text);
                expect(textNode.text).toBe(" 13 13 Text");
            }
        });

        it("should return original node if no malformed marker found", () => {
            const node = createTextNode("some text");
            const result = recoverMalformedMarkers(node);
            expect(result).toBe(node);
        });

        it("should return original node if marker is invalid", () => {
            const node = createTextNode("\\ \\invalid 123");
            const result = recoverMalformedMarkers(node);
            expect(result).toBe(node);
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

    describe("removeInterVerseLinebreaks", () => {
        it("should remove linebreak between verse and verse", () => {
            const linebreak = {
                type: "linebreak",
                version: 1,
            } as SerializedLexicalNode;
            const nextVerse = createTextNode("\\v", UsfmTokenTypes.marker, "v");

            const result = removeInterVerseLinebreaks(linebreak, {
                nextSibling: nextVerse,
            });

            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(0);
        });

        it("should keep linebreak between verse and para", () => {
            const linebreak = {
                type: "linebreak",
                version: 1,
            } as SerializedLexicalNode;
            const nextPara = createTextNode("\\p", UsfmTokenTypes.marker, "p");

            const result = removeInterVerseLinebreaks(linebreak, {
                nextSibling: nextPara,
            });

            expect(result).toEqual(linebreak);
        });

        it("should keep linebreak between para marker and verse marker", () => {
            const linebreak = {
                type: "linebreak",
                version: 1,
            } as SerializedLexicalNode;
            const prevPara = createTextNode("\\p", UsfmTokenTypes.marker, "p");
            const nextVerse = createTextNode("\\v", UsfmTokenTypes.marker, "v");

            const result = removeInterVerseLinebreaks(linebreak, {
                previousSibling: prevPara,
                nextSibling: nextVerse,
            });

            expect(result).toEqual(linebreak);
        });

        it("should keep linebreak if next sibling is text", () => {
            const linebreak = {
                type: "linebreak",
                version: 1,
            } as SerializedLexicalNode;
            const nextText = createTextNode("some text");

            const result = removeInterVerseLinebreaks(linebreak, {
                nextSibling: nextText,
            });

            expect(result).toEqual(linebreak);
        });
    });

    describe("distributeCombinedVerseText", () => {
        it("should distribute combined verse text to respective verses", () => {
            // Input: \v 1 \v 2 1. TextOne 2. TextTwo
            const nodes: SerializedLexicalNode[] = [
                createTextNode("\\v", UsfmTokenTypes.marker, "v"),
                createTextNode("1", UsfmTokenTypes.numberRange, "v"),
                createTextNode("\\v", UsfmTokenTypes.marker, "v"),
                createTextNode("2", UsfmTokenTypes.numberRange, "v"),
                createTextNode(" 1. TextOne 2. TextTwo"),
            ];

            const result = distributeCombinedVerseText(nodes);

            // Expected: \v 1 TextOne \v 2 TextTwo
            // Note: The implementation preserves the leading whitespace as a separate node
            // attached to the current context (verse 2).

            // 0: \v
            // 1: 1
            // 2: TextOne (inserted)
            // 3: \v
            // 4: 2
            // 5: " " (preText)
            // 6: TextTwo (inserted)

            expect(result).toHaveLength(7);

            expect((result[0] as SerializedUSFMTextNode).text).toBe("\\v");
            expect((result[1] as SerializedUSFMTextNode).text).toBe("1");

            // The text node for verse 1
            expect((result[2] as SerializedUSFMTextNode).text).toContain(
                "TextOne",
            );
            expect((result[2] as SerializedUSFMTextNode).tokenType).toBe(
                UsfmTokenTypes.text,
            );

            expect((result[3] as SerializedUSFMTextNode).text).toBe("\\v");
            expect((result[4] as SerializedUSFMTextNode).text).toBe("2");

            // The preText node
            expect((result[5] as SerializedUSFMTextNode).text).toBe(" ");

            // The text node for verse 2
            expect((result[6] as SerializedUSFMTextNode).text).toContain(
                "TextTwo",
            );
            expect((result[6] as SerializedUSFMTextNode).tokenType).toBe(
                UsfmTokenTypes.text,
            );
        });

        it("should handle three verses combined", () => {
            // Input: \v 1 \v 2 \v 3 1. One 2. Two 3. Three
            const nodes: SerializedLexicalNode[] = [
                createTextNode("\\v", UsfmTokenTypes.marker, "v"),
                createTextNode("1", UsfmTokenTypes.numberRange, "v"),
                createTextNode("\\v", UsfmTokenTypes.marker, "v"),
                createTextNode("2", UsfmTokenTypes.numberRange, "v"),
                createTextNode("\\v", UsfmTokenTypes.marker, "v"),
                createTextNode("3", UsfmTokenTypes.numberRange, "v"),
                createTextNode(" 1. One 2. Two 3. Three"),
            ];

            const result = distributeCombinedVerseText(nodes);

            // 3 verses * 2 nodes + 3 text nodes + 1 preText = 10
            expect(result).toHaveLength(10);
            expect((result[2] as SerializedUSFMTextNode).text).toContain("One");
            expect((result[5] as SerializedUSFMTextNode).text).toContain("Two");
            // result[8] is preText " "
            expect((result[9] as SerializedUSFMTextNode).text).toContain(
                "Three",
            );
        });

        it("should handle leftover text", () => {
            // Input: \v 1 \v 2 1. One 2. Two Extra
            const nodes: SerializedLexicalNode[] = [
                createTextNode("\\v", UsfmTokenTypes.marker, "v"),
                createTextNode("1", UsfmTokenTypes.numberRange, "v"),
                createTextNode("\\v", UsfmTokenTypes.marker, "v"),
                createTextNode("2", UsfmTokenTypes.numberRange, "v"),
                createTextNode(" 1. One 2. Two Extra"),
            ];

            const result = distributeCombinedVerseText(nodes);

            // Expected:
            // \v 1 One
            // \v 2 " " Two Extra

            expect(result).toHaveLength(7);
            expect((result[2] as SerializedUSFMTextNode).text).toContain("One");
            expect((result[6] as SerializedUSFMTextNode).text).toContain(
                "Two Extra",
            );
        });

        it("should not affect normal verses", () => {
            // Input: \v 1 TextOne \v 2 TextTwo
            const nodes: SerializedLexicalNode[] = [
                createTextNode("\\v", UsfmTokenTypes.marker, "v"),
                createTextNode("1", UsfmTokenTypes.numberRange, "v"),
                createTextNode(" TextOne "),
                createTextNode("\\v", UsfmTokenTypes.marker, "v"),
                createTextNode("2", UsfmTokenTypes.numberRange, "v"),
                createTextNode(" TextTwo"),
            ];

            const result = distributeCombinedVerseText(nodes);

            expect(result).toHaveLength(6);
            expect(result).toEqual(nodes);
        });

        it("should handle mixed cases", () => {
            // Input: \v 1 TextOne \v 2 \v 3 2. TextTwo 3. TextThree
            // Note: Verse 2 is pending, Verse 3 is pending.
            // Text node "2. TextTwo 3. TextThree" comes after Verse 3.

            const nodes: SerializedLexicalNode[] = [
                createTextNode("\\v", UsfmTokenTypes.marker, "v"),
                createTextNode("1", UsfmTokenTypes.numberRange, "v"),
                createTextNode(" TextOne "),
                createTextNode("\\v", UsfmTokenTypes.marker, "v"),
                createTextNode("2", UsfmTokenTypes.numberRange, "v"),
                createTextNode("\\v", UsfmTokenTypes.marker, "v"),
                createTextNode("3", UsfmTokenTypes.numberRange, "v"),
                createTextNode(" 2. TextTwo 3. TextThree"),
            ];

            const result = distributeCombinedVerseText(nodes);

            // v1 (2) + T1 (1) + v2 (2) + v3 (2) + T2 (1) + T3 (1) + preText (1) = 10
            expect(result).toHaveLength(10);
            // v 1 TextOne
            expect((result[2] as SerializedUSFMTextNode).text).toBe(
                " TextOne ",
            );
            // v 2 TextTwo
            expect((result[5] as SerializedUSFMTextNode).text).toContain(
                "TextTwo",
            );
            // v 3 TextThree
            // result[8] is preText " "
            expect((result[9] as SerializedUSFMTextNode).text).toContain(
                "TextThree",
            );
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

        it("should remove linebreak between verses in full tree", () => {
            const nodes: SerializedLexicalNode[] = [
                createTextNode("1", UsfmTokenTypes.numberRange, "v"),
                { type: "linebreak", version: 1 } as SerializedLexicalNode,
                createTextNode("\\v", UsfmTokenTypes.marker, "v"),
                createTextNode("2", UsfmTokenTypes.numberRange, "v"),
            ];

            const result = applyPrettifyToNodeTree(nodes);

            expect(result).toHaveLength(3);
            expect(result[0].type).toBe(USFM_TEXT_NODE_TYPE);
            expect(result[1].type).toBe(USFM_TEXT_NODE_TYPE);
            // ensureSpaceBetweenNodes adds a space because "1" doesn't end with space
            expect((result[1] as SerializedUSFMTextNode).text).toBe(" \\v");
        });
    });

    it("should clear pending verses after processing text with no matches", () => {
        // Scenario: \v 1 Text \v 2
        // pendingVerses should be empty after "Text", so \v 1 doesn't match anything later.

        const nodes: SerializedLexicalNode[] = [
            createTextNode("\\v", UsfmTokenTypes.marker, "v"),
            createTextNode("1", UsfmTokenTypes.numberRange, "v"),
            // Text that does NOT contain "1" followed by space/dot/paren
            createTextNode(" Text for verse one "),
            createTextNode("\\v", UsfmTokenTypes.marker, "v"),
            createTextNode("2", UsfmTokenTypes.numberRange, "v"),
            // This text contains "1 " which would match verse 1 if it was still pending
            createTextNode(" Text with number 1 inside "),
        ];

        const result = distributeCombinedVerseText(nodes);

        expect(result).toHaveLength(6);
        expect((result[2] as SerializedUSFMTextNode).text).toBe(
            " Text for verse one ",
        );
        expect((result[5] as SerializedUSFMTextNode).text).toBe(
            " Text with number 1 inside ",
        );
    });

    it("should clear pending verses when encountering a non-verse marker", () => {
        // Scenario: \v 1 \p Text
        // \p should clear pending verses.

        const nodes: SerializedLexicalNode[] = [
            createTextNode("\\v", UsfmTokenTypes.marker, "v"),
            createTextNode("1", UsfmTokenTypes.numberRange, "v"),
            createTextNode("\\p", UsfmTokenTypes.marker, "p"),
            // Text containing "1 "
            createTextNode(" Text 1 starts here"),
        ];

        const result = distributeCombinedVerseText(nodes);

        expect(result).toHaveLength(4);
        expect((result[3] as SerializedUSFMTextNode).text).toBe(
            " Text 1 starts here",
        );
    });

    it("should not split text falsely when pending verses are cleared", () => {
        // Scenario: \v 5 ... 1,335 days
        // If \v 5 was processed and cleared, it shouldn't match "5 " in "1,335 days" later.

        const nodes: SerializedLexicalNode[] = [
            createTextNode("\\v", UsfmTokenTypes.marker, "v"),
            createTextNode("5", UsfmTokenTypes.numberRange, "v"),
            createTextNode(" Normal text for five "),
            createTextNode("\\v", UsfmTokenTypes.marker, "v"),
            createTextNode("6", UsfmTokenTypes.numberRange, "v"),
            createTextNode(" 1,335 days "),
        ];

        const result = distributeCombinedVerseText(nodes);

        expect(result).toHaveLength(6);
        expect((result[2] as SerializedUSFMTextNode).text).toBe(
            " Normal text for five ",
        );
        expect((result[5] as SerializedUSFMTextNode).text).toBe(" 1,335 days ");
    });
});
