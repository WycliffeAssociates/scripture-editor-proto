import type { SerializedElementNode, SerializedLexicalNode } from "lexical";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { isSerializedElementNode } from "@/app/domain/editor/nodes/USFMElementNode.ts";
import {
    isSerializedUSFMNestedEditorNode,
    type USFMNestedEditorNodeJSON,
} from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import {
    isSerializedUSFMTextNode,
    type SerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { VALID_PARA_MARKERS } from "@/core/data/usfm/tokens.ts";

export type PrettifyContext = {
    previousSibling?: SerializedLexicalNode;
    nextSibling?: SerializedLexicalNode;
};

export type PrettifyTransform = (
    node: SerializedLexicalNode,
    context: PrettifyContext,
) => SerializedLexicalNode | SerializedLexicalNode[];

/**
 * Replaces multiple consecutive spaces with a single space.
 * Preserves \n. Trims trailing spaces to max 1.
 */
export function collapseWhitespaceInTextNode(
    node: SerializedUSFMTextNode,
): SerializedUSFMTextNode {
    if (node.tokenType !== UsfmTokenTypes.text) return node;

    // Replace multiple whitespace characters with a single space
    const newText = node.text.replace(/\s+/g, " ");

    if (newText === node.text) return node;

    return {
        ...node,
        text: newText,
    } as SerializedUSFMTextNode;
}

/**
 * If node is a numberRange following a \c marker, ensure a linebreak node follows it.
 */
export function insertLinebreakAfterChapterNumberRange(
    node: SerializedLexicalNode,
    context: PrettifyContext,
): SerializedLexicalNode | SerializedLexicalNode[] {
    if (
        isSerializedUSFMTextNode(node) &&
        node.tokenType === UsfmTokenTypes.numberRange &&
        node.marker === "c"
    ) {
        const { nextSibling } = context;
        if (nextSibling && nextSibling.type === "linebreak") {
            return node;
        }
        return [node, { type: "linebreak", version: 1 }];
    }
    return node;
}

/**
 * Ensure a linebreak node exists before any VALID_PARA_MARKERS.
 */
export function insertLinebreakBeforeParaMarkers(
    node: SerializedLexicalNode,
    context: PrettifyContext,
): SerializedLexicalNode | SerializedLexicalNode[] {
    if (
        isSerializedUSFMTextNode(node) &&
        node.marker &&
        VALID_PARA_MARKERS.has(node.marker)
    ) {
        const { previousSibling } = context;
        if (previousSibling && previousSibling.type === "linebreak") {
            return node;
        }
        // If it's the first node, we don't necessarily need a linebreak before it
        if (!previousSibling) return node;

        return [{ type: "linebreak", version: 1 }, node];
    }
    return node;
}

/**
 * Ensure a linebreak node exists after any VALID_PARA_MARKERS.
 */
export function insertLinebreakAfterParaMarkers(
    node: SerializedLexicalNode,
    context: PrettifyContext,
): SerializedLexicalNode | SerializedLexicalNode[] {
    if (
        isSerializedUSFMTextNode(node) &&
        node.marker &&
        VALID_PARA_MARKERS.has(node.marker)
    ) {
        const { nextSibling } = context;
        if (nextSibling && nextSibling.type === "linebreak") {
            return node;
        }
        return [node, { type: "linebreak", version: 1 }];
    }
    return node;
}

/**
 * Reduce multiple spaces between a paragraph marker and its content to a single space.
 */
export function normalizeSpacingAfterParaMarkers(
    node: SerializedLexicalNode,
    context: PrettifyContext,
): SerializedLexicalNode | SerializedLexicalNode[] {
    if (
        isSerializedUSFMTextNode(node) &&
        node.tokenType === UsfmTokenTypes.text
    ) {
        const usfmNode = node as SerializedUSFMTextNode;
        const { previousSibling } = context;
        if (
            previousSibling &&
            isSerializedUSFMTextNode(previousSibling) &&
            previousSibling.marker &&
            VALID_PARA_MARKERS.has(previousSibling.marker)
        ) {
            // Normalize leading spaces to exactly one space
            const newText = usfmNode.text.replace(/^ +/, " ");
            if (newText !== usfmNode.text) {
                return { ...usfmNode, text: newText } as SerializedUSFMTextNode;
            }
        }
    }
    return node;
}

/**
 * Composes all the above transforms.
 */
export function prettifySerializedNode(
    node: SerializedLexicalNode,
    context: PrettifyContext,
): SerializedLexicalNode | SerializedLexicalNode[] {
    let currentNode = node;

    // Apply single-node transforms first
    if (isSerializedUSFMTextNode(currentNode)) {
        currentNode = collapseWhitespaceInTextNode(currentNode);
        const normalized = normalizeSpacingAfterParaMarkers(
            currentNode,
            context,
        );
        if (!Array.isArray(normalized)) {
            currentNode = normalized;
        }
    }

    // Now apply transforms that can return arrays
    const result: SerializedLexicalNode[] = [currentNode];

    // Before Para Markers
    const beforePara = insertLinebreakBeforeParaMarkers(currentNode, context);
    if (Array.isArray(beforePara)) {
        result.unshift({
            type: "linebreak",
            version: 1,
        } as SerializedLexicalNode);
    }

    // After Para Markers
    const afterPara = insertLinebreakAfterParaMarkers(currentNode, context);
    if (Array.isArray(afterPara)) {
        result.push({ type: "linebreak", version: 1 } as SerializedLexicalNode);
    }

    // After Chapter Number Range
    const afterChapter = insertLinebreakAfterChapterNumberRange(
        currentNode,
        context,
    );
    if (Array.isArray(afterChapter)) {
        // Check if we already added a linebreak from afterPara (unlikely to be both, but safe)
        if (result[result.length - 1].type !== "linebreak") {
            result.push({
                type: "linebreak",
                version: 1,
            } as SerializedLexicalNode);
        }
    }

    return result.length === 1 ? result[0] : result;
}

/**
 * Iterates through nodes, maintains context (prev/next), applies prettifySerializedNode,
 * and recursively processes children for ElementNode and USFMNestedEditorNode.
 */
export function applyPrettifyToNodeTree(
    nodes: SerializedLexicalNode[],
): SerializedLexicalNode[] {
    // 1. Merge adjacent text nodes with same SID/marker/tokenType to allow whitespace collapse across nodes
    const mergedNodes: SerializedLexicalNode[] = [];
    for (const node of nodes) {
        const lastNode = mergedNodes[mergedNodes.length - 1];
        if (
            lastNode &&
            isSerializedUSFMTextNode(lastNode) &&
            isSerializedUSFMTextNode(node) &&
            lastNode.sid === node.sid &&
            lastNode.marker === node.marker &&
            lastNode.tokenType === node.tokenType &&
            lastNode.tokenType === UsfmTokenTypes.text
        ) {
            // Create a new node to avoid mutating the original
            const updatedLastNode = {
                ...(lastNode as SerializedUSFMTextNode),
                text: (lastNode as SerializedUSFMTextNode).text + node.text,
            };
            mergedNodes[mergedNodes.length - 1] = updatedLastNode;
        } else {
            mergedNodes.push(node);
        }
    }

    const intermediateResult: SerializedLexicalNode[] = [];

    for (let i = 0; i < mergedNodes.length; i++) {
        let node = mergedNodes[i];

        // Recursive step for children
        if (isSerializedElementNode(node)) {
            const elementNode = node as SerializedElementNode;
            if (elementNode.children) {
                node = {
                    ...elementNode,
                    children: applyPrettifyToNodeTree(elementNode.children),
                } as SerializedElementNode;
            }
        } else if (isSerializedUSFMNestedEditorNode(node)) {
            const nestedNode = node as USFMNestedEditorNodeJSON;
            if (nestedNode.editorState?.root?.children) {
                node = {
                    ...nestedNode,
                    editorState: {
                        ...nestedNode.editorState,
                        root: {
                            ...nestedNode.editorState.root,
                            children: applyPrettifyToNodeTree(
                                nestedNode.editorState.root.children,
                            ),
                        },
                    },
                } as USFMNestedEditorNodeJSON;
            }
        }

        const context: PrettifyContext = {
            previousSibling: intermediateResult[intermediateResult.length - 1],
            nextSibling: mergedNodes[i + 1],
        };

        const transformed = prettifySerializedNode(node, context);
        if (Array.isArray(transformed)) {
            intermediateResult.push(...transformed);
        } else {
            intermediateResult.push(transformed);
        }
    }

    // Post-process to remove duplicate linebreaks
    const finalResult: SerializedLexicalNode[] = [];
    for (const node of intermediateResult) {
        if (
            node.type === "linebreak" &&
            finalResult[finalResult.length - 1]?.type === "linebreak"
        ) {
            continue;
        }
        finalResult.push(node);
    }

    return finalResult;
}
