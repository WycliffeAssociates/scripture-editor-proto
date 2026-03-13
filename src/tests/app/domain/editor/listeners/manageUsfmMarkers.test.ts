import { createHeadlessEditor } from "@lexical/headless";
import {
    $createParagraphNode,
    $getRoot,
    LineBreakNode,
    ParagraphNode,
    TextNode,
} from "lexical";
import { describe, expect, it } from "vitest";
import { inverseTextNodeTransform } from "@/app/domain/editor/listeners/manageUsfmMarkers.ts";
import { USFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { USFMParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    $createUSFMTextNode,
    USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";

describe("manageUsfmMarkers plus-prefixed markers", () => {
    it("keeps +xt marker tokens valid in source mode", () => {
        const editor = createHeadlessEditor({
            nodes: [
                USFMParagraphNode,
                USFMTextNode,
                {
                    replace: TextNode,
                    with: (node: TextNode) =>
                        $createUSFMTextNode(node.getTextContent(), {
                            id: guidGenerator(),
                            sid: "",
                            inPara: "",
                        }),
                    withKlass: USFMTextNode,
                },
                ParagraphNode,
                LineBreakNode,
                USFMNestedEditorNode,
            ],
        });

        let markerJson: Record<string, unknown> | undefined;

        editor.update(() => {
            const paragraph = $createParagraphNode();
            const marker = $createUSFMTextNode("\\+xt ", {
                id: "xt-marker",
                sid: "GEN 5:2",
                inPara: "p",
                inChars: ["ft"],
                marker: "xt",
                tokenType: "marker",
            });
            paragraph.append(marker);
            $getRoot().append(paragraph);

            inverseTextNodeTransform({
                node: marker,
                editor,
                editorMode: "usfm",
                languageDirection: "ltr",
            });

            markerJson = marker.exportJSON() as Record<string, unknown>;
        });

        expect(markerJson).toMatchObject({
            type: "usfm-text-node",
            tokenType: "marker",
            text: "\\+xt ",
            marker: "xt",
        });
    });
});
