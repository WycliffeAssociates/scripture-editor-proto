import type {
    SerializedEditorState,
    SerializedElementNode,
    SerializedLexicalNode,
} from "lexical";
import { describe, expect, it } from "vitest";
import { USFM_PARAGRAPH_NODE_TYPE, UsfmTokenTypes } from "@/app/data/editor.ts";
import { USFM_NESTED_DECORATOR_TYPE } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import type { USFMParagraphNodeJSON } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import type { SerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { applyAutofixToSerializedState } from "@/app/domain/editor/utils/autofixSerializedNode.ts";
import { getFlattenedEditorStateAsParseTokens } from "@/app/ui/hooks/utils/editorUtils.ts";
import { type LintError, LintErrorKeys } from "@/core/data/usfm/lint.ts";
import { TokenMap } from "@/core/domain/usfm/lex.ts";
import { lintExistingUsfmTokens } from "@/core/domain/usfm/parse.ts";
import { initParseContext } from "@/core/domain/usfm/tokenParsers.ts";

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
        tokenType: tokenType,
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

function makeParagraphContainer(
    id: string,
    marker: string,
    children: SerializedLexicalNode[],
): USFMParagraphNodeJSON {
    return {
        type: USFM_PARAGRAPH_NODE_TYPE,
        id,
        tokenType: UsfmTokenTypes.marker,
        marker,
        version: 1,
        children,
        direction: null,
        format: "",
        indent: 0,
    };
}

function makeSerializedParagraphWrapper(
    children: SerializedLexicalNode[],
): SerializedElementNode {
    return {
        type: "paragraph",
        version: 1,
        children,
        direction: null,
        format: "",
        indent: 0,
    };
}

function makeNestedEditorNode(args: {
    id: string;
    marker: string;
    sid?: string;
    innerChildren: SerializedLexicalNode[];
}): SerializedLexicalNode {
    const { id, marker, sid, innerChildren } = args;

    return {
        type: USFM_NESTED_DECORATOR_TYPE,
        id,
        version: 1,
        text: `\\${marker}`,
        marker,
        sid,
        tokenType: UsfmTokenTypes.marker,
        editorState: {
            root: {
                type: "root",
                version: 1,
                children: [makeSerializedParagraphWrapper(innerChildren)],
                direction: null,
                format: "",
                indent: 0,
            },
        },
    } as unknown as SerializedLexicalNode;
}

function makeEditorStateFromRootChildren(
    rootChildren: SerializedLexicalNode[],
): SerializedEditorState {
    return {
        root: {
            type: "root",
            version: 1,
            children: rootChildren,
            direction: null,
            format: "",
            indent: 0,
        },
    } as unknown as SerializedEditorState;
}

function applyAutofixToRootChildren(
    rootChildren: SerializedLexicalNode[],
    error: LintError,
): SerializedLexicalNode[] | null {
    const nextState = applyAutofixToSerializedState(
        makeEditorStateFromRootChildren(rootChildren),
        error,
    );
    return nextState
        ? (nextState.root.children as SerializedLexicalNode[])
        : null;
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

        const result = applyAutofixToRootChildren(nodes, error);
        expect(result).toBeTruthy();
        expect(result).toHaveLength(4);

        // Check inserted node
        // It should be inserted AFTER the target node.
        // Index 0: v
        // Index 1: f (target)
        // Index 2: f* (inserted)
        // Index 3: content

        const inserted = result?.[2] as SerializedUSFMTextNode;
        expect(inserted.marker).toBe("f");
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

        const result = applyAutofixToRootChildren(nodes, error);
        expect(result).toBeNull();
        expect(nodes.length).toBe(1);
    });

    it("should work recursively in ElementNodes", () => {
        const targetId = "inner-id";
        const innerNode = createSerializedNode(targetId, "\\add ", "add");

        const elementNode: SerializedElementNode = {
            type: "usfm-paragraph-node",
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

        const result = applyAutofixToRootChildren(nodes, error);
        expect(result).toBeTruthy();
        const updatedElement = result?.[0] as SerializedElementNode;
        expect(updatedElement.children.length).toBe(2);
        expect(
            (updatedElement.children[1] as SerializedUSFMTextNode).marker,
        ).toBe("add");
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

        const result = applyAutofixToRootChildren(nodes, error);
        expect(result).toBeTruthy();
        expect(result).toHaveLength(2);

        const markerNode = result?.[0] as SerializedUSFMTextNode;
        expect(markerNode.text).toBe("\\m");
        expect(markerNode.marker).toBe("m");
        expect(markerNode.tokenType).toBe(UsfmTokenTypes.marker);

        const textNode = result?.[1] as SerializedUSFMTextNode;
        expect(textNode.text).toBe(" (for");
        expect(textNode.tokenType).toBe(UsfmTokenTypes.text);
    });

    it("should update number range text for setNumberRange autofix", () => {
        const targetId = "verse-range-id";
        const nodes: SerializedLexicalNode[] = [
            createSerializedNode("v-marker", "\\v", "v", UsfmTokenTypes.marker),
            createSerializedNode(
                targetId,
                "4",
                "v",
                UsfmTokenTypes.numberRange,
            ),
        ];

        const error: LintError = {
            message: "Previous verse number was 2, so expected 3 here, found 4",
            sid: "GEN 1:4",
            msgKey: LintErrorKeys.verseExpectedIncreaseByOne,
            nodeId: targetId,
            fix: {
                label: "Change verse number to 3",
                type: "setNumberRange",
                data: {
                    nodeId: targetId,
                    value: "3",
                },
            },
        };

        const result = applyAutofixToRootChildren(nodes, error);
        expect(result).toBeTruthy();
        const updated = result?.[1] as SerializedUSFMTextNode;
        expect(updated.tokenType).toBe(UsfmTokenTypes.numberRange);
        expect(updated.text).toBe("3");
    });

    it("creates continuity lint fix with previous-verse wording for simple verse gaps", () => {
        const rootChildren: SerializedLexicalNode[] = [
            createSerializedNode("book-code", "GEN", "", TokenMap.bookCode),
            createSerializedNode("c-marker", "\\c", "c", UsfmTokenTypes.marker),
            createSerializedNode(
                "c-range",
                "1",
                "c",
                UsfmTokenTypes.numberRange,
            ),
            createSerializedNode(
                "v1-marker",
                "\\v",
                "v",
                UsfmTokenTypes.marker,
            ),
            createSerializedNode(
                "v1-range",
                "1",
                "v",
                UsfmTokenTypes.numberRange,
            ),
            createSerializedNode(
                "v1-text",
                " verse one",
                "",
                UsfmTokenTypes.text,
            ),
            createSerializedNode(
                "v2-marker",
                "\\v",
                "v",
                UsfmTokenTypes.marker,
            ),
            createSerializedNode(
                "v2-range",
                "2",
                "v",
                UsfmTokenTypes.numberRange,
            ),
            createSerializedNode(
                "v2-text",
                " verse two",
                "",
                UsfmTokenTypes.text,
            ),
            createSerializedNode(
                "v4-marker",
                "\\v",
                "v",
                UsfmTokenTypes.marker,
            ),
            createSerializedNode(
                "v4-range",
                "4",
                "v",
                UsfmTokenTypes.numberRange,
            ),
            createSerializedNode(
                "v4-text",
                " verse four",
                "",
                UsfmTokenTypes.text,
            ),
        ];

        const state = makeEditorStateFromRootChildren(rootChildren);
        const flatTokens = getFlattenedEditorStateAsParseTokens(state);
        const ctx = initParseContext(flatTokens);
        const errors = lintExistingUsfmTokens(flatTokens, ctx);
        const continuityErr = errors.find(
            (e) => e.msgKey === LintErrorKeys.verseExpectedIncreaseByOne,
        );

        expect(continuityErr).toBeTruthy();
        expect(continuityErr?.message).toContain("Previous verse number was 2");
        expect(continuityErr?.message).toContain("expected 3");
        expect(continuityErr?.fix?.type).toBe("setNumberRange");
        if (continuityErr?.fix?.type === "setNumberRange") {
            expect(continuityErr.fix.data.value).toBe("3");
        }
    });

    it("uses chapter-marker context for verse continuity when SIDs are temporarily mixed", () => {
        const rootChildren: SerializedLexicalNode[] = [
            createSerializedNode("book-code", "ISA", "", TokenMap.bookCode),
            createSerializedNode("c-marker", "\\c", "c", UsfmTokenTypes.marker),
            createSerializedNode(
                "c-range",
                "33",
                "c",
                UsfmTokenTypes.numberRange,
            ),
            {
                ...createSerializedNode(
                    "v1-marker",
                    "\\v",
                    "v",
                    UsfmTokenTypes.marker,
                ),
                sid: "ISA 33:1",
            },
            {
                ...createSerializedNode(
                    "v1-range",
                    "1",
                    "v",
                    UsfmTokenTypes.numberRange,
                ),
                sid: "ISA 33:1",
            },
            {
                ...createSerializedNode(
                    "v2-marker",
                    "\\v",
                    "v",
                    UsfmTokenTypes.marker,
                ),
                sid: "ISA 3:2",
            },
            {
                ...createSerializedNode(
                    "v2-range",
                    "2",
                    "v",
                    UsfmTokenTypes.numberRange,
                ),
                sid: "ISA 3:2",
            },
            {
                ...createSerializedNode(
                    "v3-marker",
                    "\\v",
                    "v",
                    UsfmTokenTypes.marker,
                ),
                sid: "ISA 33:3",
            },
            {
                ...createSerializedNode(
                    "v3-range",
                    "3",
                    "v",
                    UsfmTokenTypes.numberRange,
                ),
                sid: "ISA 33:3",
            },
        ];

        const state = makeEditorStateFromRootChildren(rootChildren);
        const flatTokens = getFlattenedEditorStateAsParseTokens(state);
        const ctx = initParseContext(flatTokens);
        const errors = lintExistingUsfmTokens(flatTokens, ctx);
        const continuityErrors = errors.filter(
            (e) => e.msgKey === LintErrorKeys.verseExpectedIncreaseByOne,
        );

        expect(continuityErrors).toHaveLength(0);
    });

    it("offers missing-integer fix on duplicate verse when neighbors imply the intended value", () => {
        const rootChildren: SerializedLexicalNode[] = [
            createSerializedNode("book-code", "LUK", "", TokenMap.bookCode),
            createSerializedNode("c-marker", "\\c", "c", UsfmTokenTypes.marker),
            createSerializedNode(
                "c-range",
                "17",
                "c",
                UsfmTokenTypes.numberRange,
            ),
            createSerializedNode(
                "v2-marker-a",
                "\\v",
                "v",
                UsfmTokenTypes.marker,
            ),
            createSerializedNode(
                "v2-range-a",
                "2",
                "v",
                UsfmTokenTypes.numberRange,
            ),
            createSerializedNode(
                "v2-text-a",
                " first",
                "",
                UsfmTokenTypes.text,
            ),
            createSerializedNode(
                "v25-marker",
                "\\v",
                "v",
                UsfmTokenTypes.marker,
            ),
            createSerializedNode(
                "v25-range",
                "25",
                "v",
                UsfmTokenTypes.numberRange,
            ),
            createSerializedNode(
                "v25-text",
                " twenty five",
                "",
                UsfmTokenTypes.text,
            ),
            createSerializedNode(
                "v2-marker-b",
                "\\v",
                "v",
                UsfmTokenTypes.marker,
            ),
            createSerializedNode(
                "v2-range-b",
                "2",
                "v",
                UsfmTokenTypes.numberRange,
            ),
            createSerializedNode(
                "v2-text-b",
                " mistaken",
                "",
                UsfmTokenTypes.text,
            ),
            createSerializedNode(
                "v27-marker",
                "\\v",
                "v",
                UsfmTokenTypes.marker,
            ),
            createSerializedNode(
                "v27-range",
                "27",
                "v",
                UsfmTokenTypes.numberRange,
            ),
            createSerializedNode(
                "v27-text",
                " twenty seven",
                "",
                UsfmTokenTypes.text,
            ),
        ];

        const state = makeEditorStateFromRootChildren(rootChildren);
        const flatTokens = getFlattenedEditorStateAsParseTokens(state);
        const ctx = initParseContext(flatTokens);
        const errors = lintExistingUsfmTokens(flatTokens, ctx);

        const duplicateErrOnMistakenVerse = errors.find(
            (e) =>
                e.msgKey === LintErrorKeys.duplicateVerseNumber &&
                e.nodeId === "v2-range-b",
        );

        expect(duplicateErrOnMistakenVerse).toBeTruthy();
        expect(duplicateErrOnMistakenVerse?.fix?.type).toBe("setNumberRange");
        if (duplicateErrOnMistakenVerse?.fix?.type === "setNumberRange") {
            expect(duplicateErrOnMistakenVerse.fix.data.value).toBe("26");
        }
    });

    it("anchors paragraph-boundary note autofix to the previous real token (not synthetic para marker)", () => {
        // Regular-mode: root children are paragraph containers.
        // Paragraph 1 ends with an opening note (nested editor) but is missing its end marker.
        // When Paragraph 2 begins, lint should attach the autofix anchor to the last real token
        // (a token in the serialized tree), not to the synthetic paragraph marker token.

        const para1Id = "para-1";
        const para2Id = "para-2";
        const targetId = "note-text";

        const bookCode = createSerializedNode(
            "book-code",
            "GEN",
            "",
            TokenMap.bookCode,
        );

        const nested = makeNestedEditorNode({
            id: "note-open",
            marker: "f",
            sid: "GEN 1:1",
            innerChildren: [
                createSerializedNode(
                    "note-plus",
                    "+ ",
                    "f",
                    UsfmTokenTypes.text,
                ),
                createSerializedNode(
                    targetId,
                    "Footnote body",
                    "f",
                    UsfmTokenTypes.text,
                ),
                // Intentionally missing: \f*
            ],
        });

        const rootChildren: SerializedLexicalNode[] = [
            makeParagraphContainer(para1Id, "p", [bookCode, nested]),
            makeParagraphContainer(para2Id, "q1", [
                createSerializedNode(
                    "para2-text",
                    "Next paragraph",
                    "q1",
                    UsfmTokenTypes.text,
                ),
            ]),
        ];

        const editorState = makeEditorStateFromRootChildren(rootChildren);
        const flatTokens = getFlattenedEditorStateAsParseTokens(editorState);
        const ctx = initParseContext(flatTokens);
        const errors = lintExistingUsfmTokens(flatTokens, ctx);
        const err = errors.find(
            (e) => e.msgKey === LintErrorKeys.noteNotClosed,
        );

        expect(err).toBeTruthy();
        expect(err?.fix?.type).toBe("insertEndMarker");

        // The anchor must be the last real token before the paragraph boundary.
        expect(err?.fix?.data.nodeId).toBe(targetId);
        // It must not be the paragraph container id (synthetic marker token uses this id).
        expect(err?.fix?.data.nodeId).not.toBe(para2Id);
        expect(err?.fix?.data.nodeId).not.toBe(para1Id);

        const fixedState = applyAutofixToSerializedState(
            editorState,
            err as LintError,
        );
        expect(fixedState).toBeTruthy();

        const para1 = (fixedState?.root.children?.[0] ??
            rootChildren[0]) as USFMParagraphNodeJSON;
        const nestedAfterFix = para1.children[1] as unknown as {
            editorState: {
                root: {
                    children: Array<{ children: SerializedLexicalNode[] }>;
                };
            };
        };

        const wrapperChildren =
            nestedAfterFix.editorState.root.children[0]?.children ?? [];
        const targetIdx = wrapperChildren.findIndex(
            (n) => (n as SerializedUSFMTextNode).id === targetId,
        );
        expect(targetIdx).toBeGreaterThanOrEqual(0);

        const inserted = wrapperChildren[
            targetIdx + 1
        ] as SerializedUSFMTextNode;
        expect(inserted.tokenType).toBe(UsfmTokenTypes.endMarker);
        expect(inserted.marker).toBe("f");
        expect(inserted.text).toBe("\\f*");
    });

    it("also works when paragraph containers are nested under legacy 'paragraph' wrappers", () => {
        const para1Id = "para-1";
        const para2Id = "para-2";
        const targetId = "note-text";

        const bookCode = createSerializedNode(
            "book-code",
            "GEN",
            "",
            TokenMap.bookCode,
        );

        const nested = makeNestedEditorNode({
            id: "note-open",
            marker: "f",
            sid: "GEN 1:1",
            innerChildren: [
                createSerializedNode(
                    "note-plus",
                    "+ ",
                    "f",
                    UsfmTokenTypes.text,
                ),
                createSerializedNode(
                    targetId,
                    "Footnote body",
                    "f",
                    UsfmTokenTypes.text,
                ),
            ],
        });

        const para1 = makeParagraphContainer(para1Id, "p", [bookCode, nested]);
        const para2 = makeParagraphContainer(para2Id, "p", [
            createSerializedNode(
                "para2-text",
                "Next paragraph",
                "p",
                UsfmTokenTypes.text,
            ),
        ]);

        const rootChildren: SerializedLexicalNode[] = [
            makeSerializedParagraphWrapper([para1, para2]),
        ];

        const editorState = makeEditorStateFromRootChildren(rootChildren);
        const flatTokens = getFlattenedEditorStateAsParseTokens(editorState);
        const ctx = initParseContext(flatTokens);
        const errors = lintExistingUsfmTokens(flatTokens, ctx);
        const err = errors.find(
            (e) => e.msgKey === LintErrorKeys.noteNotClosed,
        );

        expect(err).toBeTruthy();
        expect(err?.fix?.type).toBe("insertEndMarker");
        expect(err?.fix?.data.nodeId).toBe(targetId);
        expect(err?.fix?.data.nodeId).not.toBe(para2Id);

        const fixedState = applyAutofixToSerializedState(
            editorState,
            err as LintError,
        );
        expect(fixedState).toBeTruthy();

        const wrapper = (fixedState?.root.children?.[0] ??
            rootChildren[0]) as SerializedElementNode;
        const para1AfterFix = wrapper.children[0] as USFMParagraphNodeJSON;
        const nestedAfterFix = para1AfterFix.children[1] as unknown as {
            editorState: {
                root: {
                    children: Array<{ children: SerializedLexicalNode[] }>;
                };
            };
        };
        const inner =
            nestedAfterFix.editorState.root.children[0]?.children ?? [];
        const idx = inner.findIndex(
            (n) => (n as SerializedUSFMTextNode).id === targetId,
        );
        expect(idx).toBeGreaterThanOrEqual(0);

        const inserted = inner[idx + 1] as SerializedUSFMTextNode;
        expect(inserted.marker).toBe("f");
        expect(inserted.tokenType).toBe(UsfmTokenTypes.endMarker);
    });
});
