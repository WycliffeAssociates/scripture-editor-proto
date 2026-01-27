import type { SerializedElementNode, SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import type { SerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    extractMarkersFromSerialized,
    stripMarkersFromSerialized,
} from "./paragraphingUtils.ts";

// Helper to create a mock USFM Text Node
function createMockUSFMNode(
    tokenType: string,
    text: string,
    marker?: string,
): SerializedUSFMTextNode {
    return {
        type: "usfm-text-node",
        lexicalType: "usfm-text-node",
        tokenType,
        text,
        marker,
        id: "test-id",
        show: true,
        isMutable: true,
        version: 1,
        detail: 0,
        format: 0,
        mode: "normal",
        style: "",
    };
}

// Helper to create a mock Linebreak Node
function createMockLinebreak(): SerializedLexicalNode {
    return {
        type: "linebreak",
        version: 1,
    };
}

// Helper to create a mock Element Node
function createMockElementNode(
    children: SerializedLexicalNode[],
): SerializedElementNode {
    return {
        type: "paragraph",
        children,
        direction: "ltr",
        format: "",
        indent: 0,
        version: 1,
    };
}

describe("paragraphingUtils", () => {
    describe("extractMarkersFromSerialized", () => {
        it("should extract structural markers and track verse context", () => {
            const nodes: SerializedLexicalNode[] = [
                createMockUSFMNode(UsfmTokenTypes.marker, "\\c", "c"),
                createMockUSFMNode(UsfmTokenTypes.numberRange, "1", "c"),
                createMockUSFMNode(UsfmTokenTypes.marker, "\\p", "p"),
                createMockUSFMNode(UsfmTokenTypes.marker, "\\v", "v"),
                createMockUSFMNode(UsfmTokenTypes.numberRange, "1", "v"),
                createMockUSFMNode(UsfmTokenTypes.text, "Verse 1 text"),
                createMockUSFMNode(UsfmTokenTypes.marker, "\\q1", "q1"),
                createMockUSFMNode(UsfmTokenTypes.text, "Poetry text"),
                createMockUSFMNode(UsfmTokenTypes.marker, "\\v", "v"),
                createMockUSFMNode(UsfmTokenTypes.numberRange, "2", "v"),
                createMockUSFMNode(UsfmTokenTypes.marker, "\\q2", "q2"),
                createMockUSFMNode(UsfmTokenTypes.text, "More poetry"),
            ];

            const markers = extractMarkersFromSerialized(nodes);

            expect(markers).toHaveLength(3);
            expect(markers[0]).toEqual({ type: "p", text: "\\p", verse: "" }); // Verse 1 context from previous nodes? Wait, verse 1 comes AFTER p.
            // Let's trace:
            // 1. c 1 -> currentVerse = "" (initially)
            // 2. p -> marker extracted. verse is ""
            // 3. v 1 -> currentVerse = "1"
            // 4. q1 -> marker extracted. verse is "1"
            // 5. v 2 -> currentVerse = "2"
            // 6. q2 -> marker extracted. verse is "2"

            // So p should have empty verse if it precedes the verse marker.
            // If we want p to be associated with verse 1, it usually precedes it.
            // But strictly speaking, p is usually BEFORE v 1.

            expect(markers[0]).toEqual({ type: "p", text: "\\p", verse: "" });
            expect(markers[1]).toEqual({
                type: "q1",
                text: "\\q1",
                verse: "1",
            });
            expect(markers[2]).toEqual({
                type: "q2",
                text: "\\q2",
                verse: "2",
            });
        });

        it("should handle nested structures", () => {
            const nodes: SerializedLexicalNode[] = [
                createMockElementNode([
                    createMockUSFMNode(UsfmTokenTypes.marker, "\\p", "p"),
                    createMockUSFMNode(
                        UsfmTokenTypes.text,
                        "Text inside element",
                    ),
                ]),
            ];

            const markers = extractMarkersFromSerialized(nodes);
            expect(markers).toHaveLength(1);
            expect(markers[0].type).toBe("p");
        });
    });

    describe("stripMarkersFromSerialized", () => {
        it("should remove structural markers and linebreaks but keep text and verses", () => {
            const nodes: SerializedLexicalNode[] = [
                createMockLinebreak(),
                createMockUSFMNode(UsfmTokenTypes.marker, "\\p", "p"),
                createMockLinebreak(),
                createMockUSFMNode(UsfmTokenTypes.marker, "\\v", "v"),
                createMockUSFMNode(UsfmTokenTypes.numberRange, "1", "v"),
                createMockUSFMNode(UsfmTokenTypes.text, "Verse 1 text"),
                createMockLinebreak(),
                createMockUSFMNode(UsfmTokenTypes.marker, "\\q1", "q1"),
                createMockUSFMNode(UsfmTokenTypes.text, "Poetry text"),
            ];

            const cleaned = stripMarkersFromSerialized(nodes);

            // Expected: v, 1, Verse 1 text, Poetry text
            expect(cleaned).toHaveLength(4);

            const types = cleaned.map(
                (n) => (n as SerializedUSFMTextNode).tokenType,
            );
            expect(types).toEqual([
                UsfmTokenTypes.marker, // v
                UsfmTokenTypes.numberRange, // 1
                UsfmTokenTypes.text, // Verse 1 text
                UsfmTokenTypes.text, // Poetry text
            ]);

            const texts = cleaned.map(
                (n) => (n as SerializedUSFMTextNode).text,
            );
            expect(texts).toEqual(["\\v", "1", "Verse 1 text", "Poetry text"]);
        });

        it("should recurse into element nodes", () => {
            const nodes: SerializedLexicalNode[] = [
                createMockElementNode([
                    createMockUSFMNode(UsfmTokenTypes.marker, "\\p", "p"),
                    createMockUSFMNode(
                        UsfmTokenTypes.text,
                        "Text inside element",
                    ),
                ]),
            ];

            const cleaned = stripMarkersFromSerialized(nodes);
            expect(cleaned).toHaveLength(1);
            const element = cleaned[0] as SerializedElementNode;
            expect(element.children).toHaveLength(1);
            expect((element.children[0] as SerializedUSFMTextNode).text).toBe(
                "Text inside element",
            );
        });
    });
});
