import type {
    SerializedEditorState,
    SerializedElementNode,
    SerializedLexicalNode,
} from "lexical";
import { USFM_PARAGRAPH_NODE_TYPE, UsfmTokenTypes } from "@/app/data/editor.ts";
import { isSerializedUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import {
    createSerializedUSFMTextNode,
    isSerializedUSFMTextNode,
    type SerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { materializeFlatTokensArray } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";
import {
    groupFlatNodesIntoParagraphContainers,
    transformToMode,
    unwrapFlatTokensFromRootChildren,
    wrapFlatTokensInLexicalParagraph,
} from "@/app/domain/editor/utils/modeTransforms.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";
import type { TokenEnvelope } from "@/core/domain/usfm/tokenEnvelope.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

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
    tokens: TokenEnvelope[];
    direction: "ltr" | "rtl";
    shape: RootShape;
    wrapper?: SerializedElementNode;
};

export type LexicalRenderToken = {
    node: SerializedLexicalNode;
    sid: string;
    tokenType?: string;
    marker?: string;
};

function lexicalTokenTypeToOnionKind(
    tokenType: string | undefined,
): Token["kind"] {
    switch (tokenType) {
        case UsfmTokenTypes.marker:
            return "marker";
        case UsfmTokenTypes.endMarker:
            return "endMarker";
        case UsfmTokenTypes.numberRange:
            return "number";
        case UsfmTokenTypes.verticalWhitespace:
            return "newline";
        default:
            return "text";
    }
}

function flatTokenKindToLexicalTokenType(kind: string): string {
    switch (kind) {
        case "marker":
        case "milestone":
            return UsfmTokenTypes.marker;
        case "endMarker":
        case "milestoneEnd":
            return UsfmTokenTypes.endMarker;
        case "newline":
            return UsfmTokenTypes.verticalWhitespace;
        case "number":
            return UsfmTokenTypes.numberRange;
        case "bookCode":
        case "optBreak":
        case "attributeList":
            return UsfmTokenTypes.text;
        default:
            return kind;
    }
}

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
    tokens: TokenEnvelope[],
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

export type LexicalToTokensOptions = {
    structuralParagraphBreaks?: boolean;
};

function shouldInsertStructuralLinebreakAfterSyntheticParaMarker(
    current: SerializedLexicalNode,
    next: SerializedLexicalNode | undefined,
): boolean {
    if (!isSerializedUSFMTextNode(current)) return false;
    if (
        !(
            current as SerializedUSFMTextNode & {
                isSyntheticParaMarker?: boolean;
            }
        ).isSyntheticParaMarker
    ) {
        return false;
    }
    if (!next || next.type === "linebreak") return false;

    if (
        isSerializedUSFMTextNode(next) &&
        (next.tokenType === UsfmTokenTypes.text ||
            next.tokenType === UsfmTokenTypes.numberRange) &&
        /^\s/u.test(next.text ?? "")
    ) {
        return false;
    }

    return !/[ \t]$/u.test(current.text ?? "");
}

function materializeNodesForTokenization(
    state: SerializedEditorState,
    options: LexicalToTokensOptions = {},
): SerializedLexicalNode[] {
    const rootChildren = structuredClone(
        state.root.children as SerializedLexicalNode[],
    );
    const flatNodes = materializeFlatTokensArray(rootChildren, {
        nested: "flatten",
    });

    if (!options.structuralParagraphBreaks) {
        return flatNodes;
    }

    const withStructuralLinebreaks: SerializedLexicalNode[] = [];

    for (let i = 0; i < flatNodes.length; i++) {
        const current = flatNodes[i];
        const next = flatNodes[i + 1];
        withStructuralLinebreaks.push(current);

        if (
            shouldInsertStructuralLinebreakAfterSyntheticParaMarker(
                current,
                next,
            )
        ) {
            withStructuralLinebreaks.push({
                type: "linebreak",
                version: 1,
            } as SerializedLexicalNode);
        }
    }

    return withStructuralLinebreaks;
}

export function lexicalToTokens(
    state: SerializedEditorState,
    options: LexicalToTokensOptions = {},
): Token[] {
    const nodes = materializeNodesForTokenization(state, options);

    let lastSid = "";
    let linebreakId = 0;
    let cursor = 0;
    const tokens: Token[] = [];

    for (const node of nodes) {
        if (node.type === "linebreak") {
            tokens.push({
                id: `linebreak-${linebreakId++}`,
                kind: "newline",
                span: {
                    start: cursor,
                    end: cursor + 1,
                },
                sid: lastSid,
                text: "\n",
            });
            cursor += 1;
            continue;
        }

        if (!isSerializedUSFMTextNode(node)) continue;

        const sid = node.sid ?? lastSid;
        const text = node.text ?? "";
        tokens.push({
            id: node.id,
            kind: lexicalTokenTypeToOnionKind(node.tokenType),
            span: {
                start: cursor,
                end: cursor + text.length,
            },
            sid,
            marker: node.marker ?? undefined,
            text,
        });
        cursor += text.length;
        if (sid) lastSid = sid;
    }

    return tokens;
}

export function tokensToRenderTokens(tokens: Token[]): LexicalRenderToken[] {
    return tokens.map((token) => {
        const node =
            token.kind === "newline"
                ? ({ type: "linebreak", version: 1 } as SerializedLexicalNode)
                : (createSerializedUSFMTextNode({
                      text: token.text,
                      id: token.id ?? guidGenerator(),
                      sid: token.sid ?? "",
                      tokenType: flatTokenKindToLexicalTokenType(token.kind),
                      marker: token.marker ?? undefined,
                  }) as SerializedLexicalNode);

        return {
            node,
            sid: token.sid ?? "",
            tokenType:
                token.kind === "newline"
                    ? UsfmTokenTypes.verticalWhitespace
                    : flatTokenKindToLexicalTokenType(token.kind),
            marker: token.marker ?? undefined,
        };
    });
}

export type TokensToLexicalMode = "regular" | "flat";

export function tokensToLexical(args: {
    tokens: Token[];
    direction: "ltr" | "rtl";
    mode: TokensToLexicalMode;
}): SerializedEditorState {
    const base: SerializedEditorState = {
        root: {
            children: [
                wrapFlatTokensInLexicalParagraph(
                    args.tokens.map((token) =>
                        token.kind === "newline"
                            ? ({
                                  type: "linebreak",
                                  version: 1,
                              } as SerializedLexicalNode)
                            : (createSerializedUSFMTextNode({
                                  text: token.text,
                                  id: token.id ?? guidGenerator(),
                                  sid: token.sid ?? "",
                                  tokenType: flatTokenKindToLexicalTokenType(
                                      token.kind,
                                  ),
                                  marker: token.marker ?? undefined,
                              }) as SerializedLexicalNode),
                    ),
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

    if (args.mode === "regular") {
        return transformToMode(base, "regular");
    }

    return base;
}

function lexicalNodeToPrettifyToken(
    node: SerializedLexicalNode,
): TokenEnvelope {
    if (node.type === "linebreak") {
        return {
            tokenType: UsfmTokenTypes.verticalWhitespace,
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
    token: TokenEnvelope,
): SerializedLexicalNode {
    if (token.tokenType === UsfmTokenTypes.verticalWhitespace) {
        return { type: "linebreak", version: 1 } as SerializedLexicalNode;
    }

    if (token.tokenType === "__nested__") {
        const original = (
            token as TokenEnvelope & {
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
            token as TokenEnvelope & {
                __serialized?: SerializedLexicalNode;
            }
        ).__serialized;
        if (original) return original;
    }

    const original = (
        token as TokenEnvelope & {
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
