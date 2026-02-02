import type { SerializedElementNode, SerializedLexicalNode } from "lexical";
import { USFM_TEXT_NODE_TYPE, UsfmTokenTypes } from "@/app/data/editor.ts";
import {
    isSerializedUSFMNestedEditorNode,
    type USFMNestedEditorNodeJSON,
} from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import {
    isSerializedParagraphNode,
    type USFMParagraphNodeJSON,
} from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import { createSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { isSerializedUSFMParagraphContainer } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";

export function adjustSerializedLexicalNodes(
    node: SerializedLexicalNode,
    options?: { flattenNested?: boolean },
): SerializedLexicalNode[] {
    const { flattenNested = false } = options ?? {};

    if (node.type === USFM_TEXT_NODE_TYPE) {
        return [node];
    }

    if (flattenNested && isSerializedUSFMNestedEditorNode(node)) {
        // Create opening marker node
        const openingMarker = createSerializedUSFMTextNode({
            text: node.text ?? `\\${node.marker} `,
            id: guidGenerator(),
            sid: node.sid || "",
            tokenType: UsfmTokenTypes.marker,
            marker: node.marker,
        });

        const nestedChildren = flattenParagraphContainersToFlatTokens(
            node.editorState?.root?.children ?? [],
            options,
        );

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

/**
 * Flattens paragraph-tree structure into a flat token stream for Source mode.
 * Each USFMParagraphNode container is converted to a paragraph marker token
 * followed by its children (preserving node IDs where possible).
 */
export function flattenParagraphContainersToFlatTokens(
    rootChildren: SerializedLexicalNode[],
    options?: { flattenNested?: boolean },
): SerializedLexicalNode[] {
    const flattenNestedEditors = options?.flattenNested ?? true;
    const result: SerializedLexicalNode[] = [];

    for (const node of rootChildren) {
        if (isSerializedUSFMParagraphContainer(node)) {
            const paragraphNode = node as USFMParagraphNodeJSON;
            const marker = paragraphNode.marker ?? "p";

            // Emit paragraph marker token (using the container's ID to preserve identity)
            const markerToken = createSerializedUSFMTextNode({
                text: paragraphNode.markerText ?? `\\${marker}`,
                id: paragraphNode.id,
                sid: paragraphNode.sid ?? "",
                tokenType: UsfmTokenTypes.marker,
                marker,
                inPara: marker,
            });
            result.push(markerToken);

            // Recursively flatten children (handle nested paragraph containers if any)
            const flattenedChildren = flattenParagraphContainersToFlatTokens(
                paragraphNode.children ?? [],
                options,
            );
            result.push(...flattenedChildren);
        } else {
            // Regular token - apply show/mutable adjustments
            const adjusted = adjustSerializedLexicalNodes(node, {
                flattenNested: flattenNestedEditors,
            });
            result.push(...adjusted);
        }
    }

    return result;
}

// Note: wrapFlatTokensInLexicalParagraph is now exported from modeTransforms.ts for shared use
