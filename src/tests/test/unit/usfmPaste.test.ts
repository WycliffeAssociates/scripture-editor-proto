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
    parseClipboardUsfmToTokens,
    parsedUsfmTokensToInsertableNodes,
} from "@/app/domain/editor/utils/usfmPaste.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import { webUsfmOnionService } from "@/web/domain/usfm/WebUsfmOnionService.ts";

function createMockUsfmOnionService(): IUsfmOnionService {
    return {
        getMarkerCatalog: () => webUsfmOnionService.getMarkerCatalog(),
        projectUsfm: (
            source: string,
            options?: Parameters<IUsfmOnionService["projectUsfm"]>[1],
        ) => webUsfmOnionService.projectUsfm(source, options),
        parseUsfmChapter: (chapterUsfm: string, bookCode: string) =>
            webUsfmOnionService.parseUsfmChapter(chapterUsfm, bookCode),
    } as unknown as IUsfmOnionService;
}

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

    it("parses clipboard USFM with current-book fallback and returns insertable nodes", async () => {
        const editor = createEditor();
        const usfmOnionService = createMockUsfmOnionService();
        const result = await parseClipboardUsfmToTokens({
            text: "\\v 1 In the beginning God created the heavens and the earth.",
            bookCode: "GEN",
            direction: "ltr",
            usfmOnionService,
        });
        let hasVerseMarker = false;

        editor.update(() => {
            if (result.ok) {
                const nodes = parsedUsfmTokensToInsertableNodes(result.tokens);
                hasVerseMarker = nodes.some(
                    (node) =>
                        $isUSFMTextNode(node) &&
                        node.getTokenType() === UsfmTokenTypes.marker &&
                        node.getMarker() === "v",
                );
            }
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(
            result.tokens.some(
                (token) =>
                    token.tokenType === UsfmTokenTypes.marker &&
                    token.marker === "id",
            ),
        ).toBe(false);
        expect(hasVerseMarker).toBe(true);
    });

    it("rejects invalid USFM-like paste with a structured parse failure", async () => {
        const result = await parseClipboardUsfmToTokens({
            text: "\\v xyz Not a valid verse marker range",
            bookCode: "GEN",
            direction: "ltr",
            usfmOnionService: createMockUsfmOnionService(),
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe("parse-failed");
    });

    it("supports insertion into current selection (including chapter markers)", async () => {
        const editor = createEditor();
        const parsed = await parseClipboardUsfmToTokens({
            text: "\\c 2\n\\v 1 Inserted text",
            bookCode: "GEN",
            direction: "ltr",
            usfmOnionService: createMockUsfmOnionService(),
        });
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;

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

                const selection = $getSelection();
                if (!$isRangeSelection(selection)) {
                    throw new Error("Expected range selection");
                }
                selection.insertNodes(
                    parsedUsfmTokensToInsertableNodes(parsed.tokens),
                );
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

    it("accepts the multiline scripture marker block from real paste usage", async () => {
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

        const parsed = await parseClipboardUsfmToTokens({
            text: block,
            bookCode: "HEB",
            direction: "ltr",
            usfmOnionService: createMockUsfmOnionService(),
        });
        expect(parsed.ok).toBe(true);
    });
});
