import type { SerializedLexicalNode } from "lexical";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { isSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { materializeFlatTokensArray } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";
import type { Marker } from "@/app/ui/contexts/ParagraphingContext.tsx";
import {
    ALL_USFM_MARKERS,
    VALID_NOTE_MARKERS,
} from "@/core/data/usfm/tokens.ts";

const STAMPABLE_MARKERS = new Set(
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

    // Use the flat token adapter to handle both flat and tree structures
    const allNodes = materializeFlatTokensArray(nodes);
    for (let i = 0; i < allNodes.length; i++) {
        const node = allNodes[i];
        if (!isSerializedUSFMTextNode(node)) continue;

        if (
            node.tokenType === UsfmTokenTypes.marker &&
            node.marker &&
            STAMPABLE_MARKERS.has(node.marker)
        ) {
            // Get the following text for context (use allNodes directly since it's already flat)
            const followingText = getFollowingText(i + 1, allNodes);

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
 * Recursively removes structural markers from a serialized node tree.
 * Used to create a "Clean Slate" for Paragraphing Mode.
 *
 * For paragraph containers (USFMParagraphNode), their children are flattened
 * into the result (the container itself is not kept, only its stripped children).
 */
export function stripMarkersFromSerialized(
    nodes: SerializedLexicalNode[],
): SerializedLexicalNode[] {
    const flatNodes = materializeFlatTokensArray(nodes);
    const result: SerializedLexicalNode[] = [];

    let prevNode: null | SerializedLexicalNode = null;
    for (const node of flatNodes) {
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
                    isSerializedUSFMTextNode(prevNode) &&
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
        }

        // We drop nested editor nodes themselves, but their children (text)
        // are included in the flat stream and will be preserved as text.
    }

    return result;
}
