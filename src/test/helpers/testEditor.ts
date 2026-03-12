import { createHeadlessEditor } from "@lexical/headless";
import {
    $getRoot,
    type LexicalEditor,
    LineBreakNode,
    ParagraphNode,
    TextNode,
} from "lexical";
import { USFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { USFMParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    $createUSFMTextNode,
    USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { onionFlatTokensToEditorState } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
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
            USFMNestedEditorNode,
        ],
    });
    const result = await webUsfmOnionService.projectUsfm(usfmContent);
    const serialized = onionFlatTokensToEditorState({
        tokens: result.tokens,
        direction: "ltr",
        targetMode: (opts.needsParagraphs ?? true) ? "regular" : "usfm",
    });
    editor.setEditorState(editor.parseEditorState(serialized));
    return editor;
}

export function getEditorTextContent(editor: LexicalEditor): string {
    return editor.getEditorState().read(() => $getRoot().getTextContent());
}
