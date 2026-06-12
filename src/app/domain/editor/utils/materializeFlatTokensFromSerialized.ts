import type { SerializedLexicalNode } from "lexical";

import { USFM_PARAGRAPH_NODE_TYPE, UsfmTokenTypes } from "@/app/data/editor.ts";
import { isSerializedBookFrontmatterFormNode } from "@/app/domain/editor/nodes/BookFrontmatterFormNode.tsx";
import { isSerializedFormBlockNode } from "@/app/domain/editor/nodes/FormBlockNode.tsx";
import { isSerializedUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { isSerializedUSFMNumberedMarkerNode } from "@/app/domain/editor/nodes/USFMNumberedMarkerNode.ts";
import type { USFMParagraphNodeJSON } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
  createSerializedUSFMTextNode,
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
function isSerializedUSFMParagraphContainer(
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
): SerializedUSFMTextNode | null {
  const marker = paragraphNode.marker ?? "p";
  // Use original marker text if available, otherwise construct without trailing space
  // (old paragraph containers don't have markerText, so no-space avoids spurious diffs)
  const text = paragraphNode.markerText ?? `\\${marker}`;
  // Byte-less shell containers (the chapter shell around a numbered \c
  // node) own no bytes — their children carry the whole token stream.
  if (text === "") return null;

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
  /**
   * How to handle chapter-0 frontmatter decorator nodes.
   * - "flatten" (default): yield their stored token stream
   * - "preserve": keep the decorator node as an atomic entry
   */
  frontmatter?: "flatten" | "preserve";
};

/**
 * Materializes a flat token stream from serialized Lexical root children.
 *
 * The editor stores different tree shapes depending on mode. Search, lint, diff,
 * and some import/export paths still need one consistent flat reading-order stream.
 * This adapter is the bridge back to that representation.
 *
 * It handles both:
 * 1. flat token streams from source-oriented modes
 * 2. paragraph-container trees from regular mode
 *
 * Nested editor content is included in reading order unless callers explicitly ask
 * to preserve nested nodes as atomic entries.
 */
function* materializeFlatTokensFromSerialized(
  rootChildren: SerializedLexicalNode[],
  options: MaterializeOptions = { nested: "flatten" },
): Generator<SerializedLexicalNode> {
  const { nested = "flatten", frontmatter = "flatten" } = options;
  for (const node of rootChildren) {
    if (isSerializedUSFMParagraphContainer(node)) {
      // Emit synthetic paragraph marker token (byte-less shells yield
      // nothing of their own)
      const children = node.children ?? [];
      const markerTokenBase = createSyntheticParagraphMarkerToken(node);

      if (markerTokenBase) yield markerTokenBase;

      if (children.length === 0) continue;

      // Then recursively yield children
      yield* materializeFlatTokensFromSerialized(children, options);
    } else if (isSerializedUSFMNumberedMarkerNode(node)) {
      // Numbered-marker node: token emission derives from node shape —
      // open marker token · Number token · [endMarker token]. The
      // Number token only exists when there is number content: an
      // empty node emits its marker alone, exactly what the lexer
      // would produce for the same bytes (the I2 fixpoint).
      yield createSerializedUSFMTextNode({
        text: node.openBytes,
        id: node.openId,
        sid: node.sid ?? "",
        tokenType: UsfmTokenTypes.marker,
        marker: node.marker,
        inPara: node.inPara,
      });
      if ((node.text ?? "") !== "") {
        yield createSerializedUSFMTextNode({
          text: node.text,
          id: node.id,
          sid: node.sid ?? "",
          tokenType: UsfmTokenTypes.numberRange,
          inPara: node.inPara,
        });
      }
      if (node.closeBytes != null) {
        yield createSerializedUSFMTextNode({
          text: node.closeBytes,
          id: node.closeId ?? guidGenerator(),
          sid: node.sid ?? "",
          tokenType: UsfmTokenTypes.endMarker,
          marker: node.marker,
          inPara: node.inPara,
        });
      }
    } else if (isSerializedBookFrontmatterFormNode(node)) {
      if (frontmatter === "preserve") {
        yield node;
        continue;
      }

      yield* materializeFlatTokensFromSerialized(node.tokens ?? [], options);
    } else if (isSerializedFormBlockNode(node)) {
      yield* materializeFlatTokensFromSerialized(node.tokens ?? [], options);
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
        show: true,
        isMutable: true,
      });

      const nestedChildren = node.editorState?.root?.children;
      if (nestedChildren) {
        yield* materializeFlatTokensFromSerialized(nestedChildren, options);
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
 * Yields a sliding window over the materialized flat stream for transforms that
 * need local neighbor context without repeatedly rewriting index math.
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
