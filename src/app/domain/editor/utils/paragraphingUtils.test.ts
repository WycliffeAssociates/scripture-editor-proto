import type { SerializedElementNode, SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { isSerializedElementNode } from "@/app/domain/editor/nodes/USFMElementNode.ts";
import {
    isSerializedUSFMTextNode,
    type SerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { walkNodes } from "@/app/domain/editor/utils/serializedTraversal.ts";
import { createTestEditor } from "@/test/helpers/testEditor.ts";
import {
    extractMarkersFromSerialized,
    stripMarkersFromSerialized,
} from "./paragraphingUtils.ts";

function getSerializedChildren(usfmContent: string): SerializedLexicalNode[] {
    const editor = createTestEditor(usfmContent);
    return editor.getEditorState().toJSON().root.children;
}

function flattenNodes(nodes: SerializedLexicalNode[]): SerializedLexicalNode[] {
    return Array.from(walkNodes(nodes)).filter(
        (node) => isSerializedUSFMTextNode(node) || node.type === "linebreak",
    );
}

describe("paragraphingUtils", () => {
    describe("extractMarkersFromSerialized", () => {
        it("should extract structural markers and track verse context", () => {
            const nodes = getSerializedChildren(`\\id GEN
\\c 1
\\p
\\v 1 Verse 1 text
\\q1 Poetry text
\\v 2 Verse 2 text
\\q2 More poetry`);

            const markers = extractMarkersFromSerialized(nodes);
            const paragraphingMarkers = markers
                .filter((marker) => ["p", "q1", "q2"].includes(marker.type))
                .map((marker) => ({
                    type: marker.type,
                    verse: marker.verse,
                }));

            expect(paragraphingMarkers).toEqual([
                { type: "p", verse: "" },
                { type: "q1", verse: "1" },
                { type: "q2", verse: "2" },
            ]);
        });

        it("should read markers inside nested elements", () => {
            const nodes = getSerializedChildren(`\\id GEN
\\c 1
\\p
\\v 1 Text inside element`);

            const markers = extractMarkersFromSerialized(nodes);

            expect(markers.some((marker) => marker.type === "p")).toBe(true);
        });
    });

    describe("stripMarkersFromSerialized", () => {
        it("should keep plain text and linebreaks", () => {
            const nodes = getSerializedChildren(`\\id GEN
\\c 1
\\p
\\v 1 Verse 1 text
\\q1 Poetry text`);

            const paragraphNode = nodes.find(isSerializedElementNode);
            if (!paragraphNode) throw new Error("Missing paragraph node");

            const nodesToClean: SerializedLexicalNode[] = [
                { type: "linebreak", version: 1 },
                ...(paragraphNode as SerializedElementNode).children,
            ];

            const cleaned = stripMarkersFromSerialized(nodesToClean);
            const cleanedMarkers = cleaned
                .filter(isSerializedUSFMTextNode)
                .filter((node) => node.tokenType === UsfmTokenTypes.marker)
                .map((node) => node.marker);

            expect(cleaned.some((node) => node.type === "linebreak")).toBe(
                true,
            );
            expect(cleanedMarkers).not.toContain("p");
            expect(cleanedMarkers).not.toContain("q1");
            expect(cleanedMarkers).not.toContain("v");
            expect(
                cleaned.some(
                    (node) =>
                        isSerializedUSFMTextNode(node) &&
                        node.tokenType === UsfmTokenTypes.numberRange,
                ),
            ).toBe(false);
        });

        it("should recurse into element nodes", () => {
            const nodes = getSerializedChildren(`\\id GEN
\\c 1
\\p
\\v 1 Text inside element`);

            const cleaned = stripMarkersFromSerialized(nodes);
            const cleanedFlat = flattenNodes(cleaned).filter(
                (node) =>
                    isSerializedUSFMTextNode(node) &&
                    node.tokenType === UsfmTokenTypes.marker,
            ) as SerializedUSFMTextNode[];

            expect(cleanedFlat.some((node) => node.marker === "p")).toBe(false);
        });
    });
});
