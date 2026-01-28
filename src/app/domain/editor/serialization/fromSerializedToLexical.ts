import type {
    SerializedEditorState,
    SerializedLexicalNode,
    SerializedLineBreakNode,
} from "lexical";
import {
    USFM_PARAGRAPH_NODE_TYPE,
    USFM_TEXT_NODE_TYPE,
    type USFMNodeJSON,
    UsfmTokenTypes,
} from "@/app/data/editor.ts";
import {
    getSerializedNestedEditorNode,
    nestedEditorMarkers,
} from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { createSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { dedupeErrorMessagesList } from "@/core/data/usfm/lint.ts";
import type { ParsedToken } from "@/core/data/usfm/parse.ts";
import { isValidParaMarker } from "@/core/data/usfm/tokens.ts";
import { TokenMap } from "@/core/domain/usfm/lex.ts";

export function parsedUsfmTokensToJsonLexicalNode(
    tokens: ParsedToken[],
    languageDirection: "ltr" | "rtl",
): SerializedEditorState<SerializedLexicalNode> {
    const flatNodes = tokens
        .map((t) => serializeToken(t, languageDirection))
        .filter(Boolean);

    const paragraphNodes = groupFlatNodesIntoParagraphContainers(
        flatNodes,
        languageDirection,
    );
    return {
        root: {
            children: paragraphNodes,
            type: "root",
            version: 1,
            direction: languageDirection,
            format: "start",
            indent: 0,
        },
    };
}

function groupFlatNodesIntoParagraphContainers(
    flatNodes: USFMNodeJSON[],
    languageDirection: "ltr" | "rtl",
): USFMNodeJSON[] {
    type ParagraphContainer = {
        type: typeof USFM_PARAGRAPH_NODE_TYPE;
        version: 1;
        direction: "ltr" | "rtl";
        format: "start";
        indent: 0;
        tokenType: string;
        id: string;
        marker: string;
        inPara: string;
        children: USFMNodeJSON[];
    };

    const paragraphs: ParagraphContainer[] = [];
    let current: ParagraphContainer | null = null;
    let paraIndex = 0;

    const startParagraph = (marker: string, id: string): ParagraphContainer => {
        const next: ParagraphContainer = {
            type: USFM_PARAGRAPH_NODE_TYPE,
            version: 1,
            direction: languageDirection,
            format: "start",
            indent: 0,
            tokenType: UsfmTokenTypes.marker,
            id,
            marker,
            inPara: marker,
            children: [],
        };
        paragraphs.push(next);
        current = next;
        return next;
    };

    for (const node of flatNodes) {
        const paraMarker = getParagraphMarkerFromNode(node);
        if (paraMarker) {
            startParagraph(paraMarker.marker, paraMarker.id);
            continue;
        }

        if (!current) {
            current = startParagraph("p", `default-para-${paraIndex++}`);
        }

        current.children.push(node);
    }

    // Ensure Regular mode always has at least one paragraph container.
    if (paragraphs.length === 0) {
        startParagraph("p", "default-para-0");
    }

    return paragraphs;
}

function getParagraphMarkerFromNode(
    node: USFMNodeJSON,
): { marker: string; id: string } | null {
    // USFMTextNode serializes as Lexical's built-in `type: "text"`.
    if (node.type !== "text") return null;
    if ((node as { lexicalType?: string }).lexicalType !== USFM_TEXT_NODE_TYPE)
        return null;

    const maybe = node as {
        tokenType?: string;
        marker?: string;
        id?: string;
    };
    if (maybe.tokenType !== UsfmTokenTypes.marker) return null;
    if (!maybe.marker) return null;
    if (!isValidParaMarker(maybe.marker)) return null;

    return {
        marker: maybe.marker,
        id: maybe.id ?? `para-marker-${maybe.marker}`,
    };
}

function serializeToken(
    token: ParsedToken,
    languageDirection: "ltr" | "rtl",
): USFMNodeJSON {
    //
    if (
        nestedEditorMarkers.has(token.marker ?? "") &&
        token.tokenType !== UsfmTokenTypes.endMarker
    ) {
        return getSerializedNestedEditorNode({
            token,
            childrenCb: () =>
                token.content?.map((c) =>
                    serializeToken(c, languageDirection),
                ) ?? [],
            languageDirection,
        });
    }

    // If token has children → element node
    // if (Array.isArray(token.content) && token.content.length > 0) {
    //   const openSerializedMarker = createSerializedUSFMTextNode({
    //     text: token.text,
    //     id: token.id,
    //     sid: token.sid || "",
    //     tokenType: token.tokenType,
    //     marker: t.marker,
    //     inPara: t.inPara,
    //   });
    //   const children =
    //     t.content?.map((c) => serializeToken(c, languageDirection)) ?? [];
    //   const close = createSerializedUSFMTextNode({
    //     text: `\\${t.marker}*`,
    //     id: t.id,
    //     sid: t.sid || "",
    //     tokenType: "endMarker",
    //     marker: t.marker,
    //     inPara: t.inPara,
    //   });
    //   return createSerializedUSFMParagraphNode(t, languageDirection, [
    //     openSerializedMarker,
    //     ...children,
    //     close,
    //   ]);
    // }

    // if (token.marker === "b") {
    //   const lb: SerializedLineBreakNode = {
    //     type: "linebreak",
    //     version: 1,
    //   };
    //   return lb;
    // }
    if (token.tokenType === TokenMap.verticalWhitespace) {
        const lb: SerializedLineBreakNode = {
            type: "linebreak",
            version: 1,
        };
        return lb;
    }
    // else it is a text node

    return createSerializedUSFMTextNode({
        text: token.text,
        id: token.id,
        sid: token.sid || "",
        tokenType: token.tokenType,
        marker: token.marker,
        inPara: token.inPara,
        inChars: token.inChars,
        lintErrors: token.lintErrors?.length
            ? dedupeErrorMessagesList(token.lintErrors)
            : [],
        // maybe set isMutable and show from parse if remembering settings? Right now we just adjust once we've rendered the stuff. NOt sure
    });
}
