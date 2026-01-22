import { describe, expect, it } from "vitest";
import { type USFMNodeJSON, UsfmTokenTypes } from "@/app/data/editor.ts";
import type { USFMElementNodeJSON } from "@/app/domain/editor/nodes/USFMElementNode.ts";
import type { USFMNestedEditorNodeJSON } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import type { SerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    escapeRegex,
    findMatch,
    reduceSerializedNodesToText,
} from "@/app/domain/search/search.utils.ts";

describe("escapeRegex", () => {
    it("should escape all special regex characters", () => {
        const input = ".*+?^$" + "{}()|[\\]\\";
        const result = escapeRegex(input);
        expect(result).toBe(
            "\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\\\\\]\\\\\\\\",
        );
    });

    it("should escape each special character individually", () => {
        expect(escapeRegex(".")).toBe("\\.");
        expect(escapeRegex("*")).toBe("\\*");
        expect(escapeRegex("+")).toBe("\\+");
        expect(escapeRegex("?")).toBe("\\?");
        expect(escapeRegex("^")).toBe("\\^");
        expect(escapeRegex("$")).toBe("\\$");
        expect(escapeRegex("{")).toBe("\\{");
        expect(escapeRegex("}")).toBe("\\}");
        expect(escapeRegex("(")).toBe("\\(");
        expect(escapeRegex(")")).toBe("\\)");
        expect(escapeRegex("|")).toBe("\\|");
        expect(escapeRegex("[")).toBe("\\[");
        expect(escapeRegex("]")).toBe("\\]");
        expect(escapeRegex("\\")).toBe("\\\\");
    });

    it("should leave non-special characters unchanged", () => {
        const input = "abc123 XYZ";
        const result = escapeRegex(input);
        expect(result).toBe("abc123 XYZ");
    });

    it("should handle mixed special and non-special characters", () => {
        const input = "test.com/file*.txt";
        const result = escapeRegex(input);
        expect(result).toBe("test\\.com/file\\*\\.txt");
    });

    it("should handle empty string", () => {
        expect(escapeRegex("")).toBe("");
    });
});

describe("findMatch", () => {
    describe("matchWholeWord: false, matchCase: false", () => {
        it("should find substring match case-insensitively", () => {
            const result = findMatch({
                textToSearch: "Hello World",
                searchTerm: "hello",
                matchCase: false,
                matchWholeWord: false,
            });
            expect(result).toEqual({ isMatch: true, matchedTerm: "Hello" });
        });

        it("should return original text casing when found", () => {
            const result = findMatch({
                textToSearch: "Testing SEARCH functionality",
                searchTerm: "search",
                matchCase: false,
                matchWholeWord: false,
            });
            expect(result).toEqual({ isMatch: true, matchedTerm: "SEARCH" });
        });

        it("should return no match when term not found", () => {
            const result = findMatch({
                textToSearch: "Hello World",
                searchTerm: "xyz",
                matchCase: false,
                matchWholeWord: false,
            });
            expect(result).toEqual({ isMatch: false, matchedTerm: null });
        });
    });

    describe("matchWholeWord: false, matchCase: true", () => {
        it("should find substring match case-sensitively", () => {
            const result = findMatch({
                textToSearch: "Hello World",
                searchTerm: "Hello",
                matchCase: true,
                matchWholeWord: false,
            });
            expect(result).toEqual({ isMatch: true, matchedTerm: "Hello" });
        });

        it("should not match when case differs", () => {
            const result = findMatch({
                textToSearch: "Hello World",
                searchTerm: "hello",
                matchCase: true,
                matchWholeWord: false,
            });
            expect(result).toEqual({ isMatch: false, matchedTerm: null });
        });

        it("should return no match when term not found", () => {
            const result = findMatch({
                textToSearch: "Hello World",
                searchTerm: "xyz",
                matchCase: true,
                matchWholeWord: false,
            });
            expect(result).toEqual({ isMatch: false, matchedTerm: null });
        });
    });

    describe("matchWholeWord: true, matchCase: false", () => {
        it("should find whole word match case-insensitively", () => {
            const result = findMatch({
                textToSearch: "Hello World",
                searchTerm: "hello",
                matchCase: false,
                matchWholeWord: true,
            });
            expect(result).toEqual({ isMatch: true, matchedTerm: "Hello" });
        });

        it("should not match partial word", () => {
            const result = findMatch({
                textToSearch: "Hello World",
                searchTerm: "hel",
                matchCase: false,
                matchWholeWord: true,
            });
            expect(result).toEqual({ isMatch: false, matchedTerm: null });
        });

        it("should match word in middle of text", () => {
            const result = findMatch({
                textToSearch: "The quick brown fox jumps",
                searchTerm: "fox",
                matchCase: false,
                matchWholeWord: true,
            });
            expect(result).toEqual({ isMatch: true, matchedTerm: "fox" });
        });

        it("should match word with different case", () => {
            const result = findMatch({
                textToSearch: "TESTING search FUNCTIONALITY",
                searchTerm: "search",
                matchCase: false,
                matchWholeWord: true,
            });
            expect(result).toEqual({ isMatch: true, matchedTerm: "search" });
        });

        it("should not match substring of longer word", () => {
            const result = findMatch({
                textToSearch: "The fox is in the foxhole",
                searchTerm: "fox",
                matchCase: false,
                matchWholeWord: true,
            });
            expect(result).toEqual({ isMatch: true, matchedTerm: "fox" });
            // Note: This test shows that "fox" in "foxhole" is NOT matched because of word boundaries
        });

        it("should return no match when word not found", () => {
            const result = findMatch({
                textToSearch: "Hello World",
                searchTerm: "xyz",
                matchCase: false,
                matchWholeWord: true,
            });
            expect(result).toEqual({ isMatch: false, matchedTerm: null });
        });
    });

    describe("matchWholeWord: true, matchCase: true", () => {
        it("should find whole word match case-sensitively", () => {
            const result = findMatch({
                textToSearch: "Hello World",
                searchTerm: "Hello",
                matchCase: true,
                matchWholeWord: true,
            });
            expect(result).toEqual({ isMatch: true, matchedTerm: "Hello" });
        });

        it("should not match when case differs", () => {
            const result = findMatch({
                textToSearch: "Hello World",
                searchTerm: "hello",
                matchCase: true,
                matchWholeWord: true,
            });
            expect(result).toEqual({ isMatch: false, matchedTerm: null });
        });

        it("should not match partial word even with correct case", () => {
            const result = findMatch({
                textToSearch: "Hello World",
                searchTerm: "Hel",
                matchCase: true,
                matchWholeWord: true,
            });
            expect(result).toEqual({ isMatch: false, matchedTerm: null });
        });
    });

    describe("edge cases", () => {
        it("should return no match when searchTerm is empty", () => {
            const result = findMatch({
                textToSearch: "Hello World",
                searchTerm: "",
                matchCase: false,
                matchWholeWord: false,
            });
            expect(result).toEqual({ isMatch: false, matchedTerm: null });
        });

        it("should handle special regex characters in search term when matchWholeWord is true", () => {
            // Word boundaries require word characters to be surrounded by non-word chars or string boundaries
            // Testing with a word-like pattern containing dots
            const result = findMatch({
                textToSearch: "Price is 10.00 dollars now",
                searchTerm: "10.00",
                matchCase: false,
                matchWholeWord: true,
            });
            expect(result).toEqual({ isMatch: true, matchedTerm: "10.00" });
        });

        it("should handle special regex characters in search term when matchWholeWord is false", () => {
            const result = findMatch({
                textToSearch: "Price is $10.00",
                searchTerm: "$10",
                matchCase: false,
                matchWholeWord: false,
            });
            expect(result).toEqual({ isMatch: true, matchedTerm: "$10" });
        });

        it("should handle empty textToSearch", () => {
            const result = findMatch({
                textToSearch: "",
                searchTerm: "test",
                matchCase: false,
                matchWholeWord: false,
            });
            expect(result).toEqual({ isMatch: false, matchedTerm: null });
        });
    });
});

describe("reduceSerializedNodesToText", () => {
    function createMockUSFMTextNode(
        text: string,
        sid: string,
        tokenType: string = UsfmTokenTypes.text,
    ): SerializedUSFMTextNode {
        return {
            type: "usfm-text-node",
            lexicalType: "usfm-text-node",
            id: `node-${sid}`,
            sid,
            text,
            tokenType,
            inPara: "p",
            isMutable: true,
            show: true,
            version: 1,
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
        };
    }

    function createMockElementNode(
        children: USFMNodeJSON[],
        sid?: string,
    ): USFMElementNodeJSON & { children: USFMNodeJSON[] } {
        return {
            type: "usfm-element-node",
            id: "element-1",
            tokenType: "element",
            inPara: "p",
            sid,
            marker: "p",
            version: 1,
            direction: "ltr",
            format: "",
            indent: 0,
            children: children,
        };
    }

    function createMockNestedEditorNode(
        children: SerializedUSFMTextNode[],
        sid: string,
    ): USFMNestedEditorNodeJSON {
        return {
            type: "usfm-nested-editor",
            text: "\\f*",
            id: "nested-1",
            version: 1,
            marker: "f",
            sid,
            tokenType: "footnote",
            level: "1",
            inPara: "p",
            inChars: [],
            attributes: {},
            isOpen: false,
            editorState: {
                root: {
                    type: "root",
                    version: 1,
                    children: [
                        {
                            type: "paragraph",
                            version: 1,
                            format: "",
                            indent: 0,
                            children: children,
                        },
                    ],
                    direction: "ltr",
                    format: "",
                    indent: 0,
                },
            },
        };
    }

    it("should return empty object for empty nodes array", () => {
        const result = reduceSerializedNodesToText([]);
        expect(result).toEqual({});
    });

    it("should extract text from plain USFM text nodes with sid", () => {
        const nodes: SerializedUSFMTextNode[] = [
            createMockUSFMTextNode("Hello", "verse-1"),
            createMockUSFMTextNode("World", "verse-2"),
        ];

        const result = reduceSerializedNodesToText(nodes);
        expect(result).toEqual({
            "verse-1": "Hello",
            "verse-2": "World",
        });
    });

    it("should ignore USFM text nodes without sid", () => {
        const nodes = [
            createMockUSFMTextNode("Hello", "verse-1"),
            createMockUSFMTextNode("World", "verse-2"),
            {
                ...createMockUSFMTextNode("No sid", ""),
                sid: undefined,
            } as SerializedUSFMTextNode,
        ];

        const result = reduceSerializedNodesToText(nodes);
        expect(result).toEqual({
            "verse-1": "Hello",
            "verse-2": "World",
        });
    });

    it("should ignore non-text nodes (e.g., numberRange)", () => {
        const nodes: SerializedUSFMTextNode[] = [
            createMockUSFMTextNode("Hello", "verse-1", UsfmTokenTypes.text),
            createMockUSFMTextNode(
                "1",
                "",
                UsfmTokenTypes.numberRange,
            ) as SerializedUSFMTextNode,
        ];

        const result = reduceSerializedNodesToText(nodes);
        expect(result).toEqual({
            "verse-1": "Hello",
        });
    });

    it("should concatenate text from multiple nodes with same sid", () => {
        const nodes: SerializedUSFMTextNode[] = [
            createMockUSFMTextNode("Hello", "verse-1"),
            createMockUSFMTextNode(" ", "verse-1"),
            createMockUSFMTextNode("World", "verse-1"),
        ];

        const result = reduceSerializedNodesToText(nodes);
        expect(result).toEqual({
            "verse-1": "Hello World",
        });
    });

    it("should extract text from element node children", () => {
        const children = [
            createMockUSFMTextNode("Hello", "verse-1"),
            createMockUSFMTextNode("World", "verse-2"),
        ];

        const nodes = [createMockElementNode(children, undefined)];

        const result = reduceSerializedNodesToText(nodes);
        expect(result).toEqual({
            "verse-1": "Hello",
            "verse-2": "World",
        });
    });

    it("should handle element node with sid in its own children", () => {
        const children = [
            createMockUSFMTextNode("Verse", "verse-1"),
            createMockUSFMTextNode(" text", "verse-1"),
        ];

        const nodes = [createMockElementNode(children, "element-1")];

        const result = reduceSerializedNodesToText(nodes);
        expect(result).toEqual({
            "verse-1": "Verse text",
        });
    });

    it("should extract text from nested editor node children", () => {
        const nestedChildren = [
            createMockUSFMTextNode("Footnote", "footnote-1"),
            createMockUSFMTextNode(" text", "footnote-1"),
        ];

        const nodes = [createMockNestedEditorNode(nestedChildren, "nested-1")];

        const result = reduceSerializedNodesToText(nodes);
        expect(result).toEqual({
            "footnote-1": "Footnote text",
        });
    });

    it("should handle complex nested structure with mixed node types", () => {
        const nodes: USFMNodeJSON[] = [
            // Plain text node at root
            createMockUSFMTextNode("In", "verse-1"),
            // Element node with text children
            createMockElementNode([
                createMockUSFMTextNode(" the", "verse-1"),
                createMockUSFMTextNode(" beginning", "verse-1"),
            ]),
            // Nested editor node with content for verse-1
            createMockNestedEditorNode(
                [createMockUSFMTextNode("God", "verse-1")],
                "nested-1",
            ),
            // More plain text
            createMockUSFMTextNode(" created", "verse-1"),
            // Verse 2 content
            createMockUSFMTextNode("And", "verse-2"),
        ];

        const result = reduceSerializedNodesToText(nodes);
        expect(result).toEqual({
            "verse-1": "In the beginningGod created",
            "verse-2": "And",
        });
    });

    it("should handle deeply nested structure", () => {
        const nestedChildren = [
            createMockUSFMTextNode("Deep", "deep-1"),
            createMockUSFMTextNode(" nested", "deep-1"),
        ];

        const elementChildren = [
            createMockUSFMTextNode("Root", "root-1"),
            createMockElementNode([createMockUSFMTextNode(" child", "root-1")]),
            createMockNestedEditorNode(nestedChildren, "nested-1"),
        ];

        const nodes = [createMockElementNode(elementChildren)];

        const result = reduceSerializedNodesToText(nodes);
        expect(result).toEqual({
            "root-1": "Root child",
            "deep-1": "Deep nested",
        });
    });

    it("should handle nodes with empty text content", () => {
        const nodes = [
            createMockUSFMTextNode("", "verse-1"),
            createMockUSFMTextNode("Hello", "verse-1"),
            createMockUSFMTextNode("", "verse-2"),
        ];

        const result = reduceSerializedNodesToText(nodes);
        expect(result).toEqual({
            "verse-1": "Hello",
            "verse-2": "",
        });
    });

    it("should handle non-USFM nodes gracefully", () => {
        // biome-ignore lint/suspicious/noExplicitAny: <any in teest mocking>
        const nodes: any[] = [
            createMockUSFMTextNode("Valid", "verse-1"),
            // Unknown node type - should be ignored
            {
                type: "unknown-node",
                version: 1,
            },
            createMockUSFMTextNode("text", "verse-1"),
        ];

        const result = reduceSerializedNodesToText(nodes);
        expect(result).toEqual({
            "verse-1": "Validtext",
        });
    });

    it("should preserve order of concatenated text", () => {
        const nodes = [
            createMockUSFMTextNode("A", "verse-1"),
            createMockUSFMTextNode("B", "verse-1"),
            createMockUSFMTextNode("C", "verse-1"),
            createMockElementNode([
                createMockUSFMTextNode("D", "verse-1"),
                createMockUSFMTextNode("E", "verse-1"),
            ]),
            createMockNestedEditorNode(
                [createMockUSFMTextNode("F", "verse-1")],
                "verse-1",
            ),
        ];

        const result = reduceSerializedNodesToText(nodes);
        expect(result["verse-1"]).toBe("ABCDEF");
    });
});
