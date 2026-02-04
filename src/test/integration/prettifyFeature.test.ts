import type { SerializedEditorState, SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";
import { USFM_PARAGRAPH_NODE_TYPE, UsfmTokenTypes } from "@/app/data/editor.ts";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import {
    isSerializedUSFMTextNode,
    type SerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    lexicalRootChildrenToPrettifyTokenStream,
    prettifyTokenStreamToLexicalRootChildren,
} from "@/app/domain/editor/utils/prettifySerializedNode.ts";
import { walkNodes } from "@/app/domain/editor/utils/serializedTraversal.ts";
import { prettifyTokenStream } from "@/core/domain/usfm/prettify/prettifyTokenStream.ts";
import { createTestEditor } from "@/test/helpers/testEditor.ts";

function applyPrettifyToNodeTree(
    nodes: SerializedLexicalNode[],
): SerializedLexicalNode[] {
    const envelope = lexicalRootChildrenToPrettifyTokenStream(nodes);
    const prettifiedTokens = prettifyTokenStream(envelope.tokens);
    return prettifyTokenStreamToLexicalRootChildren(prettifiedTokens, envelope);
}

const createSerializedState = (usfmContent: string): SerializedEditorState => {
    const editor = createTestEditor(usfmContent);
    return editor.getEditorState().toJSON();
};

const createChapter = (
    chapNumber: number,
    usfmContent: string,
): ParsedChapter => {
    const lexicalState = createSerializedState(usfmContent);
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

const flattenNodes = (
    nodes: SerializedLexicalNode[],
): SerializedLexicalNode[] => {
    return Array.from(walkNodes(nodes)).filter(
        (node) => isSerializedUSFMTextNode(node) || node.type === "linebreak",
    );
};

describe("Prettify Feature Integration", () => {
    describe("Prettify Book", () => {
        it("should prettify messy USFM content in a book", () => {
            const chapter = createChapter(
                1,
                `\\id PSA
\\c 1
\\v 1 1) I will bless the Lord at all times
    his praise shall continually be in my mouth
\\v 2 My soul makes its boast in the Lord;  let the humble hear and be glad.  \\v 3 Oh magnify the Lord with me and let us exalt his name together`,
            );
            const file = createFile("PSA", [chapter]);

            const originalChildren =
                file.chapters[0].lexicalState.root.children;
            const newChildren = applyPrettifyToNodeTree(originalChildren);
            const flattened = flattenNodes(newChildren);

            const chapterPara = newChildren.find(
                (n) =>
                    n.type === USFM_PARAGRAPH_NODE_TYPE &&
                    (n as { marker?: string }).marker === "c",
            );
            expect(chapterPara).toBeTruthy();
            const chapterChildren = (chapterPara as { children?: unknown })
                .children as SerializedLexicalNode[];
            const chapterNumberIndex = chapterChildren.findIndex(
                (node) =>
                    isSerializedUSFMTextNode(node) &&
                    node.tokenType === UsfmTokenTypes.numberRange &&
                    node.text.trim() === "1",
            );
            expect(chapterChildren[chapterNumberIndex + 1]?.type).toBe(
                "linebreak",
            );

            const v2TextNode = flattened.find(
                (node) =>
                    isSerializedUSFMTextNode(node) &&
                    node.tokenType === UsfmTokenTypes.text &&
                    node.text.includes("My soul makes its boast"),
            ) as SerializedUSFMTextNode;
            expect(v2TextNode.text).toBe(
                " My soul makes its boast in the Lord; let the humble hear and be glad. ",
            );

            const vMarkers = flattened.filter(
                (node) =>
                    isSerializedUSFMTextNode(node) &&
                    node.tokenType === UsfmTokenTypes.marker &&
                    node.marker === "v",
            ) as SerializedUSFMTextNode[];
            const v2Marker = vMarkers[1];
            const v2MarkerIndex = flattened.indexOf(v2Marker);
            expect(flattened[v2MarkerIndex - 1]?.type).not.toBe("linebreak");

            const nodesWithPara = createSerializedState(`\\id GEN
\\c 1
Some text
\\p Paragraph text`).root.children;
            const prettifiedPara = applyPrettifyToNodeTree(nodesWithPara);
            const paraFlattened = flattenNodes(prettifiedPara);
            const someTextIndex = paraFlattened.findIndex(
                (node) =>
                    isSerializedUSFMTextNode(node) &&
                    node.tokenType === UsfmTokenTypes.text &&
                    node.text.trim() === "Some text",
            );
            const pTextIndex = paraFlattened.findIndex(
                (node) =>
                    isSerializedUSFMTextNode(node) &&
                    node.tokenType === UsfmTokenTypes.text &&
                    node.text.trim() === "Paragraph text",
            );
            expect(someTextIndex).toBeGreaterThan(-1);
            expect(pTextIndex).toBeGreaterThan(-1);
            // \p is a structural break; ensure there's a linebreak boundary between the
            // preceding paragraph content and the new paragraph's text.
            const between = paraFlattened.slice(someTextIndex + 1, pTextIndex);
            expect(between.some((n) => n.type === "linebreak")).toBe(true);
        });

        it("should not produce root-unsafe children in usfm/plain mode", () => {
            const ugly =
                '\\c 1 \\v 1 \\v 2 \\v 3 1. James, a servant of God and of the Lord Jesus Christ, to the twelve tribes scattered among the nations: Greetings. 2. Consider it pure joy, my brothers and sisters, whenever you face trials of many kinds, 3. because you know that the testing of your faith produces\n\\v 5 \\v 4 Let perseverance finish\n\\v 12 \\v 13 12. Blessed is the one who perseveres under trial because, having stood the test, that person will receive the crown of life that the Lord has promised to those who love him. \\p 13. When tempted, no one should say, "God is tempting me."';

            const editor = createTestEditor(ugly, { needsParagraphs: false });
            const serialized = editor.getEditorState().toJSON();
            const rootChildren = serialized.root
                .children as SerializedLexicalNode[];

            const prettifiedChildren = applyPrettifyToNodeTree(rootChildren);

            expect(prettifiedChildren).toHaveLength(1);
            expect(prettifiedChildren[0]?.type).toBe("paragraph");

            const nextState = {
                ...serialized,
                root: {
                    ...serialized.root,
                    children: prettifiedChildren,
                },
            };

            expect(() => editor.parseEditorState(nextState)).not.toThrow();
        });
    });

    describe("Prettify Project", () => {
        it("should apply transformation to all files and chapters", () => {
            const file1 = createFile("GEN", [
                createChapter(
                    1,
                    `\\id GEN
\\c 1
In the beginning   God`,
                ),
            ]);
            const file2 = createFile("EXO", [
                createChapter(
                    1,
                    `\\id EXO
\\c 1
These are the   names`,
                ),
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

            const genNodes = flattenNodes(
                file1.chapters[0].lexicalState.root.children,
            );
            const genChapterPara =
                file1.chapters[0].lexicalState.root.children.find(
                    (n) =>
                        n.type === USFM_PARAGRAPH_NODE_TYPE &&
                        (n as { marker?: string }).marker === "c",
                );
            expect(genChapterPara).toBeTruthy();
            const genChapterChildren = (
                genChapterPara as { children?: unknown }
            ).children as SerializedLexicalNode[];
            const genChapterIndex = genChapterChildren.findIndex(
                (node) =>
                    isSerializedUSFMTextNode(node) &&
                    node.tokenType === UsfmTokenTypes.numberRange &&
                    node.text.trim() === "1",
            );
            expect(genChapterChildren[genChapterIndex + 1]?.type).toBe(
                "linebreak",
            );
            const genText = genNodes.find(
                (node) =>
                    isSerializedUSFMTextNode(node) &&
                    node.tokenType === UsfmTokenTypes.text,
            ) as SerializedUSFMTextNode;
            expect(genText.text).toBe("In the beginning God");

            const exoNodes = flattenNodes(
                file2.chapters[0].lexicalState.root.children,
            );
            const exoChapterPara =
                file2.chapters[0].lexicalState.root.children.find(
                    (n) =>
                        n.type === USFM_PARAGRAPH_NODE_TYPE &&
                        (n as { marker?: string }).marker === "c",
                );
            expect(exoChapterPara).toBeTruthy();
            const exoChapterChildren = (
                exoChapterPara as { children?: unknown }
            ).children as SerializedLexicalNode[];
            const exoChapterIndex = exoChapterChildren.findIndex(
                (node) =>
                    isSerializedUSFMTextNode(node) &&
                    node.tokenType === UsfmTokenTypes.numberRange &&
                    node.text.trim() === "1",
            );
            expect(exoChapterChildren[exoChapterIndex + 1]?.type).toBe(
                "linebreak",
            );
            const exoText = exoNodes.find(
                (node) =>
                    isSerializedUSFMTextNode(node) &&
                    node.tokenType === UsfmTokenTypes.text,
            ) as SerializedUSFMTextNode;
            expect(exoText.text).toBe("These are the names");
        });
    });

    describe("Revert Logic", () => {
        it("should correctly revert changes using loadedLexicalState", () => {
            const chapter = createChapter(
                1,
                `\\id GEN
\\c 1
Original text`,
            );
            const file = createFile("GEN", [chapter]);
            const mutWorkingFilesRef = [file];
            const originalNodes = structuredClone(
                mutWorkingFilesRef[0].chapters[0].lexicalState.root.children,
            );

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
