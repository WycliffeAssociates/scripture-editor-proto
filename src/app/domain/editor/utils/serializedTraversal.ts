import type { SerializedLexicalNode } from "lexical";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { isSerializedElementNode } from "@/app/domain/editor/nodes/USFMElementNode.ts";
import { isSerializedUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";

/**
 * Generator to walk through all chapters in a set of files.
 */
export function* walkChapters(
    files: ParsedFile[],
): Generator<{ file: ParsedFile; chapter: ParsedChapter }> {
    for (const file of files) {
        for (const chapter of file.chapters) {
            yield { file, chapter };
        }
    }
}

/**
 * Generator to walk through all nodes in a serialized lexical tree (DFS).
 * Yields nodes one by one, including children of elements and nested editors.
 */
export function* walkNodes(
    nodes: SerializedLexicalNode[],
): Generator<SerializedLexicalNode> {
    for (const node of nodes) {
        yield node;
        if (isSerializedElementNode(node)) {
            yield* walkNodes(node.children || []);
        } else if (isSerializedUSFMNestedEditorNode(node)) {
            const children = node.editorState?.root?.children;
            if (children) {
                yield* walkNodes(children);
            }
        }
    }
}

export type NodeContext = {
    node: SerializedLexicalNode;
    parentArray: SerializedLexicalNode[];
    index: number;
};

/**
 * Generator to walk through all nodes in a serialized lexical tree with context.
 * Useful for mutations like splice.
 */
function* walkNodesWithContext(
    nodes: SerializedLexicalNode[],
): Generator<NodeContext> {
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        yield { node, parentArray: nodes, index: i };
        if (isSerializedElementNode(node)) {
            yield* walkNodesWithContext(node.children || []);
        } else if (isSerializedUSFMNestedEditorNode(node)) {
            const children = node.editorState?.root?.children;
            if (children) {
                yield* walkNodesWithContext(children);
            }
        }
    }
}

/**
 * Utility to find a node by a predicate in a serialized lexical tree.
 */
function findNode(
    nodes: SerializedLexicalNode[],
    predicate: (node: SerializedLexicalNode) => boolean,
): SerializedLexicalNode | undefined {
    for (const node of walkNodes(nodes)) {
        if (predicate(node)) {
            return node;
        }
    }
    return undefined;
}

/**
 * Utility to find a node and its context by a predicate.
 */
export function findNodeWithContext(
    nodes: SerializedLexicalNode[],
    predicate: (node: SerializedLexicalNode) => boolean,
): NodeContext | undefined {
    for (const ctx of walkNodesWithContext(nodes)) {
        if (predicate(ctx.node)) {
            return ctx;
        }
    }
    return undefined;
}
