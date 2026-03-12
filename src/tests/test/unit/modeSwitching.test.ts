// Test to verify that data-id values are preserved when switching from raw to regular mode
import { describe, expect, it } from "vitest";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { createSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { materializeFlatTokensArray } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";

describe("Mode Switching Data ID Preservation", () => {
    it("should preserve data-id when adjusting serialized nodes", () => {
        // Create a serialized node with a specific ID
        const originalId = "test-original-id-123";
        const serializedNode = createSerializedUSFMTextNode({
            text: "\\p test text",
            id: originalId,
            sid: "test-sid",
            tokenType: UsfmTokenTypes.marker,
            marker: "p",
        });

        const adjustedNodes = materializeFlatTokensArray([serializedNode], {
            nested: "flatten",
        });

        // Verify the ID is preserved
        expect(adjustedNodes).toHaveLength(1);
        if (!("id" in adjustedNodes[0])) {
            throw new Error("adjustedNodes[0] does not have an id property");
        }
        expect(adjustedNodes[0].id).toBe(originalId);
    });

    it("should preserve data-id in nested structures", () => {
        const originalId1 = "nested-id-1";
        const originalId2 = "nested-id-2";

        const node1 = createSerializedUSFMTextNode({
            text: "\\v 1",
            id: originalId1,
            sid: "test-sid",
            tokenType: UsfmTokenTypes.marker,
            marker: "v",
        });

        const node2 = createSerializedUSFMTextNode({
            text: "Verse text",
            id: originalId2,
            sid: "test-sid",
            tokenType: UsfmTokenTypes.numberRange,
            marker: "v",
        });

        // Create a paragraph element containing both nodes
        const paragraphElement = {
            type: "paragraph",
            version: 1,
            direction: "ltr" as const,
            format: "start" as const,
            indent: 0,
            children: [node1, node2],
        };

        const adjustedNodes = materializeFlatTokensArray([paragraphElement], {
            nested: "flatten",
        });

        // Verify the structure and IDs are preserved
        expect(adjustedNodes).toHaveLength(2);
        if (!("id" in adjustedNodes[0])) {
            throw new Error("adjustedNodes[0] does not have an id property");
        }
        expect(adjustedNodes[0].id).toBe(originalId1);
        if (!("id" in adjustedNodes[1])) {
            throw new Error("adjustedNodes[1] does not have an id property");
        }
        expect(adjustedNodes[1].id).toBe(originalId2);
    });
});
