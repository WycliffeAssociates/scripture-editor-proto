import type { SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";
import { USFM_TEXT_NODE_TYPE, UsfmTokenTypes } from "@/app/data/editor.ts";
import type { SerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { applyPrettifyToNodeTree } from "@/app/domain/editor/utils/prettifySerializedNode.ts";
import { TokenMap } from "@/core/domain/usfm/lex.ts";
import {
    collapseWhitespaceInTextNode,
    distributeCombinedVerseText,
    ensureSpaceBetweenNodes,
    insertDefaultParagraphAfterChapterIntro,
    insertLinebreakAfterChapterNumberRange,
    insertLinebreakAfterParaMarkers,
    insertLinebreakBeforeParaMarkers,
    normalizeSpacingAfterParaMarkers,
    type PrettifyToken,
    recoverMalformedMarkers,
    removeDuplicateVerseNumbers,
    removeUnwantedLinebreaks,
} from "@/core/domain/usfm/prettify/prettifyTokenStream.ts";

const createToken = (
    text: string,
    tokenType: string = UsfmTokenTypes.text,
    marker?: string,
) =>
    ({
        tokenType,
        text,
        marker,
        id: "test-id",
    }) as const;

const createNl = () =>
    ({
        tokenType: TokenMap.verticalWhitespace,
        text: "\n",
    }) as const;

const createSerializedTextNode = (
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
            const node = createToken("  multiple    spaces  ");
            const result = collapseWhitespaceInTextNode(node);
            expect(result.text).toBe(" multiple spaces ");
        });

        it("should not affect non-text tokens", () => {
            const node = createToken("  1  ", UsfmTokenTypes.numberRange);
            const result = collapseWhitespaceInTextNode(node);
            expect(result.text).toBe("  1  ");
        });
    });

    describe("ensureSpaceBetweenNodes", () => {
        it("should add space between Marker and Text if missing", () => {
            const markerNode = createToken("\\v", UsfmTokenTypes.marker, "v");
            const textNode = createToken("Text");
            const result = ensureSpaceBetweenNodes(textNode, {
                previousSibling: markerNode,
            });
            expect(result.text).toBe(" Text");
        });

        it("should add space between Marker and Marker if missing", () => {
            const markerNode1 = createToken("\\p", UsfmTokenTypes.marker, "p");
            // Note: createTextNode sets text to first arg.
            const markerNode2 = createToken("\\v", UsfmTokenTypes.marker, "v");
            const result = ensureSpaceBetweenNodes(markerNode2, {
                previousSibling: markerNode1,
            });
            expect(result.text).toBe(" \\v");
        });

        it("should NOT add space if previous sibling ends with space", () => {
            const prevNode = createToken("Text ");
            const node = createToken("More");
            const result = ensureSpaceBetweenNodes(node, {
                previousSibling: prevNode,
            });
            expect(result.text).toBe("More");
        });

        it("should NOT add space if current node starts with space", () => {
            const prevNode = createToken("Text");
            const node = createToken(" More");
            const result = ensureSpaceBetweenNodes(node, {
                previousSibling: prevNode,
            });
            expect(result.text).toBe(" More");
        });

        it("should ignore linebreaks", () => {
            const linebreak = createNl();
            const node = createToken("Text");
            const result = ensureSpaceBetweenNodes(node, {
                previousSibling: linebreak,
            });
            expect(result).toBe(node);
        });
    });

    describe("recoverMalformedMarkers", () => {
        it("should recover malformed marker and split node", () => {
            const node = createToken("\\ \\v 13 13 Text", UsfmTokenTypes.text);
            const result = recoverMalformedMarkers(node);

            expect(Array.isArray(result)).toBe(true);
            if (Array.isArray(result)) {
                expect(result).toHaveLength(2);

                const markerNode = result[0];
                const textNode = result[1];

                expect(markerNode.tokenType).toBe(UsfmTokenTypes.marker);
                expect(markerNode.marker).toBe("v");
                expect(markerNode.text).toBe("\\v");

                // Expect space to be preserved in text node
                expect(textNode.tokenType).toBe(UsfmTokenTypes.text);
                expect(textNode.text).toBe(" 13 13 Text");
            }
        });

        it("should return original node if no malformed marker found", () => {
            const node = createToken("some text");
            const result = recoverMalformedMarkers(node);
            expect(result).toBe(node);
        });

        it("should return original node if marker is invalid", () => {
            const node = createToken("\\ \\invalid 123");
            const result = recoverMalformedMarkers(node);
            expect(result).toBe(node);
        });
    });

    describe("insertLinebreakAfterChapterNumberRange", () => {
        it("should insert linebreak after chapter number range", () => {
            const node = createToken("1", UsfmTokenTypes.numberRange, "c");
            const result = insertLinebreakAfterChapterNumberRange(node, {});
            expect(Array.isArray(result)).toBe(true);
            if (Array.isArray(result)) {
                expect(result).toHaveLength(2);
                expect(result[1].tokenType).toBe(TokenMap.verticalWhitespace);
            }
        });

        it("should always insert linebreak even if one exists", () => {
            const node = createToken("1", UsfmTokenTypes.numberRange, "c");
            const result = insertLinebreakAfterChapterNumberRange(node, {
                nextSibling: createNl(),
            });
            expect(Array.isArray(result)).toBe(true);
            if (Array.isArray(result)) {
                expect(result).toHaveLength(2);
                expect(result[1].tokenType).toBe(TokenMap.verticalWhitespace);
            }
        });

        it("should insert linebreak if marker is missing but previous sibling is \\c", () => {
            const node = createToken("1", UsfmTokenTypes.numberRange); // No marker
            const prevSibling = createToken("\\c", UsfmTokenTypes.marker, "c");
            const result = insertLinebreakAfterChapterNumberRange(node, {
                previousSibling: prevSibling,
            });
            expect(Array.isArray(result)).toBe(true);
            if (Array.isArray(result)) {
                expect(result).toHaveLength(2);
                expect(result[1].tokenType).toBe(TokenMap.verticalWhitespace);
            }
        });
    });

    describe("removeDuplicateVerseNumbers", () => {
        it("should remove duplicate verse number from text node", () => {
            const verseNode = createToken("5", UsfmTokenTypes.numberRange, "v");
            const textNode = createToken(" 5 Can a bird...");
            const result = removeDuplicateVerseNumbers(textNode, {
                previousSibling: verseNode,
            });
            expect(result.text).toBe("Can a bird...");
        });

        it("should remove duplicate verse number even if no space after", () => {
            const verseNode = createToken("5", UsfmTokenTypes.numberRange, "v");
            const textNode = createToken("5Can a bird...");
            const result = removeDuplicateVerseNumbers(textNode, {
                previousSibling: verseNode,
            });
            expect(result.text).toBe("Can a bird...");
        });

        it("should remove duplicate verse number even if marker is missing on prev sibling", () => {
            const verseNode = createToken(
                "5",
                UsfmTokenTypes.numberRange,
                // No marker
            );
            const textNode = createToken(" 5 Can a bird...");
            const result = removeDuplicateVerseNumbers(textNode, {
                previousSibling: verseNode,
            });
            expect(result.text).toBe("Can a bird...");
        });

        it("should not remove if number does not match", () => {
            const verseNode = createToken("5", UsfmTokenTypes.numberRange, "v");
            const textNode = createToken(" 6 Can a bird...");
            const result = removeDuplicateVerseNumbers(textNode, {
                previousSibling: verseNode,
            });
            expect(result.text).toBe(" 6 Can a bird...");
        });
    });

    describe("insertLinebreakBeforeParaMarkers", () => {
        it("should insert linebreak before para marker", () => {
            const node = createToken("\\p", UsfmTokenTypes.marker, "p");
            const result = insertLinebreakBeforeParaMarkers(node, {
                previousSibling: createToken("some text"),
            });
            expect(Array.isArray(result)).toBe(true);
            if (Array.isArray(result)) {
                expect(result).toHaveLength(2);
                expect(result[0].tokenType).toBe(TokenMap.verticalWhitespace);
            }
        });

        it("should insert linebreak for poetry markers (ALWAYS)", () => {
            const node = createToken("\\q", UsfmTokenTypes.marker, "q");
            const result = insertLinebreakBeforeParaMarkers(node, {
                previousSibling: createToken("some text"),
                poetryMarkers: new Set(["q"]),
            });
            expect(Array.isArray(result)).toBe(true);
            if (Array.isArray(result)) {
                expect(result).toHaveLength(2);
                expect(result[0].tokenType).toBe(TokenMap.verticalWhitespace);
            }
        });
    });

    describe("insertLinebreakAfterParaMarkers", () => {
        it("should insert linebreak after normal para marker", () => {
            const node = createToken("\\p", UsfmTokenTypes.marker, "p");
            // Not poetry
            const result = insertLinebreakAfterParaMarkers(node, {
                poetryMarkers: new Set(["q"]),
            });
            expect(Array.isArray(result)).toBe(true);
            if (Array.isArray(result)) {
                expect(result).toHaveLength(2);
                expect(result[1].tokenType).toBe(TokenMap.verticalWhitespace);
            }
        });

        it("should NOT insert linebreak after poetry marker if next sibling is text", () => {
            const node = createToken("\\q", UsfmTokenTypes.marker, "q");
            const result = insertLinebreakAfterParaMarkers(node, {
                poetryMarkers: new Set(["q"]),
                nextSibling: createToken("some poetry text"),
            });
            expect(Array.isArray(result)).toBe(false);
        });

        it("should insert linebreak after poetry marker if next sibling is MARKER", () => {
            const node = createToken("\\q", UsfmTokenTypes.marker, "q");
            const result = insertLinebreakAfterParaMarkers(node, {
                poetryMarkers: new Set(["q"]),
                nextSibling: createToken("\\v", UsfmTokenTypes.marker, "v"),
            });
            expect(Array.isArray(result)).toBe(true);
            if (Array.isArray(result)) {
                expect(result).toHaveLength(2);
                expect(result[1].tokenType).toBe(TokenMap.verticalWhitespace);
            }
        });
    });

    describe("normalizeSpacingAfterParaMarkers", () => {
        it("should normalize spacing after para marker", () => {
            const markerNode = createToken("\\p", UsfmTokenTypes.marker, "p");
            const textNode = createToken("    some text");
            const result = normalizeSpacingAfterParaMarkers(textNode, {
                previousSibling: markerNode,
            });
            expect(Array.isArray(result)).toBe(false);
            if (!Array.isArray(result)) {
                expect(result.text).toBe(" some text");
            }
        });

        it("should normalize spacing after \\cl (BEFORE_ONLY marker)", () => {
            const markerNode = createToken("\\cl", UsfmTokenTypes.marker, "cl");
            const textNode = createToken("    some text");
            const result = normalizeSpacingAfterParaMarkers(textNode, {
                previousSibling: markerNode,
            });
            expect(Array.isArray(result)).toBe(false);
            if (!Array.isArray(result)) {
                expect(result.text).toBe(" some text");
            }
        });

        it("should normalize spacing after poetry marker", () => {
            const markerNode = createToken("\\q1", UsfmTokenTypes.marker, "q1");
            const textNode = createToken("    some poetry");
            const result = normalizeSpacingAfterParaMarkers(textNode, {
                previousSibling: markerNode,
                poetryMarkers: new Set(["q1"]),
            });
            expect(Array.isArray(result)).toBe(false);
            if (!Array.isArray(result)) {
                expect(result.text).toBe(" some poetry");
            }
        });
    });

    describe("removeUnwantedLinebreaks", () => {
        it("should remove linebreak between verse and verse", () => {
            const linebreak = createNl();
            const nextVerse = createToken("\\v", UsfmTokenTypes.marker, "v");

            const result = removeUnwantedLinebreaks(linebreak, {
                nextSibling: nextVerse,
            });

            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(0);
        });

        it("should keep linebreak between verse and para", () => {
            const linebreak = createNl();
            const nextPara = createToken("\\p", UsfmTokenTypes.marker, "p");

            const result = removeUnwantedLinebreaks(linebreak, {
                nextSibling: nextPara,
            });

            expect(result).toEqual(linebreak);
        });

        it("should keep linebreak between para marker and verse marker", () => {
            const linebreak = createNl();
            const prevPara = createToken("\\p", UsfmTokenTypes.marker, "p");
            const nextVerse = createToken("\\v", UsfmTokenTypes.marker, "v");

            const result = removeUnwantedLinebreaks(linebreak, {
                previousSibling: prevPara,
                nextSibling: nextVerse,
            });

            expect(result).toEqual(linebreak);
        });

        it("should keep linebreak if next sibling is text", () => {
            const linebreak = createNl();
            const nextText = createToken("some text");

            const result = removeUnwantedLinebreaks(linebreak, {
                nextSibling: nextText,
            });

            expect(result).toEqual(linebreak);
        });

        it("should remove linebreak after \\cl (BEFORE_ONLY marker)", () => {
            const linebreak = createNl();
            const prevCl = createToken("\\cl", UsfmTokenTypes.marker, "cl");

            const result = removeUnwantedLinebreaks(linebreak, {
                previousSibling: prevCl,
            });

            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(0);
        });

        it("should remove linebreak after poetry marker if followed by text", () => {
            const linebreak = createNl();
            const prevQ1 = createToken("\\q1", UsfmTokenTypes.marker, "q1");
            const nextText = createToken("poetry text");

            const result = removeUnwantedLinebreaks(linebreak, {
                previousSibling: prevQ1,
                nextSibling: nextText,
                poetryMarkers: new Set(["q1"]),
            });

            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(0);
        });

        it("should KEEP linebreak after poetry marker if followed by another marker", () => {
            const linebreak = createNl();
            const prevQ1 = createToken("\\q1", UsfmTokenTypes.marker, "q1");
            const nextV = createToken("\\v", UsfmTokenTypes.marker, "v");

            const result = removeUnwantedLinebreaks(linebreak, {
                previousSibling: prevQ1,
                nextSibling: nextV,
                poetryMarkers: new Set(["q1"]),
            });

            expect(result).toEqual(linebreak);
        });
    });

    describe("distributeCombinedVerseText", () => {
        it("should distribute combined verse text to respective verses", () => {
            // Input: \v 1 \v 2 1. TextOne 2. TextTwo
            const nodes = [
                createToken("\\v", UsfmTokenTypes.marker, "v"),
                createToken("1", UsfmTokenTypes.numberRange, "v"),
                createToken("\\v", UsfmTokenTypes.marker, "v"),
                createToken("2", UsfmTokenTypes.numberRange, "v"),
                createToken(" 1. TextOne 2. TextTwo"),
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

            expect(result[0].text).toBe("\\v");
            expect(result[1].text).toBe("1");

            // The text node for verse 1
            expect(result[2].text).toContain("TextOne");
            expect(result[2].tokenType).toBe(UsfmTokenTypes.text);

            expect(result[3].text).toBe("\\v");
            expect(result[4].text).toBe("2");

            // The preText node
            expect(result[5].text).toBe(" ");

            // The text node for verse 2
            expect(result[6].text).toContain("TextTwo");
            expect(result[6].tokenType).toBe(UsfmTokenTypes.text);
        });

        it("should handle three verses combined", () => {
            // Input: \v 1 \v 2 \v 3 1. One 2. Two 3. Three
            const nodes = [
                createToken("\\v", UsfmTokenTypes.marker, "v"),
                createToken("1", UsfmTokenTypes.numberRange, "v"),
                createToken("\\v", UsfmTokenTypes.marker, "v"),
                createToken("2", UsfmTokenTypes.numberRange, "v"),
                createToken("\\v", UsfmTokenTypes.marker, "v"),
                createToken("3", UsfmTokenTypes.numberRange, "v"),
                createToken(" 1. One 2. Two 3. Three"),
            ];

            const result = distributeCombinedVerseText(nodes);

            // 3 verses * 2 nodes + 3 text nodes + 1 preText = 10
            expect(result).toHaveLength(10);
            expect(result[2].text).toContain("One");
            expect(result[5].text).toContain("Two");
            // result[8] is preText " "
            expect(result[9].text).toContain("Three");
        });

        it("should handle leftover text", () => {
            // Input: \v 1 \v 2 1. One 2. Two Extra
            const nodes = [
                createToken("\\v", UsfmTokenTypes.marker, "v"),
                createToken("1", UsfmTokenTypes.numberRange, "v"),
                createToken("\\v", UsfmTokenTypes.marker, "v"),
                createToken("2", UsfmTokenTypes.numberRange, "v"),
                createToken(" 1. One 2. Two Extra"),
            ];

            const result = distributeCombinedVerseText(nodes);

            // Expected:
            // \v 1 One
            // \v 2 " " Two Extra

            expect(result).toHaveLength(7);
            expect(result[2].text).toContain("One");
            expect(result[6].text).toContain("Two Extra");
        });

        it("should not affect normal verses", () => {
            // Input: \v 1 TextOne \v 2 TextTwo
            const nodes = [
                createToken("\\v", UsfmTokenTypes.marker, "v"),
                createToken("1", UsfmTokenTypes.numberRange, "v"),
                createToken(" TextOne "),
                createToken("\\v", UsfmTokenTypes.marker, "v"),
                createToken("2", UsfmTokenTypes.numberRange, "v"),
                createToken(" TextTwo"),
            ];

            const result = distributeCombinedVerseText(nodes);

            expect(result).toHaveLength(6);
            expect(result).toEqual(nodes);
        });

        it("should handle mixed cases", () => {
            // Input: \v 1 TextOne \v 2 \v 3 2. TextTwo 3. TextThree
            // Note: Verse 2 is pending, Verse 3 is pending.
            // Text node "2. TextTwo 3. TextThree" comes after Verse 3.

            const nodes = [
                createToken("\\v", UsfmTokenTypes.marker, "v"),
                createToken("1", UsfmTokenTypes.numberRange, "v"),
                createToken(" TextOne "),
                createToken("\\v", UsfmTokenTypes.marker, "v"),
                createToken("2", UsfmTokenTypes.numberRange, "v"),
                createToken("\\v", UsfmTokenTypes.marker, "v"),
                createToken("3", UsfmTokenTypes.numberRange, "v"),
                createToken(" 2. TextTwo 3. TextThree"),
            ];

            const result = distributeCombinedVerseText(nodes);

            // v1 (2) + T1 (1) + v2 (2) + v3 (2) + T2 (1) + T3 (1) + preText (1) = 10
            expect(result).toHaveLength(10);
            // v 1 TextOne
            expect(result[2].text).toBe(" TextOne ");
            // v 2 TextTwo
            expect(result[5].text).toContain("TextTwo");
            // v 3 TextThree
            // result[8] is preText " "
            expect(result[9].text).toContain("TextThree");
        });
    });

    describe("insertDefaultParagraphAfterChapterIntro", () => {
        it("should insert a default \\p before first verse after chapter intro", () => {
            const tokens = [
                createToken("\\c", UsfmTokenTypes.marker, "c"),
                createToken("1", UsfmTokenTypes.numberRange, "c"),
                createNl(),
                createToken("\\v", UsfmTokenTypes.marker, "v"),
                createToken("1", UsfmTokenTypes.numberRange, "v"),
                createToken(" Text"),
            ];

            const result = insertDefaultParagraphAfterChapterIntro(tokens);

            const pIndex = result.findIndex(
                (t: PrettifyToken) =>
                    t.tokenType === UsfmTokenTypes.marker && t.marker === "p",
            );
            expect(pIndex).toBeGreaterThanOrEqual(0);

            const vIndex = result.findIndex(
                (t: PrettifyToken) =>
                    t.tokenType === UsfmTokenTypes.marker && t.marker === "v",
            );
            expect(pIndex).toBeLessThan(vIndex);
            expect(result[pIndex].text).toBe("\\p ");
        });

        it("should not insert default \\p if an explicit paragraph marker exists", () => {
            const tokens = [
                createToken("\\c", UsfmTokenTypes.marker, "c"),
                createToken("1", UsfmTokenTypes.numberRange, "c"),
                createNl(),
                createToken("\\p", UsfmTokenTypes.marker, "p"),
                createNl(),
                createToken("\\v", UsfmTokenTypes.marker, "v"),
                createToken("1", UsfmTokenTypes.numberRange, "v"),
            ];

            const result = insertDefaultParagraphAfterChapterIntro(tokens);
            const pMarkers = result.filter(
                (t: PrettifyToken) =>
                    t.tokenType === UsfmTokenTypes.marker && t.marker === "p",
            );
            expect(pMarkers).toHaveLength(1);
        });
    });

    describe("applyPrettifyToNodeTree", () => {
        it("should apply all transforms and remove duplicate linebreaks", () => {
            const nodes: SerializedLexicalNode[] = [
                createSerializedTextNode("\\p", UsfmTokenTypes.marker, "p"),
                createSerializedTextNode("    text with    spaces"),
                { type: "linebreak", version: 1 },
                { type: "linebreak", version: 1 },
                createSerializedTextNode("1", UsfmTokenTypes.numberRange, "c"),
            ];

            const result = applyPrettifyToNodeTree(nodes);

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe("paragraph");
            const children = (
                result[0] as { children?: SerializedLexicalNode[] }
            ).children as SerializedLexicalNode[];
            expect(children.map((n) => n.type)).toContain("linebreak");
            for (let i = 0; i < children.length - 1; i++) {
                if (children[i].type === "linebreak") {
                    expect(children[i + 1].type).not.toBe("linebreak");
                }
            }
        });

        it("should remove linebreak between verses in full tree", () => {
            const nodes: SerializedLexicalNode[] = [
                createSerializedTextNode("1", UsfmTokenTypes.numberRange, "v"),
                { type: "linebreak", version: 1 } as SerializedLexicalNode,
                createSerializedTextNode("\\v", UsfmTokenTypes.marker, "v"),
                createSerializedTextNode("2", UsfmTokenTypes.numberRange, "v"),
            ];

            const result = applyPrettifyToNodeTree(nodes);

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe("paragraph");
            const children = (
                result[0] as { children?: SerializedLexicalNode[] }
            ).children as SerializedLexicalNode[];
            expect(children).toHaveLength(3);
            expect(children[0].type).toBe(USFM_TEXT_NODE_TYPE);
            expect(children[1].type).toBe(USFM_TEXT_NODE_TYPE);
            expect((children[1] as SerializedUSFMTextNode).text).toBe(" \\v");
        });
    });

    it("should clear pending verses after processing text with no matches", () => {
        // Scenario: \v 1 Text \v 2
        // pendingVerses should be empty after "Text", so \v 1 doesn't match anything later.

        const nodes = [
            createToken("\\v", UsfmTokenTypes.marker, "v"),
            createToken("1", UsfmTokenTypes.numberRange, "v"),
            createToken(" Text for verse one "),
            createToken("\\v", UsfmTokenTypes.marker, "v"),
            createToken("2", UsfmTokenTypes.numberRange, "v"),
            createToken(" Text with number 1 inside "),
        ];

        const result = distributeCombinedVerseText(nodes);

        expect(result).toHaveLength(6);
        expect(result[2].text).toBe(" Text for verse one ");
        expect(result[5].text).toBe(" Text with number 1 inside ");
    });

    it("should clear pending verses when encountering a non-verse marker", () => {
        // Scenario: \v 1 \p Text
        // \p should clear pending verses.

        const nodes = [
            createToken("\\v", UsfmTokenTypes.marker, "v"),
            createToken("1", UsfmTokenTypes.numberRange, "v"),
            createToken("\\p", UsfmTokenTypes.marker, "p"),
            createToken(" Text 1 starts here"),
        ];

        const result = distributeCombinedVerseText(nodes);

        expect(result).toHaveLength(4);
        expect(result[3].text).toBe(" Text 1 starts here");
    });

    it("should not split text falsely when pending verses are cleared", () => {
        // Scenario: \v 5 ... 1,335 days
        // If \v 5 was processed and cleared, it shouldn't match "5 " in "1,335 days" later.

        const nodes = [
            createToken("\\v", UsfmTokenTypes.marker, "v"),
            createToken("5", UsfmTokenTypes.numberRange, "v"),
            createToken(" Normal text for five "),
            createToken("\\v", UsfmTokenTypes.marker, "v"),
            createToken("6", UsfmTokenTypes.numberRange, "v"),
            createToken(" 1,335 days "),
        ];

        const result = distributeCombinedVerseText(nodes);

        expect(result).toHaveLength(6);
        expect(result[2].text).toBe(" Normal text for five ");
        expect(result[5].text).toBe(" 1,335 days ");
    });

    it("should handle the complex poetry example from user requirements", () => {
        /*
        User Request Example:
        \q1 "Adah and Zillah, listen to my voice;
        \q2 you wives of Lamech, listen to my words.
        \q1 For I have killed a man for wounding me, 
        \q2 a young man for bruising me.
        \q1
        \v 24 If Cain is avenged seven times, 
        \q2 then Lamech will be avenged seventy-seven times."
        
        Expected Behavior:
        - q1, q2 followed by text -> same line (no linebreak after marker)
        - q1 followed by v marker -> new line after q1
        */

        const nodes: SerializedLexicalNode[] = [
            createSerializedTextNode("\\q1", UsfmTokenTypes.marker, "q1"),
            createSerializedTextNode(' "Adah...voice;'),
            createSerializedTextNode("\\q2", UsfmTokenTypes.marker, "q2"),
            createSerializedTextNode(" you wives...words."),
            createSerializedTextNode("\\q1", UsfmTokenTypes.marker, "q1"),
            createSerializedTextNode(" For I have..."),
            createSerializedTextNode("\\q2", UsfmTokenTypes.marker, "q2"),
            createSerializedTextNode(" a young man..."),
            createSerializedTextNode("\\q1", UsfmTokenTypes.marker, "q1"),
            createSerializedTextNode("\\v", UsfmTokenTypes.marker, "v"),
            createSerializedTextNode("24", UsfmTokenTypes.numberRange, "v"),
            createSerializedTextNode(" If Cain..."),
            createSerializedTextNode("\\q2", UsfmTokenTypes.marker, "q2"),
            createSerializedTextNode(" then Lamech..."),
        ];

        // We expect linebreaks to be inserted BEFORE all q and v markers (if not present)
        // We expect linebreaks AFTER q markers ONLY if followed by another marker (like the q1 -> v case)

        const result = applyPrettifyToNodeTree(nodes);
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("paragraph");
        const children = (result[0] as { children?: SerializedLexicalNode[] })
            .children as SerializedLexicalNode[];

        // Simplified expectations check
        // 1. \q1 -> No LB after
        // 2. \q2 -> No LB after
        // 3. \q1 -> No LB after
        // 4. \q2 -> No LB after
        // 5. \q1 -> WITH LB after (because next is \v)
        // 6. \v -> ...

        // Let's verify specific adjacencies

        const i = 0;
        // First q1
        expect(children[i]).toMatchObject({ marker: "q1" });
        expect(children[i + 1]).toMatchObject({
            type: USFM_TEXT_NODE_TYPE,
            tokenType: UsfmTokenTypes.text,
        }); // Immediate text

        // Skip to next q2
        // We expect a linebreak BEFORE q2
        const q2Index = children.findIndex(
            (n, idx) =>
                idx > 0 && (n as SerializedUSFMTextNode).marker === "q2",
        );
        expect(children[q2Index - 1].type).toBe("linebreak");
        expect(children[q2Index + 1].type).toBe(USFM_TEXT_NODE_TYPE); // Text follows q2

        // Skip to the q1 explicitly followed by v
        // The last q1 in our list is index 4 in original 'nodes', but indices shift with linebreaks.
        // It's the q1 before \v 24

        // Find index of \v
        const vIndex = children.findIndex(
            (n) => (n as SerializedUSFMTextNode).marker === "v",
        );
        expect(vIndex).toBeGreaterThan(0);

        // The node before \v should be a linebreak (because \v usually implies start of new chunk or q1 forced it)
        expect(children[vIndex - 1].type).toBe("linebreak");

        // The node before that linebreak should be q1
        expect(children[vIndex - 2]).toMatchObject({ marker: "q1" });

        // Verify that q1 did NOT have a linebreak before it if valid (it should have one BEFORE it, and one AFTER it in this specific case)
        expect(children[vIndex - 3].type).toBe("linebreak");
    });
});
