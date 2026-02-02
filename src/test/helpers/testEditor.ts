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
import { parsedUsfmTokensToLexicalStates } from "@/app/domain/editor/serialization/fromSerializedToLexical.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";
import { parseUSFMChapter } from "@/core/domain/usfm/parse.ts";

export function createTestEditor(
    usfmContent: string,
    opts: { needsParagraphs?: boolean } = {},
): LexicalEditor {
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
    const result = parseUSFMChapter(usfmContent, "GEN");
    // Get tokens from chapter 1 (or first available chapter)
    const chapterKeys = Object.keys(result.usfm)
        .map(Number)
        .sort((a, b) => a - b);
    // Try to get chapter 1 first, fall back to first available chapter
    const targetChapter = chapterKeys.includes(1) ? 1 : chapterKeys[0];
    const tokens = result.usfm[targetChapter] || [];
    const { lexicalState: serialized } = parsedUsfmTokensToLexicalStates(
        tokens,
        "ltr",
        opts.needsParagraphs ?? true,
    );
    editor.setEditorState(editor.parseEditorState(serialized));
    return editor;
}

export function getEditorTextContent(editor: LexicalEditor): string {
    return editor.getEditorState().read(() => $getRoot().getTextContent());
}
