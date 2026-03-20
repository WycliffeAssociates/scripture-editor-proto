import { createHeadlessEditor } from "@lexical/headless";
import {
    $getRoot,
    $getSelection,
    $isRangeSelection,
    LineBreakNode,
    ParagraphNode,
    TextNode,
} from "lexical";
import { describe, expect, it } from "vitest";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import {
    $createUSFMParagraphNode,
    USFMParagraphNode,
} from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    $createUSFMTextNode,
    $isUSFMTextNode,
    USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { expandSelectionToIncludePrecedingVerseMarker } from "@/app/domain/editor/utils/expandSelectionToIncludeVerseMarker.ts";

function createEmptyTestEditor() {
    return createHeadlessEditor({
        nodes: [
            USFMParagraphNode,
            USFMTextNode,
            {
                replace: TextNode,
                with: (node: TextNode) =>
                    $createUSFMTextNode(node.getTextContent(), {
                        id: "replace-text",
                        sid: "",
                        inPara: "",
                    }),
                withKlass: USFMTextNode,
            },
            ParagraphNode,
            LineBreakNode,
        ],
    });
}

describe("expandSelectionToIncludePrecedingVerseMarker", () => {
    it("expands a forward selection that starts inside a verse numberRange to include the preceding \\v marker", async () => {
        const editor = createEmptyTestEditor();

        let markerKey = "";
        let numberKey = "";

        await new Promise<void>((resolve) => {
            editor.update(
                () => {
                    const root = $getRoot();
                    for (const child of root.getChildren()) child.remove();

                    const para = $createUSFMParagraphNode({
                        id: "p1",
                        marker: "p",
                        tokenType: UsfmTokenTypes.marker,
                    });

                    const marker = $createUSFMTextNode("\\v", {
                        id: "m1",
                        tokenType: UsfmTokenTypes.marker,
                        marker: "v",
                        sid: "GEN 1:1",
                        inPara: "p",
                    });
                    const number = $createUSFMTextNode(" 1", {
                        id: "n1",
                        tokenType: UsfmTokenTypes.numberRange,
                        sid: "GEN 1:1",
                        inPara: "p",
                    });
                    markerKey = marker.getKey();
                    numberKey = number.getKey();

                    para.append(marker, number);
                    root.append(para);

                    // Select only the digit "1" within " 1" (offset 1..2).
                    number.select(1, 2);

                    const selection = $getSelection();
                    if (!$isRangeSelection(selection)) {
                        throw new Error("Expected RangeSelection");
                    }

                    const didExpand =
                        expandSelectionToIncludePrecedingVerseMarker(selection);
                    expect(didExpand).toBe(true);

                    expect(selection.anchor.key).toBe(markerKey);
                    expect(selection.anchor.offset).toBe(0);
                    expect(selection.anchor.type).toBe("text");

                    expect(selection.focus.key).toBe(numberKey);
                    expect(selection.focus.offset).toBe(2);
                    expect(selection.focus.type).toBe("text");
                },
                { discrete: true, onUpdate: resolve },
            );
        });
    });

    it("expands a backward selection that starts inside a verse numberRange to include the preceding \\v marker", async () => {
        const editor = createEmptyTestEditor();

        let markerKey = "";
        let numberKey = "";

        await new Promise<void>((resolve) => {
            editor.update(
                () => {
                    const root = $getRoot();
                    for (const child of root.getChildren()) child.remove();

                    const para = $createUSFMParagraphNode({
                        id: "p1",
                        marker: "p",
                        tokenType: UsfmTokenTypes.marker,
                    });

                    const marker = $createUSFMTextNode("\\v", {
                        id: "m1",
                        tokenType: UsfmTokenTypes.marker,
                        marker: "v",
                        sid: "GEN 1:1",
                        inPara: "p",
                    });
                    const number = $createUSFMTextNode(" 1", {
                        id: "n1",
                        tokenType: UsfmTokenTypes.numberRange,
                        sid: "GEN 1:1",
                        inPara: "p",
                    });
                    markerKey = marker.getKey();
                    numberKey = number.getKey();

                    para.append(marker, number);
                    root.append(para);

                    // Backward selection: anchor at end, focus at digit start.
                    const selection = number.select(2, 1);
                    expect(selection.isBackward()).toBe(true);

                    const didExpand =
                        expandSelectionToIncludePrecedingVerseMarker(selection);
                    expect(didExpand).toBe(true);

                    // The start-point for a backward selection is `focus`.
                    expect(selection.focus.key).toBe(markerKey);
                    expect(selection.focus.offset).toBe(0);
                    expect(selection.focus.type).toBe("text");

                    expect(selection.anchor.key).toBe(numberKey);
                    expect(selection.anchor.offset).toBe(2);
                    expect(selection.anchor.type).toBe("text");
                },
                { discrete: true, onUpdate: resolve },
            );
        });
    });

    it("does not expand when the preceding marker is not a verse marker", async () => {
        const editor = createEmptyTestEditor();

        await new Promise<void>((resolve) => {
            editor.update(
                () => {
                    const root = $getRoot();
                    for (const child of root.getChildren()) child.remove();

                    const para = $createUSFMParagraphNode({
                        id: "p1",
                        marker: "p",
                        tokenType: UsfmTokenTypes.marker,
                    });

                    const marker = $createUSFMTextNode("\\c", {
                        id: "m1",
                        tokenType: UsfmTokenTypes.marker,
                        marker: "c",
                        sid: "GEN 1:1",
                        inPara: "p",
                    });
                    const number = $createUSFMTextNode(" 1", {
                        id: "n1",
                        tokenType: UsfmTokenTypes.numberRange,
                        sid: "GEN 1:1",
                        inPara: "p",
                    });

                    para.append(marker, number);
                    root.append(para);

                    number.select(1, 2);

                    const selection = $getSelection();
                    if (!$isRangeSelection(selection)) {
                        throw new Error("Expected RangeSelection");
                    }

                    const prev = number.getPreviousSibling();
                    expect($isUSFMTextNode(prev)).toBe(true);

                    const didExpand =
                        expandSelectionToIncludePrecedingVerseMarker(selection);
                    expect(didExpand).toBe(false);

                    // Anchor stays on the number node.
                    expect(selection.anchor.key).toBe(number.getKey());
                },
                { discrete: true, onUpdate: resolve },
            );
        });
    });
});
