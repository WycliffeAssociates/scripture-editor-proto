import type { SerializedLexicalNode } from "lexical";
import { USFM_PARAGRAPH_NODE_TYPE, UsfmTokenTypes } from "@/app/data/editor.ts";
import { isSerializedUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import type { USFMParagraphNodeJSON } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    createSerializedUSFMTextNode,
    isSerializedUSFMTextNode,
    type SerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";

function isSerializedElementWithChildren(
    node: SerializedLexicalNode,
): node is SerializedLexicalNode & { children: SerializedLexicalNode[] } {
    return Array.isArray((node as { children?: unknown }).children);
}

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
 * Uses the original marker text if available to preserve whitespace for accurate diffing.
 * Falls back to marker without trailing space for backwards compatibility with old data.
 */
function createSyntheticParagraphMarkerToken(
    paragraphNode: USFMParagraphNodeJSON,
): SerializedUSFMTextNode {
    const marker = paragraphNode.marker ?? "p";
    // Use original marker text if available, otherwise construct without trailing space
    // (old paragraph containers don't have markerText, so no-space avoids spurious diffs)
    const text = paragraphNode.markerText ?? `\\${marker} `;

    const token = createSerializedUSFMTextNode({
        text,
        id: paragraphNode.id ?? guidGenerator(),
        sid: paragraphNode.sid ?? "",
        tokenType: UsfmTokenTypes.marker,
        marker,
        inPara: marker,
        show: true,
        isMutable: true,
    }) as SerializedUSFMTextNode & { isSyntheticParaMarker: true };

    // Used by lint/autofix logic to avoid anchoring fixes to container-derived tokens.
    token.isSyntheticParaMarker = true;
    return token;
}

export type MaterializeOptions = {
    /**
     * How to handle nested editor nodes (e.g. footnotes/crossrefs).
     * - "flatten" (default): replace nested node with marker token + nested token stream
     * - "preserve": keep nested editor node as an atomic token (do not descend)
     */
    nested?: "flatten" | "preserve";
};

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
    options: MaterializeOptions = { nested: "flatten" },
): Generator<SerializedLexicalNode> {
    const { nested = "flatten" } = options;
    for (const node of rootChildren) {
        if (isSerializedUSFMParagraphContainer(node)) {
            // Emit synthetic paragraph marker token
            const children = node.children ?? [];
            const markerTokenBase = createSyntheticParagraphMarkerToken(node);

            // If the marker token does not end with whitespace, but the paragraph contains
            // plain text content immediately after the marker on the same line, normalize
            // to a USFM-friendly `\\marker ` form for downstream serialization/diff.
            const firstChild = children[0];
            const shouldAddSpaceAfterMarker =
                !/\s$/u.test(markerTokenBase.text ?? "") &&
                firstChild &&
                isSerializedUSFMTextNode(firstChild) &&
                firstChild.tokenType === UsfmTokenTypes.text &&
                firstChild.text.length > 0 &&
                !/^\s/u.test(firstChild.text);

            const markerToken = shouldAddSpaceAfterMarker
                ? ({
                      ...markerTokenBase,
                      text: `${markerTokenBase.text} `,
                  } as SerializedUSFMTextNode)
                : markerTokenBase;

            yield markerToken;
            // Then recursively yield children
            yield* materializeFlatTokensFromSerialized(children, options);
        } else if (isSerializedUSFMNestedEditorNode(node)) {
            if (nested === "preserve") {
                yield node;
                continue;
            }

            // Flatten: opening marker token + nested content tokens.
            yield createSerializedUSFMTextNode({
                text: node.text ?? `\\${node.marker} `,
                id: node.id,
                sid: node.sid ?? "",
                tokenType: UsfmTokenTypes.marker,
                marker: node.marker,
                inPara: node.inPara,
                inChars: node.inChars,
                attributes: node.attributes,
                show: true,
                isMutable: true,
            });

            const nestedChildren = node.editorState?.root?.children;
            if (nestedChildren) {
                yield* materializeFlatTokensFromSerialized(
                    nestedChildren,
                    options,
                );
            }
        } else if (isSerializedElementWithChildren(node)) {
            // Generic element wrappers (e.g. Lexical "paragraph") are not meaningful
            // tokens for downstream consumers; recurse into their children.
            yield* materializeFlatTokensFromSerialized(node.children, options);
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
    options: MaterializeOptions = { nested: "flatten" },
): SerializedLexicalNode[] {
    return [...materializeFlatTokensFromSerialized(rootChildren, options)];
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
