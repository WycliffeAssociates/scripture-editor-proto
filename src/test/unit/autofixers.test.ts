import type { SerializedElementNode, SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import type { SerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { applyAutofixToSerializedState } from "@/app/domain/editor/utils/autofixSerializedNode.ts";
import { type LintError, LintErrorKeys } from "@/core/data/usfm/lint.ts";

// Helper to create a basic serialized text node
function createSerializedNode(
    id: string,
    text: string,
    marker: string,
    tokenType: string = UsfmTokenTypes.marker,
): SerializedUSFMTextNode {
    return {
        type: "usfm-text-node",
        text,
        marker,
        tokenType: tokenType as any,
        version: 1,
        id,
        sid: "GEN 1:1",
        show: true,
        isMutable: true,
        detail: 0,
        format: 0,
        mode: "normal",
        style: "",
        lexicalType: "usfm-text-node",
    };
}

describe("applyAutofixToSerializedState", () => {
    it("should insert end marker after the target node", () => {
        const targetId = "target-node-id";
        const nodes: SerializedLexicalNode[] = [
            createSerializedNode("1", "\\v 1 ", "v", UsfmTokenTypes.marker),
            createSerializedNode(targetId, "\\f + ", "f"), // Open note
            createSerializedNode(
                "3",
                "Some note content",
                "f",
                UsfmTokenTypes.text,
            ),
        ];

        const error: LintError = {
            message: "Note marker left opened",
            sid: "GEN 1:1",
            msgKey: "noteNotClosed",
            nodeId: targetId,
            fix: {
                label: "Fix",
                type: "insertEndMarker",
                data: {
                    nodeId: targetId,
                    marker: "f",
                },
            },
        };

        const result = applyAutofixToSerializedState(nodes, error);

        expect(result).toBe(true);
        expect(nodes.length).toBe(4);

        // Check inserted node
        // It should be inserted AFTER the target node.
        // Index 0: v
        // Index 1: f (target)
        // Index 2: f* (inserted)
        // Index 3: content

        const inserted = nodes[2] as SerializedUSFMTextNode;
        expect(inserted.marker).toBe("f*");
        expect(inserted.text).toMatch(/\\f\*/);
        expect(inserted.tokenType).toBe(UsfmTokenTypes.endMarker);
    });

    it("should return false if node not found", () => {
        const nodes: SerializedLexicalNode[] = [
            createSerializedNode("1", "\\v 1 ", "v"),
        ];

        const error: LintError = {
            message: "Error",
            sid: "GEN 1:1",
            msgKey: "noteNotClosed",
            nodeId: "missing-id",
            fix: {
                label: "Fix",
                type: "insertEndMarker",
                data: { nodeId: "missing-id", marker: "f" },
            },
        };

        const result = applyAutofixToSerializedState(nodes, error);
        expect(result).toBe(false);
        expect(nodes.length).toBe(1);
    });

    it("should work recursively in ElementNodes", () => {
        const targetId = "inner-id";
        const innerNode = createSerializedNode(targetId, "\\add ", "add");

        const elementNode: SerializedElementNode = {
            type: "usfm-element-node",
            version: 1,
            children: [innerNode],
            direction: "ltr",
            format: "",
            indent: 0,
        };

        const nodes: SerializedLexicalNode[] = [elementNode];

        const error: LintError = {
            message: "Msg",
            sid: "GEN 1:1",
            msgKey: "charNotClosed",
            nodeId: targetId,
            fix: {
                label: "Fix",
                type: "insertEndMarker",
                data: { nodeId: targetId, marker: "add" },
            },
        };

        const result = applyAutofixToSerializedState(nodes, error);
        expect(result).toBe(true);
        expect(elementNode.children.length).toBe(2);
        expect((elementNode.children[1] as SerializedUSFMTextNode).marker).toBe(
            "add*",
        );
    });

    it("should split unknown token into marker and text with space", () => {
        const targetId = "target-node";
        const nodes: SerializedLexicalNode[] = [
            createSerializedNode(
                targetId,
                "\\m(for",
                "", // no marker yet
                UsfmTokenTypes.error,
            ),
        ];

        const error: LintError = {
            message: "Unknown token \\m(for",
            sid: "GEN 1:1",
            msgKey: LintErrorKeys.unknownToken,
            nodeId: targetId,
            fix: {
                label: "Insert space: \\m (for",
                type: "convertToMarkerAndText",
                data: {
                    nodeId: targetId,
                    marker: "m",
                    textAfter: "(for",
                },
            },
        };

        const result = applyAutofixToSerializedState(nodes, error);

        expect(result).toBe(true);
        expect(nodes.length).toBe(2);

        const markerNode = nodes[0] as SerializedUSFMTextNode;
        expect(markerNode.text).toBe("\\m");
        expect(markerNode.marker).toBe("m");
        expect(markerNode.tokenType).toBe(UsfmTokenTypes.marker);

        const textNode = nodes[1] as SerializedUSFMTextNode;
        expect(textNode.text).toBe(" (for");
        expect(textNode.tokenType).toBe(UsfmTokenTypes.text);
    });
});
