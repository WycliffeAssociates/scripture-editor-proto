import type {
    SerializedEditorState,
    SerializedElementNode,
    SerializedLexicalNode,
} from "lexical";
import { USFM_PARAGRAPH_NODE_TYPE, UsfmTokenTypes } from "@/app/data/editor.ts";
import { isSerializedUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { isSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { materializeFlatTokensArray } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";
import {
    groupFlatNodesIntoParagraphContainers,
    unwrapFlatTokensFromRootChildren,
    wrapFlatTokensInLexicalParagraph,
} from "@/app/domain/editor/utils/modeTransforms.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";
import { TokenMap } from "@/core/domain/usfm/lex.ts";
import type { PrettifyToken } from "@/core/domain/usfm/prettify/prettifyTokenStream.ts";

function detectDirection(nodes: SerializedLexicalNode[]): "ltr" | "rtl" {
    for (const n of nodes) {
        const dir = (n as { direction?: unknown }).direction;
        if (dir === "ltr" || dir === "rtl") return dir;
    }
    return "ltr";
}

export type RootShape = "regularTree" | "wrappedFlat" | "unknown";

function detectRootShape(nodes: SerializedLexicalNode[]): RootShape {
    if (nodes.some((n) => n.type === USFM_PARAGRAPH_NODE_TYPE)) {
        return "regularTree";
    }
    const unwrapped = unwrapFlatTokensFromRootChildren(nodes);
    if (unwrapped && nodes.length === 1 && nodes[0]?.type === "paragraph") {
        return "wrappedFlat";
    }
    return "unknown";
}

export type LexicalPrettifyTokenStream = {
    tokens: PrettifyToken[];
    direction: "ltr" | "rtl";
    shape: RootShape;
    wrapper?: SerializedElementNode;
};

export function lexicalRootChildrenToPrettifyTokenStream(
    nodes: SerializedLexicalNode[],
): LexicalPrettifyTokenStream {
    const shape = detectRootShape(nodes);
    const direction = detectDirection(nodes);

    const unwrapped =
        shape === "wrappedFlat"
            ? unwrapFlatTokensFromRootChildren(nodes)
            : null;
    const base = unwrapped ?? nodes;

    const flatSerialized = materializeFlatTokensArray(base, {
        nested: "preserve",
    });
    const tokens = flatSerialized.map(lexicalNodeToPrettifyToken);

    const wrapper =
        shape === "wrappedFlat" && nodes.length === 1
            ? (nodes[0] as SerializedElementNode)
            : undefined;

    return { tokens, direction, shape, wrapper };
}

export function prettifyTokenStreamToLexicalRootChildren(
    tokens: PrettifyToken[],
    meta: Pick<LexicalPrettifyTokenStream, "direction" | "shape" | "wrapper">,
): SerializedLexicalNode[] {
    const direction = meta.direction;
    const shape = meta.shape;

    const serializedFlat = tokens
        .map(prettifyTokenToLexicalNode)
        .filter(Boolean) as SerializedLexicalNode[];

    if (shape === "regularTree") {
        return groupFlatNodesIntoParagraphContainers(serializedFlat, direction);
    }

    if (shape === "wrappedFlat") {
        const wrapper =
            meta.wrapper ?? wrapFlatTokensInLexicalParagraph([], direction);
        return [
            {
                ...(wrapper as SerializedElementNode),
                children: serializedFlat,
            } as SerializedLexicalNode,
        ];
    }

    return [wrapFlatTokensInLexicalParagraph(serializedFlat, direction)];
}

function lexicalNodeToPrettifyToken(
    node: SerializedLexicalNode,
): PrettifyToken {
    if (node.type === "linebreak") {
        return {
            tokenType: TokenMap.verticalWhitespace,
            text: "\n",
        };
    }

    if (isSerializedUSFMNestedEditorNode(node)) {
        const nestedDirection =
            ((node.editorState?.root?.direction ?? "ltr") as "ltr" | "rtl") ||
            "ltr";

        const nestedChildren =
            (node.editorState?.root?.children as SerializedLexicalNode[]) ?? [];
        const nestedFlat = materializeFlatTokensArray(nestedChildren, {
            nested: "preserve",
        });
        const nestedTokens = nestedFlat.map(lexicalNodeToPrettifyToken);

        // Represent nested editor as an atomic token in this stream, but still carry its
        // content so core prettify can recurse into it.
        return {
            tokenType: "__nested__",
            text: node.text ?? `\\${node.marker} `,
            marker: node.marker,
            id: node.id,
            sid: node.sid,
            inPara: node.inPara,
            inChars: node.inChars,
            attributes: node.attributes,
            content: nestedTokens,
            __serialized: node,
            __nestedDirection: nestedDirection,
        };
    }

    if (isSerializedUSFMTextNode(node)) {
        return {
            tokenType: node.tokenType,
            text: node.text,
            marker: node.marker,
            id: node.id,
            sid: node.sid,
            inPara: node.inPara,
            inChars: node.inChars,
            lintErrors: node.lintErrors,
            __serialized: node,
        };
    }

    // Preserve unknown nodes as atomic passthrough tokens.
    return {
        tokenType: "__unknown__",
        text: "",
        __serialized: node,
    };
}

function prettifyTokenToLexicalNode(
    token: PrettifyToken,
): SerializedLexicalNode {
    if (token.tokenType === TokenMap.verticalWhitespace) {
        return { type: "linebreak", version: 1 } as SerializedLexicalNode;
    }

    if (token.tokenType === "__nested__") {
        const original = (
            token as PrettifyToken & {
                __serialized?: SerializedLexicalNode;
            }
        ).__serialized;
        if (!original || !isSerializedUSFMNestedEditorNode(original)) {
            // Should not happen; fallback to a text node if we lose the nested wrapper.
            return {
                type: "usfm-text-node",
                lexicalType: "usfm-text-node",
                tokenType: UsfmTokenTypes.text,
                text: token.text,
                id: token.id ?? guidGenerator(),
                sid: token.sid ?? "",
                version: 1,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
            } as unknown as SerializedLexicalNode;
        }

        const nestedDirection =
            ((original.editorState?.root?.direction ?? "ltr") as
                | "ltr"
                | "rtl") || "ltr";
        const nestedContentTokens = token.content ?? [];
        const nestedSerializedChildren = nestedContentTokens
            .map(prettifyTokenToLexicalNode)
            .filter(Boolean);

        const existingRootChildren =
            (original.editorState?.root?.children as SerializedLexicalNode[]) ??
            [];
        const existingWrapper =
            existingRootChildren.length === 1 &&
            existingRootChildren[0]?.type === "paragraph"
                ? (existingRootChildren[0] as SerializedElementNode)
                : wrapFlatTokensInLexicalParagraph([], nestedDirection);

        const nextWrapper: SerializedElementNode = {
            ...(existingWrapper as SerializedElementNode),
            children: nestedSerializedChildren,
        };

        const nextEditorState: SerializedEditorState<SerializedLexicalNode> = {
            ...(original.editorState as SerializedEditorState<SerializedLexicalNode>),
            root: {
                ...(original.editorState?.root ?? {
                    type: "root",
                    version: 1,
                    direction: nestedDirection,
                    format: "start",
                    indent: 0,
                }),
                direction: nestedDirection,
                children: [nextWrapper],
            },
        };

        return {
            ...(original as SerializedLexicalNode),
            editorState: nextEditorState,
        } as SerializedLexicalNode;
    }

    if (token.tokenType === "__unknown__") {
        const original = (
            token as PrettifyToken & {
                __serialized?: SerializedLexicalNode;
            }
        ).__serialized;
        if (original) return original;
    }

    const original = (
        token as PrettifyToken & {
            __serialized?: SerializedLexicalNode;
        }
    ).__serialized;

    if (original && isSerializedUSFMTextNode(original)) {
        return {
            ...original,
            tokenType: token.tokenType,
            text: token.text,
            marker: token.marker,
            sid: token.sid,
            id: token.id ?? (original as { id?: string }).id,
            inPara: token.inPara,
            inChars: token.inChars,
        } as SerializedLexicalNode;
    }

    // Fallback: emit a new USFM text node shape.
    // Note: this is only used for newly created tokens (e.g. splits/inserts).
    return {
        type: "usfm-text-node",
        lexicalType: "usfm-text-node",
        tokenType: token.tokenType,
        text: token.text,
        marker: token.marker,
        sid: token.sid ?? "",
        inPara: token.inPara,
        inChars: token.inChars,
        lintErrors: [],
        id:
            token.id ??
            (typeof crypto !== "undefined"
                ? crypto.randomUUID()
                : Math.random().toString(36).slice(2)),
        version: 1,
        detail: 0,
        format: 0,
        mode: "normal",
        style: "",
    } as unknown as SerializedLexicalNode;
}

// Note: prettification (token-stream transform) lives in `src/core`.
// This module is an adapter between Lexical serialized nodes and core token streams.
