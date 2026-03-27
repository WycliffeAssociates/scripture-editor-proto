import type { SerializedLexicalNode } from "lexical";
import { isSerializedUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";

function isSerializedElementWithChildren(
    node: SerializedLexicalNode,
): node is SerializedLexicalNode & { children: SerializedLexicalNode[] } {
    return Array.isArray((node as { children?: unknown }).children);
}

/**
 * Serialized-tree traversal helpers used by editor analysis utilities.
 */
export function* walkChapters(
    files: ScriptureBookState[],
): Generator<{ file: ScriptureBookState; chapter: ScriptureChapterState }> {
    for (const file of files) {
        for (const chapter of file.chapters) {
            yield { file, chapter };
        }
    }
}

/**
 * Walk a serialized Lexical tree depth-first, including nested editor payloads.
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
