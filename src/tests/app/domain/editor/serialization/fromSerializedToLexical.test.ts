import type { SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";
import type { USFMNodeJSON } from "@/app/data/editor.ts";
import { USFM_PARAGRAPH_NODE_TYPE, UsfmTokenTypes } from "@/app/data/editor.ts";
import { isSerializedUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { groupFlatNodesIntoParagraphContainers } from "@/app/domain/editor/serialization/fromSerializedToLexical.ts";
import { materializeFlatTokensArray } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";
import { tokensToLexical } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { webUsfmOnionService } from "@/web/domain/usfm/WebUsfmOnionService.ts";

const usfmWithFootnote =
    "\\c 1\n" +
    "\\v 9 The land mourns and wastes away; " +
    "\\f + \\ft The word mourns. \\f*";

async function getProjectedState(mode: "regular" | "flat") {
    const projected = await webUsfmOnionService.projectUsfm(
        `\\id GEN\n${usfmWithFootnote}`,
    );
    return tokensToLexical({
        tokens: projected.tokens,
        direction: "ltr",
        mode,
    });
}

describe("tokensToLexical nested editor invariants", () => {
    it("uses nested decorator nodes in regular mode", async () => {
        const lexicalState = await getProjectedState("regular");

        const flat = materializeFlatTokensArray(
            lexicalState.root.children as SerializedLexicalNode[],
            { nested: "preserve" },
        );
        expect(flat.some(isSerializedUSFMNestedEditorNode)).toBe(true);
    });

    it("flattens nested markers in usfm/plain modes", async () => {
        const lexicalState = await getProjectedState("flat");

        const flat = materializeFlatTokensArray(
            lexicalState.root.children as SerializedLexicalNode[],
            { nested: "preserve" },
        );
        expect(flat.some(isSerializedUSFMNestedEditorNode)).toBe(false);
    });
});

describe("groupFlatNodesIntoParagraphContainers whitespace placement", () => {
    it("preserves paragraph marker trailing whitespace on the marker token", () => {
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
        expect(result[0]?.markerText).toBe("\\p ");
        expect(result[0]?.children?.[0]?.text).toBe("Text");
    });

    it("preserves chapter marker trailing whitespace on the marker token", () => {
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
        expect(result[0]?.markerText).toBe("\\c ");
        expect(result[0]?.children?.[0]?.text).toBe("1");
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

    it("round-trips adjacent inline note markers with explicit separator spaces", async () => {
        const usfm =
            "\\c 148\n" +
            "\\q2 praise Him in the highest places.\\f + \\fr 148:1 \\ft See \\+xt Matthew 21:9,\\+xt* \\+xt Mark 11:10,\\+xt* and \\+xt Luke 19:38\\+xt*.\\f*\n";

        const projected = await webUsfmOnionService.projectUsfm(
            `\\id PSA\n${usfm}`,
        );
        const lexicalState = tokensToLexical({
            tokens: projected.tokens,
            direction: "ltr",
            mode: "regular",
        });
        const roundTripped = materializeFlatTokensArray(
            lexicalState.root.children as SerializedLexicalNode[],
        )
            .map((node) =>
                "text" in node && typeof node.text === "string"
                    ? node.text
                    : "",
            )
            .join("");

        expect(roundTripped).toContain(
            "\\+xt Matthew 21:9,\\+xt* \\+xt Mark 11:10,\\+xt*",
        );
        expect(roundTripped).not.toContain("\\+xt*\\+xt");
    });
});
