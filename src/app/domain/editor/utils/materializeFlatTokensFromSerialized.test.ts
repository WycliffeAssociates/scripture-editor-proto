import { describe, expect, it } from "vitest";
import { USFM_PARAGRAPH_NODE_TYPE, UsfmTokenTypes } from "@/app/data/editor.ts";
import { USFM_NESTED_DECORATOR_TYPE } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import type { USFMParagraphNodeJSON } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import type { SerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    materializeFlatTokensArray,
    walkFlatTokensSlidingWindow,
} from "./materializeFlatTokensFromSerialized.ts";

// Helper to create a minimal SerializedUSFMTextNode
function makeTextNode(
    text: string,
    overrides: Partial<SerializedUSFMTextNode> = {},
): SerializedUSFMTextNode {
    return {
        type: "usfm-text-node",
        lexicalType: "usfm-text-node",
        id: `text-${text}`,
        sid: "",
        tokenType: UsfmTokenTypes.text,
        text,
        show: true,
        isMutable: true,
        version: 1,
        detail: 0,
        format: 0,
        mode: "normal",
        style: "",
        ...overrides,
    };
}

// Helper to create a paragraph container
function makeParagraphContainer(
    marker: string,
    children: SerializedUSFMTextNode[],
): USFMParagraphNodeJSON {
    return {
        type: USFM_PARAGRAPH_NODE_TYPE,
        id: `para-${marker}`,
        tokenType: UsfmTokenTypes.marker,
        marker,
        version: 1,
        children,
        direction: null,
        format: "",
        indent: 0,
    };
}

// Helper to create a nested editor node
function makeNestedEditorNode(
    marker: string,
    innerChildren: SerializedUSFMTextNode[],
) {
    return {
        type: USFM_NESTED_DECORATOR_TYPE,
        id: `nested-${marker}`,
        marker,
        tokenType: UsfmTokenTypes.marker,
        text: `\\${marker}`,
        version: 1,
        editorState: {
            root: {
                type: "root",
                version: 1,
                children: innerChildren,
                direction: null,
                format: "",
                indent: 0,
            },
        },
    };
}

describe("materializeFlatTokensFromSerialized", () => {
    describe("flat input (legacy/USFM mode)", () => {
        it("yields tokens as-is when given a flat list", () => {
            const input = [makeTextNode("Hello"), makeTextNode("World")];

            const result = materializeFlatTokensArray(input);

            expect(result).toHaveLength(2);
            expect((result[0] as SerializedUSFMTextNode).text).toBe("Hello");
            expect((result[1] as SerializedUSFMTextNode).text).toBe("World");
        });

        it("returns empty array for empty input", () => {
            const result = materializeFlatTokensArray([]);
            expect(result).toEqual([]);
        });
    });

    describe("paragraph-tree input (Regular mode)", () => {
        it("emits synthetic marker then children for paragraph container", () => {
            const input = [
                makeParagraphContainer("p", [makeTextNode("Verse text")]),
            ];

            const result = materializeFlatTokensArray(input);

            expect(result).toHaveLength(2);
            // First token should be synthetic paragraph marker (no trailing space when markerText missing)
            expect((result[0] as SerializedUSFMTextNode).text).toBe("\\p");
            expect((result[0] as SerializedUSFMTextNode).tokenType).toBe(
                UsfmTokenTypes.marker,
            );
            expect((result[0] as SerializedUSFMTextNode).marker).toBe("p");
            // Second token is the child
            expect((result[1] as SerializedUSFMTextNode).text).toBe(
                "Verse text",
            );
        });

        it("handles multiple paragraph containers with different markers", () => {
            const input = [
                makeParagraphContainer("p", [makeTextNode("Normal para")]),
                makeParagraphContainer("q1", [makeTextNode("Poetry line")]),
            ];

            const result = materializeFlatTokensArray(input);

            expect(result).toHaveLength(4);
            expect((result[0] as SerializedUSFMTextNode).text).toBe("\\p");
            expect((result[1] as SerializedUSFMTextNode).text).toBe(
                "Normal para",
            );
            expect((result[2] as SerializedUSFMTextNode).text).toBe("\\q1");
            expect((result[3] as SerializedUSFMTextNode).text).toBe(
                "Poetry line",
            );
        });

        it("defaults to marker 'p' when paragraph has no marker", () => {
            const input = [
                {
                    ...makeParagraphContainer("p", [makeTextNode("Content")]),
                    marker: undefined,
                },
            ];

            const result = materializeFlatTokensArray(input);

            expect((result[0] as SerializedUSFMTextNode).marker).toBe("p");
            expect((result[0] as SerializedUSFMTextNode).text).toBe("\\p");
        });
    });

    describe("nested editor nodes", () => {
        it("includes nested editor content in reading order", () => {
            const input = [
                makeTextNode("Before"),
                makeNestedEditorNode("f", [makeTextNode("Footnote content")]),
                makeTextNode("After"),
            ];

            const result = materializeFlatTokensArray(input);

            // Before + nested node + nested content + After
            expect(result).toHaveLength(4);
            expect((result[0] as SerializedUSFMTextNode).text).toBe("Before");
            expect(result[1].type).toBe(USFM_NESTED_DECORATOR_TYPE);
            expect((result[2] as SerializedUSFMTextNode).text).toBe(
                "Footnote content",
            );
            expect((result[3] as SerializedUSFMTextNode).text).toBe("After");
        });

        it("handles nested editors inside paragraph containers", () => {
            const nestedEditor = makeNestedEditorNode("f", [
                makeTextNode("Note"),
            ]);
            const input = [
                makeParagraphContainer("p", [
                    makeTextNode("Text"),
                    nestedEditor as unknown as SerializedUSFMTextNode,
                ]),
            ];

            const result = materializeFlatTokensArray(input);

            // synthetic marker + Text + nested node + nested content
            expect(result).toHaveLength(4);
            expect((result[0] as SerializedUSFMTextNode).text).toBe("\\p");
            expect((result[1] as SerializedUSFMTextNode).text).toBe("Text");
            expect(result[2].type).toBe(USFM_NESTED_DECORATOR_TYPE);
            expect((result[3] as SerializedUSFMTextNode).text).toBe("Note");
        });

        it("unwraps Lexical paragraph wrappers inside nested editor states", () => {
            const nested = makeNestedEditorNode("f", [makeTextNode("Inner")]);
            // Simulate real nested editor shape: root.children -> paragraph -> tokens
            const nestedWithEditorState = nested as unknown as {
                editorState: unknown;
            };
            nestedWithEditorState.editorState = {
                root: {
                    type: "root",
                    version: 1,
                    children: [
                        {
                            type: "paragraph",
                            version: 1,
                            children: [makeTextNode("Inner")],
                        },
                    ],
                },
            };

            const result = materializeFlatTokensArray([nested]);

            expect(result).toHaveLength(2);
            expect(result[0].type).toBe(USFM_NESTED_DECORATOR_TYPE);
            expect((result[1] as SerializedUSFMTextNode).text).toBe("Inner");
        });
    });

    describe("walkFlatTokensSlidingWindow", () => {
        it("provides prev/curr/next for each token", () => {
            const input = [
                makeTextNode("A"),
                makeTextNode("B"),
                makeTextNode("C"),
            ];

            const windows = [...walkFlatTokensSlidingWindow(input)];

            expect(windows).toHaveLength(3);

            // First window
            expect(windows[0].prev).toBeUndefined();
            expect((windows[0].curr as SerializedUSFMTextNode).text).toBe("A");
            expect((windows[0].next as SerializedUSFMTextNode).text).toBe("B");

            // Middle window
            expect((windows[1].prev as SerializedUSFMTextNode).text).toBe("A");
            expect((windows[1].curr as SerializedUSFMTextNode).text).toBe("B");
            expect((windows[1].next as SerializedUSFMTextNode).text).toBe("C");

            // Last window
            expect((windows[2].prev as SerializedUSFMTextNode).text).toBe("B");
            expect((windows[2].curr as SerializedUSFMTextNode).text).toBe("C");
            expect(windows[2].next).toBeUndefined();
        });

        it("works with paragraph containers", () => {
            const input = [
                makeParagraphContainer("p", [makeTextNode("Content")]),
            ];

            const windows = [...walkFlatTokensSlidingWindow(input)];

            expect(windows).toHaveLength(2);
            // synthetic marker -> content (no trailing space when markerText missing)
            expect((windows[0].curr as SerializedUSFMTextNode).text).toBe(
                "\\p",
            );
            expect((windows[0].next as SerializedUSFMTextNode).text).toBe(
                "Content",
            );
            expect((windows[1].prev as SerializedUSFMTextNode).text).toBe(
                "\\p",
            );
            expect((windows[1].curr as SerializedUSFMTextNode).text).toBe(
                "Content",
            );
        });
    });
});
