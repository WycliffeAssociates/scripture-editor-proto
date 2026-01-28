import type { SerializedElementNode, SerializedLexicalNode } from "lexical";
import {
    USFM_PARAGRAPH_NODE_TYPE,
    USFM_TEXT_NODE_TYPE,
    type USFMNodeJSON,
    UsfmTokenTypes,
} from "@/app/data/editor.ts";
import {
    isSerializedUSFMNestedEditorNode,
    type USFMNestedEditorNodeJSON,
} from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import {
    isSerializedParagraphNode,
    type USFMParagraphNodeJSON,
} from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    createSerializedUSFMTextNode,
    isSerializedToggleMutableUSFMTextNode,
    isSerializedToggleShowUSFMTextNode,
    isSerializedUSFMTextNode,
    type SerializedUSFMTextNode,
    updateSerializedToggleableUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { isSerializedUSFMParagraphContainer } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";
import { isValidParaMarker } from "@/core/data/usfm/tokens.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";

export function adjustSerializedLexicalNodes(
    node: SerializedLexicalNode,
    options: { show: boolean; isMutable: boolean; flattenNested?: boolean },
): SerializedLexicalNode[] {
    const { show, isMutable, flattenNested = false } = options;

    if (node.type === USFM_TEXT_NODE_TYPE) {
        return [
            updateSerializedToggleableUSFMTextNode(
                node as SerializedUSFMTextNode,
                {
                    show: isSerializedToggleShowUSFMTextNode(node)
                        ? show
                        : true,
                    isMutable: isSerializedToggleMutableUSFMTextNode(node)
                        ? isMutable
                        : true,
                },
            ),
        ];
    }

    if (flattenNested && isSerializedUSFMNestedEditorNode(node)) {
        // Create opening marker node
        const openingMarker = createSerializedUSFMTextNode({
            text: `\\${node.marker} `,
            id: guidGenerator(),
            sid: node.sid || "",
            tokenType: UsfmTokenTypes.marker,
            marker: node.marker,
            show: true,
            isMutable: true,
        });

        const nestedChildren: SerializedLexicalNode[] =
            node.editorState.root.children.flatMap((child) => {
                if (isSerializedParagraphNode(child)) {
                    return (child.children || []).flatMap((c) =>
                        adjustSerializedLexicalNodes(c, options),
                    );
                }
                return adjustSerializedLexicalNodes(child, options);
            });

        return [openingMarker, ...nestedChildren];
    }

    if (isSerializedParagraphNode(node)) {
        const elementNode = node as SerializedElementNode;
        if (elementNode.children) {
            elementNode.children = elementNode.children.flatMap(
                (child: SerializedLexicalNode) =>
                    adjustSerializedLexicalNodes(child, options),
            );
        }
    }

    if (isSerializedUSFMNestedEditorNode(node)) {
        const nestedNode = node as USFMNestedEditorNodeJSON;
        if (nestedNode.editorState?.root?.children) {
            nestedNode.editorState.root.children =
                nestedNode.editorState.root.children.flatMap(
                    (child: SerializedLexicalNode) =>
                        adjustSerializedLexicalNodes(child, options),
                );
        }
    }

    return [node];
}

/**
 * Flattens paragraph-tree structure into a flat token stream for Source mode.
 * Each USFMParagraphNode container is converted to a paragraph marker token
 * followed by its children (preserving node IDs where possible).
 */
export function flattenParagraphContainersToFlatTokens(
    rootChildren: SerializedLexicalNode[],
    options: { show: boolean; isMutable: boolean },
): SerializedLexicalNode[] {
    const result: SerializedLexicalNode[] = [];

    for (const node of rootChildren) {
        if (isSerializedUSFMParagraphContainer(node)) {
            const paragraphNode = node as USFMParagraphNodeJSON;
            const marker = paragraphNode.marker ?? "p";

            // Emit paragraph marker token (using the container's ID to preserve identity)
            const markerToken = createSerializedUSFMTextNode({
                text: `\\${marker} `,
                id: paragraphNode.id,
                sid: paragraphNode.sid ?? "",
                tokenType: UsfmTokenTypes.marker,
                marker,
                inPara: marker,
                show: options.show,
                isMutable: options.isMutable,
            });
            result.push(markerToken);

            // Recursively flatten children (handle nested paragraph containers if any)
            const flattenedChildren = flattenParagraphContainersToFlatTokens(
                paragraphNode.children ?? [],
                options,
            );
            result.push(...flattenedChildren);
        } else if (isSerializedUSFMNestedEditorNode(node)) {
            // Flatten nested editor: emit opening marker, then children, close marker is inside
            const nestedNode = node as USFMNestedEditorNodeJSON;
            const openingMarker = createSerializedUSFMTextNode({
                text: `\\${nestedNode.marker} `,
                id: guidGenerator(),
                sid: nestedNode.sid || "",
                tokenType: UsfmTokenTypes.marker,
                marker: nestedNode.marker,
                show: options.show,
                isMutable: options.isMutable,
            });
            result.push(openingMarker);

            // Flatten nested content
            const nestedChildren = nestedNode.editorState?.root?.children ?? [];
            const flattenedNested = flattenParagraphContainersToFlatTokens(
                nestedChildren,
                options,
            );
            result.push(...flattenedNested);
        } else {
            // Regular token - apply show/mutable adjustments
            const adjusted = adjustSerializedLexicalNodes(node, {
                ...options,
                flattenNested: false,
            });
            result.push(...adjusted);
        }
    }

    return result;
}

/**
 * Lexical root nodes can only contain ElementNode or DecoratorNode children.
 * In Source/Raw mode we represent the document as a flat token stream, which
 * includes Text/LineBreak nodes; those must be wrapped in an element.
 */
export function wrapFlatTokensInLexicalParagraph(
    flatTokens: SerializedLexicalNode[],
    languageDirection: "ltr" | "rtl" = "ltr",
): SerializedElementNode {
    return {
        type: "paragraph",
        version: 1,
        direction: languageDirection,
        format: "",
        indent: 0,
        children: flatTokens,
    };
}

/**
 * Groups flat tokens into paragraph containers for Regular mode.
 * Scans for paragraph marker tokens and groups subsequent tokens into containers.
 */
export function groupFlatTokensIntoParagraphContainers(
    flatTokens: SerializedLexicalNode[],
    languageDirection: "ltr" | "rtl" = "ltr",
): USFMNodeJSON[] {
    type ParagraphContainer = USFMParagraphNodeJSON & {
        children: USFMNodeJSON[];
    };

    const paragraphs: ParagraphContainer[] = [];
    let current: ParagraphContainer | null = null;
    let paraIndex = 0;

    const isSectionMarker = (marker: string) =>
        marker === "s" || /^s\d+$/u.test(marker);
    const isContainerStartMarker = (marker: string) =>
        isValidParaMarker(marker) || marker === "c" || isSectionMarker(marker);

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
            (child) => (child as SerializedLexicalNode).type === "linebreak",
        );
        if (hasOnlyLineBreaks) {
            paragraphs.pop();
            current = null;
        }
    };

    const startParagraph = (marker: string, id: string): ParagraphContainer => {
        const next: ParagraphContainer = {
            type: USFM_PARAGRAPH_NODE_TYPE,
            version: 1,
            direction: languageDirection,
            format: "",
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

    for (const node of flatTokens) {
        // Start a new container on certain marker tokens.
        if (isSerializedUSFMTextNode(node)) {
            const textNode = node as SerializedUSFMTextNode;
            if (
                textNode.tokenType === UsfmTokenTypes.marker &&
                textNode.marker &&
                isContainerStartMarker(textNode.marker)
            ) {
                // If we created a default paragraph only to hold leading whitespace,
                // drop it so we don't emit a synthetic leading \p.
                dropLeadingEmptyDefaultParagraphIfNeeded();

                // Start new container, use the marker token's ID.
                startParagraph(textNode.marker, textNode.id);
                continue;
            }
        }

        // If no current paragraph, create default (only when we encounter content).
        if (!current) {
            // Avoid creating a leading empty default paragraph for pure whitespace/linebreaks.
            if (node.type === "linebreak") continue;
            current = startParagraph("p", `default-para-${paraIndex++}`);
        }

        current.children.push(node as USFMNodeJSON);
    }

    // Ensure at least one paragraph container
    if (paragraphs.length === 0) {
        startParagraph("p", "default-para-0");
    }

    return paragraphs;
}
