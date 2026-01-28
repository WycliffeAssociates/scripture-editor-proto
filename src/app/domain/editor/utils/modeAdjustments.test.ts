import type { SerializedLexicalNode, SerializedLineBreakNode } from "lexical";
import { describe, expect, it } from "vitest";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import {
    createSerializedUSFMTextNode,
    isSerializedUSFMTextNode,
    type SerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    flattenParagraphContainersToFlatTokens,
    groupFlatTokensIntoParagraphContainers,
} from "./modeAdjustments.ts";

function createMarkerNode(marker: string, id: string): SerializedUSFMTextNode {
    return createSerializedUSFMTextNode({
        text: `\\${marker} `,
        id,
        sid: "",
        tokenType: UsfmTokenTypes.marker,
        marker,
        inPara: marker,
        show: true,
        isMutable: true,
    });
}

function createNumberNode(text: string, id: string): SerializedUSFMTextNode {
    return createSerializedUSFMTextNode({
        text,
        id,
        sid: "",
        tokenType: UsfmTokenTypes.numberRange,
        show: true,
        isMutable: true,
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

        const grouped = groupFlatTokensIntoParagraphContainers(
            flatTokens,
            "ltr",
        );
        const flattened = flattenParagraphContainersToFlatTokens(grouped, {
            show: true,
            isMutable: true,
        });

        const markers = flattened
            .filter(isSerializedUSFMTextNode)
            .filter((n) => n.tokenType === UsfmTokenTypes.marker)
            .map((n) => n.marker)
            .filter(Boolean);

        expect(markers[0]).toBe("c");
        expect(markers[0]).not.toBe("p");
    });
});
