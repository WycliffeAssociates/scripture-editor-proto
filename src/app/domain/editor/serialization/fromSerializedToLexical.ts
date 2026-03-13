import type { SerializedLineBreakNode } from "lexical";
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
import type { ParsedToken } from "@/core/data/usfm/parse.ts";
import { TokenMap } from "@/core/domain/usfm/lex.ts";
import {
    isDocumentMarker,
    isValidParaMarker,
} from "@/core/domain/usfm/onionMarkers.ts";

type NestedEditorSerialization = "decorator" | "flat";

function serializeTokens(
    tokens: ParsedToken[],
    languageDirection: "ltr" | "rtl",
    nestedEditors: NestedEditorSerialization,
): USFMNodeJSON[] {
    const out: USFMNodeJSON[] = [];
    for (const token of tokens) {
        out.push(
            ...serializeTokenToNodes(token, languageDirection, nestedEditors),
        );
    }
    return out;
}

function serializeTokenToNodes(
    token: ParsedToken,
    languageDirection: "ltr" | "rtl",
    nestedEditors: NestedEditorSerialization,
): USFMNodeJSON[] {
    const marker = token.marker ?? "";
    const isNestedEditorMarker = nestedEditorMarkers.has(marker);
    const isClosingToken = token.tokenType === UsfmTokenTypes.endMarker;

    if (isNestedEditorMarker && !isClosingToken) {
        if (nestedEditors === "decorator") {
            return [
                getSerializedNestedEditorNode({
                    token,
                    childrenCb: () =>
                        serializeTokens(
                            token.content ?? [],
                            languageDirection,
                            nestedEditors,
                        ),
                    languageDirection,
                }),
            ];
        }

        // Flat: expand nested token stream inline in reading order.
        return [
            createSerializedUSFMTextNode({
                text: token.text,
                id: token.id,
                sid: token.sid || "",
                tokenType: token.tokenType,
                marker: token.marker,
                inPara: token.inPara,
                inChars: token.inChars,
                attributes: token.attributes,
                lintErrors: [],
            }),
            ...serializeTokens(
                token.content ?? [],
                languageDirection,
                nestedEditors,
            ),
        ];
    }

    return [serializeLeafToken(token, languageDirection)];
}

function serializeLeafToken(
    token: ParsedToken,
    languageDirection: "ltr" | "rtl",
): USFMNodeJSON {
    return serializeToken(token, languageDirection);
}

const isSectionMarker = (marker: string) =>
    marker === "s" || /^s\d+$/u.test(marker);
const isContainerStartMarker = (marker: string) =>
    isValidParaMarker(marker) ||
    isDocumentMarker(marker) ||
    marker === "c" ||
    isSectionMarker(marker);

export function groupFlatNodesIntoParagraphContainers(
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
        sid: string;
        marker: string;
        inPara: string;
        markerText: string; // Original text of the marker token (e.g., "\\p " or "\\p\n")
        children: USFMNodeJSON[];
    };

    const paragraphs: ParagraphContainer[] = [];
    let current: ParagraphContainer | null = null;
    let paraIndex = 0;
    const dropLeadingEmptyDefaultParagraphIfNeeded = () => {
        if (!current) return;
        if (!current.id.startsWith("default-para-")) return;
        if (current.marker !== "p") return;
        if (current.children.length === 0) {
            paragraphs.pop();
            current = null;
            return;
        }
        const hasOnlyLineBreaks = current.children.every(
            (child) => (child as { type?: string }).type === "linebreak",
        );
        if (hasOnlyLineBreaks) {
            paragraphs.pop();
            current = null;
        }
    };

    const startParagraph = (
        marker: string,
        id: string,
        sid: string,
        markerText: string,
    ): ParagraphContainer => {
        const next: ParagraphContainer = {
            type: USFM_PARAGRAPH_NODE_TYPE,
            version: 1,
            direction: languageDirection,
            format: "start",
            indent: 0,
            tokenType: UsfmTokenTypes.marker,
            id,
            sid,
            marker,
            inPara: marker,
            markerText,
            children: [],
        };
        paragraphs.push(next);
        current = next;
        return next;
    };

    for (let i = 0; i < flatNodes.length; i++) {
        const node = flatNodes[i];
        const containerStartMarker = getContainerStartMarkerFromNode(node);
        if (containerStartMarker) {
            // Avoid emitting a synthetic leading \p when the file starts with
            // a top-level structural marker (like \c).
            dropLeadingEmptyDefaultParagraphIfNeeded();
            startParagraph(
                containerStartMarker.marker,
                containerStartMarker.id,
                containerStartMarker.sid,
                containerStartMarker.text,
            );
            continue;
        }

        if (!current) {
            // Avoid creating a leading empty default paragraph for pure whitespace/linebreaks.
            if ((node as { type?: string }).type === "linebreak") continue;
            // Default paragraphs get empty SID and default text (no trailing space)
            current = startParagraph(
                "p",
                `default-para-${paraIndex++}`,
                "",
                "\\p",
            );
        }

        if ((node as { type?: string }).type === "linebreak") {
            current.children.push(node);
            continue;
        }

        current.children.push(node);
    }

    // Ensure Regular mode always has at least one paragraph container.
    if (paragraphs.length === 0) {
        startParagraph("p", "default-para-0", "", "\\p");
    }

    return paragraphs;
}

function getContainerStartMarkerFromNode(
    node: USFMNodeJSON,
): { marker: string; id: string; sid: string; text: string } | null {
    // Back-compat: older serialized states used `type: "text"` + `lexicalType`.
    const isUsfmTextNode =
        node.type === USFM_TEXT_NODE_TYPE ||
        (node.type === "text" &&
            (node as { lexicalType?: string }).lexicalType ===
                USFM_TEXT_NODE_TYPE);
    if (!isUsfmTextNode) return null;

    const maybe = node as {
        tokenType?: string;
        marker?: string;
        id?: string;
        sid?: string;
        text?: string;
    };
    if (maybe.tokenType !== UsfmTokenTypes.marker) return null;
    if (!maybe.marker) return null;
    if (!isContainerStartMarker(maybe.marker)) return null;

    return {
        marker: maybe.marker,
        id: maybe.id ?? `para-marker-${maybe.marker}`,
        sid: maybe.sid ?? "",
        text: maybe.text ?? `\\${maybe.marker}`,
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
        lintErrors: [],
        // maybe set isMutable and show from parse if remembering settings? Right now we just adjust once we've rendered the stuff. NOt sure
    });
}
