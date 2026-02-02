import type { SerializedLexicalNode, SerializedLineBreakNode } from "lexical";
import { describe, expect, it } from "vitest";
import { USFM_PARAGRAPH_NODE_TYPE, UsfmTokenTypes } from "@/app/data/editor.ts";
import { USFM_NESTED_DECORATOR_TYPE } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import {
    createSerializedUSFMTextNode,
    isSerializedUSFMTextNode,
    type SerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { groupFlatNodesIntoParagraphContainers } from "@/app/domain/editor/serialization/fromSerializedToLexical.ts";
import { flattenParagraphContainersToFlatTokens } from "./modeAdjustments.ts";

function createMarkerNode(marker: string, id: string): SerializedUSFMTextNode {
    return createSerializedUSFMTextNode({
        text: `\\${marker} `,
        id,
        sid: "",
        tokenType: UsfmTokenTypes.marker,
        marker,
        inPara: marker,
    });
}

function createNumberNode(text: string, id: string): SerializedUSFMTextNode {
    return createSerializedUSFMTextNode({
        text,
        id,
        sid: "",
        tokenType: UsfmTokenTypes.numberRange,
    });
}

describe("modeAdjustments grouping", () => {
    it("should not synthesize a leading \\p before a top-level \\c container", () => {
        const lb: SerializedLineBreakNode = { type: "linebreak", version: 1 };
        const flatTokens: SerializedLexicalNode[] = [
            lb,
            createMarkerNode("c", "c-1"),
            createNumberNode("1", "nr-1"),
            lb,
            createMarkerNode("p", "p-1"),
            createMarkerNode("v", "v-1"),
            createNumberNode("1", "nr-2"),
        ];

        const grouped = groupFlatNodesIntoParagraphContainers(
            flatTokens,
            "ltr",
        );
        const flattened = flattenParagraphContainersToFlatTokens(grouped);

        const markers = flattened
            .filter(isSerializedUSFMTextNode)
            .filter((n) => n.tokenType === UsfmTokenTypes.marker)
            .map((n) => n.marker)
            .filter(Boolean);

        expect(markers[0]).toBe("c");
        expect(markers[0]).not.toBe("p");
    });

    it("should preserve paragraph container markerText when flattening", () => {
        const container = {
            type: USFM_PARAGRAPH_NODE_TYPE,
            version: 1,
            direction: "ltr" as const,
            format: "start" as const,
            indent: 0,
            tokenType: UsfmTokenTypes.marker,
            id: "para-1",
            sid: "",
            marker: "m",
            inPara: "m",
            markerText: "\\m",
            children: [],
        };

        const flattened = flattenParagraphContainersToFlatTokens([
            container as any,
        ]);
        const first = flattened[0];
        expect(first && isSerializedUSFMTextNode(first)).toBe(true);
        expect((first as any).text).toBe("\\m");
    });

    it("should preserve nested editor opening marker text when flattening", () => {
        const nested = {
            type: USFM_NESTED_DECORATOR_TYPE,
            version: 1,
            tokenType: UsfmTokenTypes.marker,
            id: "nested-1",
            text: "\\f",
            marker: "f",
            editorState: {
                root: {
                    type: "root",
                    version: 1,
                    direction: "ltr" as const,
                    format: "",
                    indent: 0,
                    children: [],
                },
            },
        };

        const flattened = flattenParagraphContainersToFlatTokens([
            nested as any,
        ]);
        expect(flattened[0] && isSerializedUSFMTextNode(flattened[0])).toBe(
            true,
        );
        expect((flattened[0] as any).text).toBe("\\f");
    });
});
