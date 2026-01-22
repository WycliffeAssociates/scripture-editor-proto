import type { SerializedEditorState, SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";
import { USFM_TEXT_NODE_TYPE, UsfmTokenTypes } from "@/app/data/editor.ts";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import type { SerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { applyPrettifyToNodeTree } from "@/app/domain/editor/utils/prettifySerializedNode.ts";

const createTextNode = (
    text: string,
    tokenType: string = UsfmTokenTypes.text,
    marker?: string,
    sid?: string,
): SerializedUSFMTextNode => ({
    type: USFM_TEXT_NODE_TYPE,
    lexicalType: USFM_TEXT_NODE_TYPE,
    tokenType,
    text,
    marker,
    sid,
    show: true,
    isMutable: true,
    id: Math.random().toString(36).substr(2, 9),
    version: 1,
    detail: 0,
    format: 0,
    mode: "normal",
    style: "",
});

const createChapter = (
    chapNumber: number,
    nodes: SerializedLexicalNode[],
): ParsedChapter => {
    const lexicalState: SerializedEditorState = {
        root: {
            type: "root",
            format: "",
            indent: 0,
            version: 1,
            children: nodes,
            direction: null,
        },
    };
    return {
        chapNumber,
        lexicalState,
        loadedLexicalState: structuredClone(lexicalState),
        dirty: false,
    };
};

const createFile = (
    bookCode: string,
    chapters: ParsedChapter[],
): ParsedFile => ({
    bookCode,
    path: `${bookCode}.usfm`,
    title: bookCode,
    nextBookId: null,
    prevBookId: null,
    chapters,
});

function isSerializedUSFMTextNode(
    node: SerializedLexicalNode,
): node is SerializedUSFMTextNode {
    return node.type === USFM_TEXT_NODE_TYPE;
}

describe("Prettify Feature Integration", () => {
    describe("Prettify Book", () => {
        it("should prettify messy USFM content in a book", () => {
            // Messy content:
            // \c 34 \v 1 1) I will bless the Lord at all times
            //     his praise shall continually be in my mouth
            // \v 2 My soul makes its boast in the Lord;  let the humble hear and be glad.  \v 3 Oh magnify the Lord with me and let us exalt his name together

            const messyNodes: SerializedLexicalNode[] = [
                createTextNode("34", UsfmTokenTypes.numberRange, "c"),
                // Missing linebreak after \c
                createTextNode("\\v", UsfmTokenTypes.marker, "v", "PSA 34:1"),
                createTextNode(
                    " 1 ",
                    UsfmTokenTypes.numberRange,
                    "v",
                    "PSA 34:1",
                ),
                createTextNode(
                    "1) I will bless the Lord at all times\n    his praise shall continually be in my mouth",
                    UsfmTokenTypes.text,
                    undefined,
                    "PSA 34:1",
                ),
                // Missing linebreak before \v 2
                createTextNode("\\v", UsfmTokenTypes.marker, "v", "PSA 34:2"),
                createTextNode(
                    " 2 ",
                    UsfmTokenTypes.numberRange,
                    "v",
                    "PSA 34:2",
                ),
                createTextNode(
                    "My soul makes its boast in the Lord;  let the humble hear and be glad.  ",
                    UsfmTokenTypes.text,
                    undefined,
                    "PSA 34:2",
                ),
                // Extra spaces and missing linebreak before \v 3
                createTextNode("\\v", UsfmTokenTypes.marker, "v", "PSA 34:3"),
                createTextNode(
                    " 3 ",
                    UsfmTokenTypes.numberRange,
                    "v",
                    "PSA 34:3",
                ),
                createTextNode(
                    "Oh magnify the Lord with me and let us exalt his name together",
                    UsfmTokenTypes.text,
                    undefined,
                    "PSA 34:3",
                ),
            ];

            const chapter = createChapter(34, messyNodes);
            const file = createFile("PSA", [chapter]);

            // Apply prettify
            const originalChildren =
                file.chapters[0].lexicalState.root.children;
            const newChildren = applyPrettifyToNodeTree(originalChildren);

            // Verify transformations

            // 1. Linebreak after \c
            expect(newChildren[0].type).toBe(USFM_TEXT_NODE_TYPE);
            expect((newChildren[0] as SerializedUSFMTextNode).marker).toBe("c");
            expect(newChildren[1].type).toBe("linebreak");

            // 2. Collapse whitespace and normalize spacing
            const v2TextNode = newChildren.find(
                (n) =>
                    isSerializedUSFMTextNode(n) &&
                    n.sid === "PSA 34:2" &&
                    n.tokenType === UsfmTokenTypes.text,
            ) as SerializedUSFMTextNode;
            expect(v2TextNode.text).toBe(
                "My soul makes its boast in the Lord; let the humble hear and be glad. ",
            );
            // Note: collapseWhitespaceInTextNode replaces "  " with " ".
            // "Lord;  let" -> "Lord; let"
            // "glad.  " -> "glad. "

            // 3. Linebreaks before \v markers - SHOULD NOT HAVE THEM (they are not para markers)
            const v2MarkerIndex = newChildren.findIndex(
                (n) =>
                    isSerializedUSFMTextNode(n) &&
                    n.sid === "PSA 34:2" &&
                    n.tokenType === UsfmTokenTypes.marker,
            );
            expect(newChildren[v2MarkerIndex - 1].type).not.toBe("linebreak");

            // 4. Test with a real para marker
            const nodesWithPara: SerializedLexicalNode[] = [
                createTextNode("Some text", UsfmTokenTypes.text),
                createTextNode("\\p", UsfmTokenTypes.marker, "p"),
                createTextNode("Paragraph text", UsfmTokenTypes.text),
            ];
            const prettifiedPara = applyPrettifyToNodeTree(nodesWithPara);
            const pMarkerIndex = prettifiedPara.findIndex(
                (n) => isSerializedUSFMTextNode(n) && n.marker === "p",
            );
            expect(prettifiedPara[pMarkerIndex - 1].type).toBe("linebreak");
            expect(prettifiedPara[pMarkerIndex + 1].type).toBe("linebreak");
        });
    });

    describe("Prettify Project", () => {
        it("should apply transformation to all files and chapters", () => {
            const file1 = createFile("GEN", [
                createChapter(1, [
                    createTextNode("1", UsfmTokenTypes.numberRange, "c"),
                    createTextNode(
                        "In the beginning   God",
                        UsfmTokenTypes.text,
                    ),
                ]),
            ]);
            const file2 = createFile("EXO", [
                createChapter(1, [
                    createTextNode("1", UsfmTokenTypes.numberRange, "c"),
                    createTextNode(
                        "These are the   names",
                        UsfmTokenTypes.text,
                    ),
                ]),
            ]);

            const project = [file1, file2];

            project.forEach((file) => {
                file.chapters.forEach((chapter) => {
                    const originalChildren = chapter.lexicalState.root.children;
                    const newChildren =
                        applyPrettifyToNodeTree(originalChildren);
                    chapter.lexicalState.root.children = newChildren;
                    chapter.dirty = true;
                });
            });

            // Verify file 1
            expect(file1.chapters[0].lexicalState.root.children[1].type).toBe(
                "linebreak",
            );
            const genText = file1.chapters[0].lexicalState.root.children.find(
                (n) =>
                    isSerializedUSFMTextNode(n) &&
                    n.tokenType === UsfmTokenTypes.text,
            ) as SerializedUSFMTextNode;
            expect(genText.text).toBe("In the beginning God");

            // Verify file 2
            expect(file2.chapters[0].lexicalState.root.children[1].type).toBe(
                "linebreak",
            );
            const exoText = file2.chapters[0].lexicalState.root.children.find(
                (n) =>
                    isSerializedUSFMTextNode(n) &&
                    n.tokenType === UsfmTokenTypes.text,
            ) as SerializedUSFMTextNode;
            expect(exoText.text).toBe("These are the names");
        });
    });

    describe("Revert Logic", () => {
        it("should correctly revert changes using loadedLexicalState", () => {
            const originalNodes = [
                createTextNode("1", UsfmTokenTypes.numberRange, "c"),
                createTextNode("Original text", UsfmTokenTypes.text),
            ];
            const chapter = createChapter(1, originalNodes);
            const file = createFile("GEN", [chapter]);
            const mutWorkingFilesRef = [file];

            // Apply prettify
            mutWorkingFilesRef.forEach((f) => {
                f.chapters.forEach((c) => {
                    c.lexicalState.root.children = applyPrettifyToNodeTree(
                        c.lexicalState.root.children,
                    );
                    c.dirty = true;
                });
            });

            expect(mutWorkingFilesRef[0].chapters[0].dirty).toBe(true);
            expect(
                mutWorkingFilesRef[0].chapters[0].lexicalState.root.children,
            ).not.toEqual(originalNodes);

            // Revert logic (simulating revertAllChanges)
            mutWorkingFilesRef.forEach((f) => {
                f.chapters.forEach((c) => {
                    c.lexicalState = structuredClone(c.loadedLexicalState);
                    c.dirty = false;
                });
            });

            expect(mutWorkingFilesRef[0].chapters[0].dirty).toBe(false);
            expect(
                mutWorkingFilesRef[0].chapters[0].lexicalState.root.children,
            ).toEqual(originalNodes);
        });
    });
});
