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
import {
    isDocumentMarker,
    isValidParaMarker,
} from "@/core/data/usfm/tokens.ts";
import { TokenMap } from "@/core/domain/usfm/lex.ts";

export interface LexicalStates {
    /** Flat state for Save/Diff comparison (always flat token stream) */
    loadedLexicalState: SerializedEditorState<SerializedLexicalNode>;
    /** Paragraph-wrapped state for WYSIWYG editor mode (paragraph containers) */
    lexicalState: SerializedEditorState<SerializedLexicalNode>;
}

/**
 * Serializes USFM tokens to Lexical states efficiently.
 * Tokens are only serialized once. Paragraph grouping only happens when needed.
 *
 * @param tokens - Parsed USFM tokens
 * @param languageDirection - Text direction
 * @param needsParagraphs - Whether to generate paragraph-wrapped state (true for 'regular' mode)
 * @returns Object containing flat state and optionally paragraph-wrapped state
 */
export function parsedUsfmTokensToLexicalStates(
    tokens: ParsedToken[],
    languageDirection: "ltr" | "rtl",
    needsParagraphs: boolean,
): LexicalStates {
    const flatNodes = tokens
        .map((t) => serializeToken(t, languageDirection))
        .filter(Boolean);

    const flatState: SerializedEditorState<SerializedLexicalNode> = {
        root: {
            children: flatNodes,
            type: "root",
            version: 1,
            direction: languageDirection,
            format: "start",
            indent: 0,
        },
    };

    if (!needsParagraphs) {
        // For usfm/plain mode: both states are flat (separate objects for diff comparison)
        return {
            loadedLexicalState: flatState,
            lexicalState: {
                root: {
                    children: [...flatNodes],
                    type: "root",
                    version: 1,
                    direction: languageDirection,
                    format: "start",
                    indent: 0,
                },
            },
        };
    }

    // For regular mode: paragraph-wrapped lexicalState, flat loadedLexicalState
    const paragraphNodes = groupFlatNodesIntoParagraphContainers(
        flatNodes,
        languageDirection,
    );

    return {
        loadedLexicalState: flatState,
        lexicalState: {
            root: {
                children: paragraphNodes,
                type: "root",
                version: 1,
                direction: languageDirection,
                format: "start",
                indent: 0,
            },
        },
    };
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

    for (const node of flatNodes) {
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
        text: maybe.text ?? `\\${maybe.marker} `,
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
