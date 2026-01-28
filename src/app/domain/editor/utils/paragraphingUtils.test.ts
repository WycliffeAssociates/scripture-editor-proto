import type { SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { isSerializedParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    isSerializedUSFMTextNode,
    type SerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { createTestEditor } from "@/test/helpers/testEditor.ts";
import {
    extractMarkersFromSerialized,
    stripMarkersFromSerialized,
} from "./paragraphingUtils.ts";

function getSerializedChildren(usfmContent: string): SerializedLexicalNode[] {
    const editor = createTestEditor(usfmContent);
    return editor.getEditorState().toJSON().root.children;
}

describe("paragraphingUtils", () => {
    describe("extractMarkersFromSerialized", () => {
        it("should extract structural markers from paragraph containers", () => {
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
                .map((marker) => marker.type);

            // With tree structure, we get:
            // - default "p" container for \id content
            // - explicit "p" container from \p marker
            // - "q1" container from \q1 marker
            // - "q2" container from \q2 marker
            expect(paragraphingMarkers).toContain("p");
            expect(paragraphingMarkers).toContain("q1");
            expect(paragraphingMarkers).toContain("q2");
            expect(paragraphingMarkers.filter((m) => m === "p").length).toBe(2);
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
        it("should keep plain text and linebreaks, strip para/verse markers", () => {
            const nodes = getSerializedChildren(`\\id GEN
\\c 1
\\p
\\v 1 Verse 1 text
\\q1 Poetry text`);

            // stripMarkersFromSerialized now flattens paragraph containers
            const cleaned = stripMarkersFromSerialized(nodes);
            const cleanedMarkers = cleaned
                .filter(isSerializedUSFMTextNode)
                .filter((node) => node.tokenType === UsfmTokenTypes.marker)
                .map((node) => node.marker);

            // Should have kept "c" marker (chapter markers are preserved)
            expect(cleanedMarkers).toContain("c");
            // Should NOT have para/verse markers
            expect(cleanedMarkers).not.toContain("p");
            expect(cleanedMarkers).not.toContain("q1");
            expect(cleanedMarkers).not.toContain("v");
            // Number ranges after non-chapter markers should be stripped
            const numberRangesAfterNonChapter = cleaned.filter((node, i) => {
                if (!isSerializedUSFMTextNode(node)) return false;
                if (node.tokenType !== UsfmTokenTypes.numberRange) return false;
                if (i === 0) return false;
                const prev = cleaned[i - 1];
                const prevIsChapterMarker =
                    isSerializedUSFMTextNode(prev) &&
                    (prev as SerializedUSFMTextNode).marker === "c";
                return !prevIsChapterMarker;
            });
            expect(numberRangesAfterNonChapter).toHaveLength(0);
        });

        it("should flatten paragraph containers and strip their markers", () => {
            const nodes = getSerializedChildren(`\\id GEN
\\c 1
\\p
\\v 1 Text inside element`);

            const cleaned = stripMarkersFromSerialized(nodes);
            // Result should be flat - no paragraph containers
            expect(cleaned.some(isSerializedParagraphNode)).toBe(false);
            // And no paragraph markers
            const markerNodes = cleaned.filter(
                (node) =>
                    isSerializedUSFMTextNode(node) &&
                    node.tokenType === UsfmTokenTypes.marker,
            ) as SerializedUSFMTextNode[];
            expect(markerNodes.some((node) => node.marker === "p")).toBe(false);
            expect(markerNodes.some((node) => node.marker === "v")).toBe(false);
        });
    });
});
