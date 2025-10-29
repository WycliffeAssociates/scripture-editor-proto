import {
    $getRoot,
    ElementNode,
    type LexicalEditor,
    type LexicalNode,
    LineBreakNode,
} from "lexical";
import { USFM_TEXT_NODE_TYPE } from "@/app/data/editor";
import {
    $isUSFMNestedEditorNode,
    type USFMNestedEditorNode,
} from "@/app/domain/editor/nodes/USFMNestedEditorNode";
import { $isUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode";

export function $serializedLexicalToUsfm(editor: LexicalEditor) {
    return editor.getEditorState().read(() => {
        const root = $getRoot();
        const serialized = serializeNode(root, editor);
        return serialized;
    });
}

function serializeNode(node: LexicalNode, editor: LexicalEditor): string {
    const nodeType = node.getType();
    if ($isUSFMNestedEditorNode(node)) {
        return serializeNestedEditorState(node, editor);
    }
    if (nodeType === USFM_TEXT_NODE_TYPE && $isUSFMTextNode(node)) {
        return node.getTextContent();
    }
    if (node instanceof ElementNode || nodeType === "paragraph") {
        const elNode = node as ElementNode;
        const children = elNode.getChildren?.() ?? [];
        return children.map((c) => serializeNode(c, editor)).join("");
    }
    if (node instanceof LineBreakNode) {
        return "\n";
    }
    return "";
}

function serializeNestedEditorState(
    node: USFMNestedEditorNode,
    editor: LexicalEditor,
) {
    // what to
    const editorState = editor.parseEditorState(node.getLatestEditorState());
    let nestedVal = `\\${node.getMarker()} `;
    editorState.read(() => {
        const nestedRoot = $getRoot();
        nestedVal += nestedRoot
            .getChildren()
            .map((c) => serializeNode(c, editor))
            .join("");
        nestedVal += ` \\${node.getMarker()}*`;
        return nestedVal;
    });
    return nestedVal;
}
