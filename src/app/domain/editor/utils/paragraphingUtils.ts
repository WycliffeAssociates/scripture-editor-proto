import type { SerializedElementNode, SerializedLexicalNode } from "lexical";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import {
    isSerializedUSFMNestedEditorNode,
    type USFMNestedEditorNodeJSON,
} from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { isSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    POETRY_MARKERS,
    PRETTIFY_LINEBREAK_BEFORE_AND_AFTER_MARKERS,
} from "@/app/domain/editor/utils/prettifySerializedNode.ts";
import type { Marker } from "@/app/ui/contexts/ParagraphingContext.tsx";

export const STAMPABLE_MARKERS = new Set([
    ...PRETTIFY_LINEBREAK_BEFORE_AND_AFTER_MARKERS,
    ...POETRY_MARKERS,
    "pc", // Centered paragraph
    "pr", // Right-aligned paragraph
    "cls", // Closure
    // Add other structural markers if missing from the imported sets
]);

/**
 * Recursively extracts structural markers from a serialized node tree.
 * Used to build the queue for Paragraphing Mode.
 */
export function extractMarkersFromSerialized(
    nodes: SerializedLexicalNode[],
): Marker[] {
    const markers: Marker[] = [];
    let currentVerse = "";

    function traverse(node: SerializedLexicalNode) {
        if (isSerializedUSFMTextNode(node)) {
            // Track current verse context
            if (
                node.tokenType === UsfmTokenTypes.numberRange &&
                node.marker === "v"
            ) {
                currentVerse = node.text.trim();
            }

            // Extract stampable markers
            if (
                node.tokenType === UsfmTokenTypes.marker &&
                node.marker &&
                STAMPABLE_MARKERS.has(node.marker)
            ) {
                markers.push({
                    type: node.marker,
                    text: node.text,
                    verse: currentVerse,
                });
            }
        } else if (isSerializedUSFMNestedEditorNode(node)) {
            const nestedNode = node as USFMNestedEditorNodeJSON;
            if (nestedNode.editorState?.root?.children) {
                nestedNode.editorState.root.children.forEach(traverse);
            }
        } else if ("children" in node) {
            const elementNode = node as SerializedElementNode;
            if (elementNode.children) {
                elementNode.children.forEach(traverse);
            }
        }
    }

    nodes.forEach(traverse);
    return markers;
}

/**
 * Extracts structural markers from a raw USFM string.
 * Used to build the queue for Paragraphing Mode from a reference text.
 */
export function extractMarkersFromUsfmString(usfm: string): Marker[] {
    const markers: Marker[] = [];
    let currentVerse = "";

    // Regex to find all markers.
    // Matches backslash followed by alphanumeric characters.
    const markerRegex = /\\([a-zA-Z0-9]+)/g;

    let match: RegExpExecArray | null = null;
    // biome-ignore lint/suspicious/noAssignInExpressions: Standard regex loop pattern
    while ((match = markerRegex.exec(usfm)) !== null) {
        const marker = match[1];
        const index = match.index;

        if (marker === "v") {
            // We need to find the verse number following \v
            // Look ahead from the end of the match
            const afterMarker = usfm.slice(index + match[0].length);
            const verseMatch = afterMarker.match(/^\s*(\S+)/);
            if (verseMatch) {
                currentVerse = verseMatch[1];
            }
        } else if (STAMPABLE_MARKERS.has(marker)) {
            markers.push({
                type: marker,
                text: `\\${marker}`,
                verse: currentVerse,
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

    for (const node of nodes) {
        // 1. Handle USFM Text Nodes
        if (isSerializedUSFMTextNode(node)) {
            // Remove stampable markers
            if (
                node.tokenType === UsfmTokenTypes.marker &&
                node.marker &&
                STAMPABLE_MARKERS.has(node.marker)
            ) {
                continue; // Skip this node
            }

            // Keep other USFM nodes (text, verses, chapters, etc.)
            result.push(node);
        }
        // 2. Handle Linebreaks - Remove them all
        else if (node.type === "linebreak") {
        }
        // 3. Handle Nested Editors (recurse)
        else if (isSerializedUSFMNestedEditorNode(node)) {
            const nestedNode = node as USFMNestedEditorNodeJSON;
            if (nestedNode.editorState?.root?.children) {
                const cleanedChildren = stripMarkersFromSerialized(
                    nestedNode.editorState.root.children,
                );

                const newNestedNode: USFMNestedEditorNodeJSON = {
                    ...nestedNode,
                    editorState: {
                        ...nestedNode.editorState,
                        root: {
                            ...nestedNode.editorState.root,
                            children: cleanedChildren,
                        },
                    },
                };
                result.push(newNestedNode);
            } else {
                result.push(node);
            }
        }
        // 4. Handle Element Nodes (recurse)
        else if ("children" in node) {
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
        // 5. Keep everything else
        else {
            result.push(node);
        }
    }

    return result;
}
