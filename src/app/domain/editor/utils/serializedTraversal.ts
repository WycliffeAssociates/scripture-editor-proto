import type { SerializedLexicalNode } from "lexical";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { isSerializedUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";

function isSerializedElementWithChildren(
    node: SerializedLexicalNode,
): node is SerializedLexicalNode & { children: SerializedLexicalNode[] } {
    return Array.isArray((node as { children?: unknown }).children);
}

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
        if (isSerializedUSFMNestedEditorNode(node)) {
            const children = node.editorState?.root?.children;
            if (children) {
                yield* walkNodes(children);
            }
        } else if (isSerializedElementWithChildren(node)) {
            yield* walkNodes(node.children);
        }
    }
}
