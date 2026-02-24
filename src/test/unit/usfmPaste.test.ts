import { createHeadlessEditor } from "@lexical/headless";
import {
    $getRoot,
    $getSelection,
    $isRangeSelection,
    $isTextNode,
    type LexicalEditor,
    LineBreakNode,
    ParagraphNode,
    TextNode,
} from "lexical";
import { describe, expect, it } from "vitest";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { USFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { USFMParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    $createUSFMTextNode,
    $isUSFMTextNode,
    USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    isUsfmLikePaste,
    parseClipboardUsfmToInsertableNodes,
    parseClipboardUsfmToTokens,
} from "@/app/domain/editor/utils/usfmPaste.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";

function createEditor(): LexicalEditor {
    return createHeadlessEditor({
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
}

describe("usfmPaste", () => {
    it("detects USFM-like marker blocks and ignores plain prose", () => {
        const usfmBlock = `\\s5
\\v 4 He has become just as superior to the angels.
\\q "You are my Son,"
\\q2 today I have become your Father"`;

        expect(isUsfmLikePaste(usfmBlock)).toBe(true);
        expect(
            isUsfmLikePaste("This is plain text with no scripture markers."),
        ).toBe(false);
    });

    it("parses clipboard USFM with current-book fallback and returns insertable nodes", () => {
        const editor = createEditor();
        let result:
            | ReturnType<typeof parseClipboardUsfmToInsertableNodes>
            | undefined;
        let hasVerseMarker = false;
        editor.update(() => {
            result = parseClipboardUsfmToInsertableNodes({
                text: "\\v 1 In the beginning God created the heavens and the earth.",
                bookCode: "GEN",
                direction: "ltr",
            });

            if (result?.ok) {
                hasVerseMarker = result.nodes.some(
                    (node) =>
                        $isUSFMTextNode(node) &&
                        node.getTokenType() === UsfmTokenTypes.marker &&
                        node.getMarker() === "v",
                );
            }
        });

        expect(result).toBeTruthy();
        if (!result) return;
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(hasVerseMarker).toBe(true);
    });

    it("rejects invalid USFM-like paste with a structured parse failure", () => {
        const result = parseClipboardUsfmToInsertableNodes({
            text: "\\v xyz Not a valid verse marker range",
            bookCode: "GEN",
            direction: "ltr",
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe("parse-failed");
    });

    it("supports insertion into current selection (including chapter markers)", () => {
        const editor = createEditor();
        editor.update(
            () => {
                const root = $getRoot();
                const para = new ParagraphNode();
                para.append(
                    $createUSFMTextNode("Hello ", {
                        id: "seed-1",
                        sid: "GEN 1:1",
                        inPara: "p",
                        tokenType: UsfmTokenTypes.text,
                    }),
                );
                root.append(para);
                para.selectEnd();

                const parsed = parseClipboardUsfmToInsertableNodes({
                    text: "\\c 2\n\\v 1 Inserted text",
                    bookCode: "GEN",
                    direction: "ltr",
                });
                expect(parsed.ok).toBe(true);
                if (!parsed.ok) return;

                const selection = $getSelection();
                if (!$isRangeSelection(selection)) {
                    throw new Error("Expected range selection");
                }
                selection.insertNodes(parsed.nodes);
            },
            { discrete: true },
        );

        editor.getEditorState().read(() => {
            const allText = $getRoot().getAllTextNodes();
            const hasChapterMarker = allText.some(
                (node) =>
                    $isUSFMTextNode(node) &&
                    node.getTokenType() === UsfmTokenTypes.marker &&
                    node.getMarker() === "c",
            );
            expect(hasChapterMarker).toBe(true);

            const joined = allText
                .map((n) => ($isTextNode(n) ? n.getTextContent() : ""))
                .join("");
            expect(joined).toContain("Inserted text");
        });
    });

    it("accepts the multiline scripture marker block from real paste usage", () => {
        const block = `\\s5
\\v 4 He has become just as superior to the angels as the name he has inherited is more excellent than their name.
\\v 5 For to which of the angels did God ever say,
\\q "You are my Son,
\\q2 today I have become your Father"?
\\b
\\p Or to which of the angels did God ever say,
\\b
\\q "I will be a Father to him,
\\q2 and he will be a Son to me"?`;

        const parsed = parseClipboardUsfmToTokens({
            text: block,
            bookCode: "HEB",
            direction: "ltr",
        });
        expect(parsed.ok).toBe(true);
    });
});
