import { createHeadlessEditor } from "@lexical/headless";
import {
    $getRoot,
    type LexicalEditor,
    LineBreakNode,
    ParagraphNode,
    TextNode,
} from "lexical";
import { BookFrontmatterFormNode } from "@/app/domain/editor/nodes/BookFrontmatterFormNode.tsx";
import { USFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { USFMNumberedMarkerNode } from "@/app/domain/editor/nodes/USFMNumberedMarkerNode.ts";
import { USFMParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    $createUSFMTextNode,
    USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { tokensToLexical } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";
import { webUsfmOnionService } from "@/web/domain/usfm/WebUsfmOnionService.ts";

export async function createTestEditor(
    usfmContent: string,
    opts: { needsParagraphs?: boolean } = {},
): Promise<LexicalEditor> {
    const editor = createHeadlessEditor({
        nodes: [
            USFMParagraphNode,
            USFMTextNode,
            USFMNumberedMarkerNode,
            {
                replace: TextNode,
                with: (node: TextNode) => {
                    return $createUSFMTextNode(node.getTextContent(), {
                        id: guidGenerator(),
                        sid: "",
                        inPara: "",
                    });
                },
                withKlass: USFMTextNode,
            },
            ParagraphNode,
            LineBreakNode,
            BookFrontmatterFormNode,
            USFMNestedEditorNode,
        ],
    });
    const result = await webUsfmOnionService.parseUsfm(usfmContent);
    const serialized = tokensToLexical({
        tokens: result.tokens,
        direction: "ltr",
        mode: (opts.needsParagraphs ?? true) ? "regular" : "flat",
    });
    editor.setEditorState(editor.parseEditorState(serialized));
    return editor;
}

export function getEditorTextContent(editor: LexicalEditor): string {
    return editor.getEditorState().read(() => $getRoot().getTextContent());
}
