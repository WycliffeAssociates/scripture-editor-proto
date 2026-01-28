import type { SerializedElementNode, SerializedLexicalNode } from "lexical";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { isSerializedUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { isSerializedParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import { isSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { walkNodes } from "@/app/domain/editor/utils/serializedTraversal.ts";
import type { Marker } from "@/app/ui/contexts/ParagraphingContext.tsx";
import {
    ALL_USFM_MARKERS,
    VALID_NOTE_MARKERS,
} from "@/core/data/usfm/tokens.ts";

export const STAMPABLE_MARKERS = new Set(
    [...ALL_USFM_MARKERS].filter((marker) => {
        const dontInclude = ["s5", "c"];
        return !dontInclude.includes(marker) && !VALID_NOTE_MARKERS.has(marker);
    }),
);

/**
 * Recursively extracts structural markers from a serialized node tree.
 * Used to build the queue for Paragraphing Mode.
 */
export function extractMarkersFromSerialized(
    nodes: SerializedLexicalNode[],
): Marker[] {
    const markers: Marker[] = [];
    const currentVerse = "";

    // Helper function to extract text content from following nodes
    const getFollowingText = (
        startIdx: number,
        nodeArray: SerializedLexicalNode[],
    ): string => {
        const textParts: string[] = [];
        const maxNodes = 5;
        let nodesProcessed = 0;

        for (
            let i = startIdx;
            i < nodeArray.length && nodesProcessed < maxNodes;
            i++
        ) {
            const node = nodeArray[i];

            if (isSerializedUSFMTextNode(node)) {
                if (
                    node.tokenType === UsfmTokenTypes.text &&
                    node.text.trim()
                ) {
                    textParts.push(node.text.trim());
                    nodesProcessed++;
                } else if (
                    node.tokenType === UsfmTokenTypes.marker &&
                    node.marker &&
                    STAMPABLE_MARKERS.has(node.marker)
                ) {
                    break;
                }
            } else if (node.type === "linebreak") {
            }
        }

        return textParts.slice(0, 3).join(" ").trim();
    };

    const allNodes = [...walkNodes(nodes)];
    for (let i = 0; i < allNodes.length; i++) {
        const node = allNodes[i];
        if (!isSerializedUSFMTextNode(node)) continue;

        if (
            node.tokenType === UsfmTokenTypes.marker &&
            node.marker &&
            STAMPABLE_MARKERS.has(node.marker)
        ) {
            // Get the following text for context
            const nodeArray = Array.from(walkNodes(nodes));
            const currentIndex = nodeArray.indexOf(node);
            const followingText =
                currentIndex >= 0
                    ? getFollowingText(currentIndex + 1, nodeArray)
                    : "";

            // Handle verse markers specially - get verse number immediately
            let verseNumber = "";
            if (node.marker === "v") {
                const nextNode = allNodes[i + 1];
                const isNumberRangeNext =
                    isSerializedUSFMTextNode(nextNode) &&
                    nextNode.tokenType === UsfmTokenTypes.numberRange;
                verseNumber = isNumberRangeNext ? nextNode.text : "";
            }

            markers.push({
                type: node.marker,
                text: node.text,
                verse: currentVerse,
                sid: node.sid,
                id: node.id,
                contextText: followingText,
                verseNumber, // Set verse number directly for verse markers
            });
        }
    }
    return markers;
}

/**
 * Recursively removes structural markers and linebreaks from a serialized node tree.
 * Used to create a "Clean Slate" for Paragraphing Mode.
 */
export function stripMarkersFromSerialized(
    nodes: SerializedLexicalNode[],
): SerializedLexicalNode[] {
    const result: SerializedLexicalNode[] = [];

    let prevNode: null | SerializedLexicalNode = null;
    for (const node of nodes) {
        if (isSerializedUSFMTextNode(node)) {
            if (node.tokenType === UsfmTokenTypes.text) {
                result.push(node);
                prevNode = node;
                continue;
            }

            if (
                node.tokenType === UsfmTokenTypes.marker &&
                node.marker &&
                node.marker === "c"
            ) {
                result.push(node);
                prevNode = node;
                continue;
            }

            if (node.tokenType === UsfmTokenTypes.numberRange) {
                if (
                    prevNode &&
                    "marker" in prevNode &&
                    prevNode.marker === "c"
                ) {
                    result.push(node);
                    prevNode = node;
                }
                continue;
            }
            continue;
        }

        if (node.type === "linebreak") {
            result.push(node);
            prevNode = node;
            continue;
        }

        if (isSerializedUSFMNestedEditorNode(node)) {
            prevNode = node;
            continue;
        }

        if (isSerializedParagraphNode(node)) {
            const elementNode = node as SerializedElementNode;
            if (elementNode.children) {
                const cleanedChildren = stripMarkersFromSerialized(
                    elementNode.children,
                );
                const newElementNode: SerializedElementNode = {
                    ...elementNode,
                    children: cleanedChildren,
                };
                result.push(newElementNode);
            } else {
                result.push(node);
            }
        }
    }

    return result;
}
