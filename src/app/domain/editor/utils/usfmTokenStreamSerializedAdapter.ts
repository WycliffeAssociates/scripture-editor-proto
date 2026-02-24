import type {
    SerializedEditorState,
    SerializedElementNode,
    SerializedLexicalNode,
} from "lexical";
import {
    type ContentEditorModeSetting,
    USFM_PARAGRAPH_NODE_TYPE,
    UsfmTokenTypes,
} from "@/app/data/editor.ts";
import { isSerializedUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { isSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { serializeToUsfmString } from "@/app/domain/editor/serialization/lexicalToUsfm.ts";
import { materializeFlatTokensArray } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";
import {
    groupFlatNodesIntoParagraphContainers,
    transformToMode,
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

export type LexicalUsfmTokenStream = {
    tokens: PrettifyToken[];
    direction: "ltr" | "rtl";
    shape: RootShape;
    wrapper?: SerializedElementNode;
};

export type LexicalDiffToken = {
    sid: string;
    text: string;
    id?: string;
    node: SerializedLexicalNode;
};

export type LexicalRenderToken = {
    node: SerializedLexicalNode;
    sid: string;
    tokenType?: string;
    marker?: string;
};

export function lexicalRootChildrenToUsfmTokenStream(
    nodes: SerializedLexicalNode[],
): LexicalUsfmTokenStream {
    const shape = detectRootShape(nodes);
    const direction = detectDirection(nodes);
    const flatSerialized = materializeFlatTokensArray(nodes, {
        nested: "preserve",
    });
    const tokens = flatSerialized.map(lexicalNodeToPrettifyToken);

    const wrapper =
        shape === "wrappedFlat" && nodes.length === 1
            ? (nodes[0] as SerializedElementNode)
            : undefined;

    return { tokens, direction, shape, wrapper };
}

export function usfmTokenStreamToLexicalRootChildren(
    tokens: PrettifyToken[],
    meta: Pick<LexicalUsfmTokenStream, "direction" | "shape" | "wrapper">,
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

export function inferContentEditorModeFromRootChildren(
    rootChildren: SerializedLexicalNode[],
): "regular" | "usfm" {
    return rootChildren.some((child) => child.type === USFM_PARAGRAPH_NODE_TYPE)
        ? "regular"
        : "usfm";
}

export function lexicalEditorStateToDiffTokens(
    state: SerializedEditorState,
): LexicalDiffToken[] {
    const rootChildren = structuredClone(
        state.root.children as SerializedLexicalNode[],
    );
    const flatNodes = materializeFlatTokensArray(rootChildren, {
        nested: "preserve",
    });

    let lastSid = "";
    const tokens: LexicalDiffToken[] = [];

    for (const node of flatNodes) {
        let sid: string | undefined;
        let id: string | undefined;
        let text = "";

        if (node.type === "linebreak") {
            sid = lastSid;
            text = "\n";
        } else if (isSerializedUSFMTextNode(node)) {
            sid = node.sid ?? lastSid;
            id = node.id;
            text = node.text ?? "";
        } else if (isSerializedUSFMNestedEditorNode(node)) {
            sid = node.sid ?? lastSid;
            id = node.id;
            const opening = node.text ?? `\\${node.marker} `;
            const nested = serializeToUsfmString(
                node.editorState?.root?.children ?? [],
            );
            text = `${opening}${nested}`;
        } else {
            sid = lastSid;
            text = "";
        }

        lastSid = sid ?? lastSid;
        tokens.push({ sid: sid ?? "", text, id, node });
    }

    return tokens;
}

export function diffTokensToRenderTokens(
    tokens: LexicalDiffToken[],
): LexicalRenderToken[] {
    return tokens.map((token) => {
        const clonedNode = structuredClone(token.node);
        if (isSerializedUSFMTextNode(clonedNode)) {
            return {
                node: clonedNode,
                sid: token.sid,
                tokenType: clonedNode.tokenType,
                marker: clonedNode.marker,
            };
        }

        return {
            node: clonedNode,
            sid: token.sid,
        };
    });
}

export function diffTokensToEditorState(args: {
    tokens: LexicalDiffToken[];
    direction: "ltr" | "rtl";
    targetMode: ContentEditorModeSetting;
}): SerializedEditorState {
    const base: SerializedEditorState = {
        root: {
            children: [
                wrapFlatTokensInLexicalParagraph(
                    args.tokens.map((token) => token.node),
                    args.direction,
                ),
            ],
            type: "root",
            version: 1,
            direction: args.direction,
            format: "start",
            indent: 0,
        },
    };

    return transformToMode(base, args.targetMode);
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
