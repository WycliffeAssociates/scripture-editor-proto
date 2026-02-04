import type { SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";
import type { USFMNodeJSON } from "@/app/data/editor.ts";
import { USFM_PARAGRAPH_NODE_TYPE, UsfmTokenTypes } from "@/app/data/editor.ts";
import { isSerializedUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import {
    groupFlatNodesIntoParagraphContainers,
    parsedUsfmTokensToLexicalStates,
} from "@/app/domain/editor/serialization/fromSerializedToLexical.ts";
import { materializeFlatTokensArray } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";
import { parseUSFMChapter } from "@/core/domain/usfm/parse.ts";

const usfmWithFootnote =
    "\\c 1\n" +
    "\\v 9 The land mourns and wastes away; " +
    "\\f + \\ft The word mourns. \\f*";

function getChapter1Tokens() {
    const parsed = parseUSFMChapter(usfmWithFootnote, "GEN");
    return parsed.usfm[1] ?? [];
}

describe("parsedUsfmTokensToLexicalStates nested editor invariants", () => {
    it("uses nested decorator nodes in regular mode", () => {
        const tokens = getChapter1Tokens();
        const { lexicalState } = parsedUsfmTokensToLexicalStates(
            tokens,
            "ltr",
            true,
        );

        const flat = materializeFlatTokensArray(
            lexicalState.root.children as SerializedLexicalNode[],
            { nested: "preserve" },
        );
        expect(flat.some(isSerializedUSFMNestedEditorNode)).toBe(true);
    });

    it("flattens nested markers in usfm/plain modes", () => {
        const tokens = getChapter1Tokens();
        const { lexicalState } = parsedUsfmTokensToLexicalStates(
            tokens,
            "ltr",
            false,
        );

        const flat = materializeFlatTokensArray(
            lexicalState.root.children as SerializedLexicalNode[],
            { nested: "preserve" },
        );
        expect(flat.some(isSerializedUSFMNestedEditorNode)).toBe(false);
    });
});

describe("groupFlatNodesIntoParagraphContainers whitespace placement", () => {
    it("moves marker trailing whitespace to the first text child as leading whitespace", () => {
        const flat: SerializedLexicalNode[] = [
            {
                type: "usfm-text-node",
                lexicalType: "usfm-text-node",
                tokenType: UsfmTokenTypes.marker,
                marker: "p",
                text: "\\p ",
                id: "m1",
                sid: "GEN 1:0",
                version: 1,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
            } as unknown as SerializedLexicalNode,
            {
                type: "usfm-text-node",
                lexicalType: "usfm-text-node",
                tokenType: UsfmTokenTypes.text,
                text: "Text",
                id: "t1",
                sid: "GEN 1:1",
                version: 1,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
            } as unknown as SerializedLexicalNode,
        ];

        const result = groupFlatNodesIntoParagraphContainers(
            flat as unknown as USFMNodeJSON[],
            "ltr",
        ) as unknown as Array<{
            type: string;
            markerText?: string;
            children?: Array<{ text?: string }>;
        }>;

        expect(result[0]?.type).toBe(USFM_PARAGRAPH_NODE_TYPE);
        expect(result[0]?.markerText).toBe("\\p");
        expect(result[0]?.children?.[0]?.text).toBe(" Text");
    });

    it("moves marker trailing whitespace to the first numberRange child as leading whitespace", () => {
        const flat: SerializedLexicalNode[] = [
            {
                type: "usfm-text-node",
                lexicalType: "usfm-text-node",
                tokenType: UsfmTokenTypes.marker,
                marker: "c",
                text: "\\c ",
                id: "m1",
                sid: "GEN 1:0",
                version: 1,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
            } as unknown as SerializedLexicalNode,
            {
                type: "usfm-text-node",
                lexicalType: "usfm-text-node",
                tokenType: UsfmTokenTypes.numberRange,
                text: "1",
                id: "n1",
                sid: "GEN 1:0",
                version: 1,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
            } as unknown as SerializedLexicalNode,
        ];

        const result = groupFlatNodesIntoParagraphContainers(
            flat as unknown as USFMNodeJSON[],
            "ltr",
        ) as unknown as Array<{
            type: string;
            markerText?: string;
            children?: Array<{ text?: string }>;
        }>;

        expect(result[0]?.type).toBe(USFM_PARAGRAPH_NODE_TYPE);
        expect(result[0]?.markerText).toBe("\\c");
        expect(result[0]?.children?.[0]?.text).toBe(" 1");
    });

    it("preserves marker trailing whitespace when the paragraph is empty (marker + linebreak)", () => {
        const flat: SerializedLexicalNode[] = [
            {
                type: "usfm-text-node",
                lexicalType: "usfm-text-node",
                tokenType: UsfmTokenTypes.marker,
                marker: "q1",
                text: "\\q1 ",
                id: "m1",
                sid: "GEN 3:14",
                version: 1,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
            } as unknown as SerializedLexicalNode,
            {
                type: "linebreak",
                version: 1,
            } as unknown as SerializedLexicalNode,
        ];

        const result = groupFlatNodesIntoParagraphContainers(
            flat as unknown as USFMNodeJSON[],
            "ltr",
        ) as unknown as Array<{
            type: string;
            markerText?: string;
            children?: Array<{ type?: string; text?: string }>;
        }>;

        expect(result[0]?.type).toBe(USFM_PARAGRAPH_NODE_TYPE);
        expect(result[0]?.markerText).toBe("\\q1 ");
        expect(result[0]?.children?.[0]?.type).toBe("linebreak");
    });
});
