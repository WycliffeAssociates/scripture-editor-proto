import type { SerializedElementNode, SerializedLexicalNode } from "lexical";
import { USFM_TEXT_NODE_TYPE, UsfmTokenTypes } from "@/app/data/editor.ts";
import {
    isSerializedUSFMNestedEditorNode,
    type USFMNestedEditorNodeJSON,
} from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { isSerializedParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    createSerializedUSFMTextNode,
    isSerializedToggleMutableUSFMTextNode,
    isSerializedToggleShowUSFMTextNode,
    type SerializedUSFMTextNode,
    updateSerializedToggleableUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";

export function adjustSerializedLexicalNodes(
    node: SerializedLexicalNode,
    options: { show: boolean; isMutable: boolean; flattenNested?: boolean },
): SerializedLexicalNode[] {
    const { show, isMutable, flattenNested = false } = options;

    if (node.type === USFM_TEXT_NODE_TYPE) {
        return [
            updateSerializedToggleableUSFMTextNode(
                node as SerializedUSFMTextNode,
                {
                    show: isSerializedToggleShowUSFMTextNode(node)
                        ? show
                        : true,
                    isMutable: isSerializedToggleMutableUSFMTextNode(node)
                        ? isMutable
                        : true,
                },
            ),
        ];
    }

    if (flattenNested && isSerializedUSFMNestedEditorNode(node)) {
        // Create opening marker node
        const openingMarker = createSerializedUSFMTextNode({
            text: `\\${node.marker} `,
            id: guidGenerator(),
            sid: node.sid || "",
            tokenType: UsfmTokenTypes.marker,
            marker: node.marker,
            show: true,
            isMutable: true,
        });

        const nestedChildren: SerializedLexicalNode[] =
            node.editorState.root.children.flatMap((child) => {
                if (isSerializedParagraphNode(child)) {
                    return (child.children || []).flatMap((c) =>
                        adjustSerializedLexicalNodes(c, options),
                    );
                }
                return adjustSerializedLexicalNodes(child, options);
            });

        return [openingMarker, ...nestedChildren];
    }

    if (isSerializedParagraphNode(node)) {
        const elementNode = node as SerializedElementNode;
        if (elementNode.children) {
            elementNode.children = elementNode.children.flatMap(
                (child: SerializedLexicalNode) =>
                    adjustSerializedLexicalNodes(child, options),
            );
        }
    }

    if (isSerializedUSFMNestedEditorNode(node)) {
        const nestedNode = node as USFMNestedEditorNodeJSON;
        if (nestedNode.editorState?.root?.children) {
            nestedNode.editorState.root.children =
                nestedNode.editorState.root.children.flatMap(
                    (child: SerializedLexicalNode) =>
                        adjustSerializedLexicalNodes(child, options),
                );
        }
    }

    return [node];
}
