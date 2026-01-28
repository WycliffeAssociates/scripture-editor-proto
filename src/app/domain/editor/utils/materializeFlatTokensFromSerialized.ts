import type { SerializedLexicalNode } from "lexical";
import { USFM_PARAGRAPH_NODE_TYPE, UsfmTokenTypes } from "@/app/data/editor.ts";
import { isSerializedUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import type { USFMParagraphNodeJSON } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    createSerializedUSFMTextNode,
    type SerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";

/**
 * Detect whether a serialized node is a USFMParagraphNode container.
 * This is the new tree-structured paragraph container (not the legacy Lexical "paragraph" or "usfm-element-node").
 */
export function isSerializedUSFMParagraphContainer(
    node: SerializedLexicalNode,
): node is USFMParagraphNodeJSON {
    return node.type === USFM_PARAGRAPH_NODE_TYPE;
}

/**
 * Creates a synthetic paragraph marker token from a paragraph container node.
 * This allows downstream consumers to treat paragraph containers as if they were flat tokens.
 */
function createSyntheticParagraphMarkerToken(
    paragraphNode: USFMParagraphNodeJSON,
): SerializedUSFMTextNode {
    const marker = paragraphNode.marker ?? "p";
    return createSerializedUSFMTextNode({
        text: `\\${marker} `,
        id: paragraphNode.id ?? guidGenerator(),
        sid: paragraphNode.sid ?? "",
        tokenType: UsfmTokenTypes.marker,
        marker,
        inPara: marker,
        show: true,
        isMutable: true,
    });
}

/**
 * Materializes a flat token stream from serialized Lexical root children.
 *
 * This adapter handles both:
 * 1. **Flat token streams** (legacy/USFM mode): nodes are yielded as-is
 * 2. **Paragraph-tree structure** (Regular mode): USFMParagraphNode containers are
 *    expanded into a synthetic paragraph marker token followed by their children
 *
 * Nested editor content is included in reading order.
 *
 * @param rootChildren - The serialized root children from Lexical editor state
 * @yields SerializedLexicalNode in flat reading order
 */
export function* materializeFlatTokensFromSerialized(
    rootChildren: SerializedLexicalNode[],
): Generator<SerializedLexicalNode> {
    for (const node of rootChildren) {
        if (isSerializedUSFMParagraphContainer(node)) {
            // Emit synthetic paragraph marker token
            yield createSyntheticParagraphMarkerToken(node);
            // Then recursively yield children
            const children = node.children ?? [];
            yield* materializeFlatTokensFromSerialized(children);
        } else if (isSerializedUSFMNestedEditorNode(node)) {
            // Yield the nested editor node itself
            yield node;
            // Also yield its nested content in reading order
            const nestedChildren = node.editorState?.root?.children;
            if (nestedChildren) {
                yield* materializeFlatTokensFromSerialized(nestedChildren);
            }
        } else {
            // Flat token or other node type - yield as-is
            yield node;
        }
    }
}

/**
 * Collects all flat tokens from serialized root children into an array.
 * Convenience wrapper around the generator.
 */
export function materializeFlatTokensArray(
    rootChildren: SerializedLexicalNode[],
): SerializedLexicalNode[] {
    return [...materializeFlatTokensFromSerialized(rootChildren)];
}

/**
 * A sliding window iterator for linting operations.
 * Yields { prev, curr, next } tuples for each token in the flat stream.
 */
export type TokenWindow = {
    prev: SerializedLexicalNode | undefined;
    curr: SerializedLexicalNode;
    next: SerializedLexicalNode | undefined;
};

export function* walkFlatTokensSlidingWindow(
    rootChildren: SerializedLexicalNode[],
): Generator<TokenWindow> {
    const tokens = materializeFlatTokensArray(rootChildren);
    for (let i = 0; i < tokens.length; i++) {
        yield {
            prev: tokens[i - 1],
            curr: tokens[i],
            next: tokens[i + 1],
        };
    }
}
