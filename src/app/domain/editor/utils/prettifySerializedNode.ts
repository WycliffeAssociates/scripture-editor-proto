import type { SerializedElementNode, SerializedLexicalNode } from "lexical";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { isSerializedElementNode } from "@/app/domain/editor/nodes/USFMElementNode.ts";
import {
    isSerializedUSFMNestedEditorNode,
    type USFMNestedEditorNodeJSON,
} from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import {
    isSerializedUSFMTextNode,
    type SerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    ALL_USFM_MARKERS,
    VALID_PARA_MARKERS,
} from "@/core/data/usfm/tokens.ts";

export const POETRY_MARKERS = new Set([
    "q",
    "q1",
    "q2",
    "q3",
    "q4",
    "q5",
    "qc",
    "qa",
    "qm",
    "qm1",
    "qm2",
    "qm3",
    "qd",
]);

export type PrettifyContext = {
    previousSibling?: SerializedLexicalNode;
    nextSibling?: SerializedLexicalNode;
    poetryMarkers?: Set<string>;
};

export type PrettifyTransform = (
    node: SerializedLexicalNode,
    context: PrettifyContext,
) => SerializedLexicalNode | SerializedLexicalNode[];

/**
 * Scans for malformed markers (e.g. "\ \v ") in text/error nodes.
 * If found and valid, splits the node into a Marker node and a Text node.
 */
export function recoverMalformedMarkers(
    node: SerializedLexicalNode,
): SerializedLexicalNode | SerializedLexicalNode[] {
    if (
        isSerializedUSFMTextNode(node) &&
        (node.tokenType === UsfmTokenTypes.text ||
            node.tokenType === UsfmTokenTypes.error)
    ) {
        // Search for pattern: backslash + marker candidates + space
        // Regex: \\([a-zA-Z0-9]+)\s
        const regex = /\\([a-zA-Z0-9]+)\s/;
        const match = node.text.match(regex);

        if (match) {
            const capturedMarker = match[1];
            if (ALL_USFM_MARKERS.has(capturedMarker)) {
                // Found a valid marker.
                // match[0] is like "\v "
                // match.index is where it starts.

                // 1. Create Marker Node
                // Text should be just the marker part, e.g. "\v"
                const markerText = `\\${capturedMarker}`;

                const markerNode: SerializedUSFMTextNode = {
                    ...node,
                    tokenType: UsfmTokenTypes.marker,
                    marker: capturedMarker,
                    text: markerText,
                };

                // 2. Create Text Node for the rest
                // The match included the trailing space (\s).
                // We want to keep the text AFTER the marker.
                // If match is "\v ", length is 3.
                // If we want to keep the space in the text node (as per example " 13 13 Text"),
                // we should slice after the marker text length.
                // match.index + markerText.length
                const matchIndex = match.index ?? 0;
                const remainingText = node.text.slice(
                    matchIndex + markerText.length,
                );

                const textNode: SerializedUSFMTextNode = {
                    ...node,
                    tokenType: UsfmTokenTypes.text,
                    text: remainingText,
                    marker: undefined, // Clear marker
                };

                return [markerNode, textNode];
            }
        }
    }
    return node;
}

/**
 * Replaces multiple consecutive spaces with a single space.
 * Preserves \n. Trims trailing spaces to max 1.
 */
export function collapseWhitespaceInTextNode(
    node: SerializedUSFMTextNode,
): SerializedUSFMTextNode {
    if (node.tokenType !== UsfmTokenTypes.text) return node;

    // Replace multiple whitespace characters with a single space
    const newText = node.text.replace(/\s+/g, " ");

    if (newText === node.text) return node;

    return {
        ...node,
        text: newText,
    } as SerializedUSFMTextNode;
}

/**
 * Detects the pattern \v 5 5 and removes the duplicate number from the text node.
 */
export function removeDuplicateVerseNumbers(
    node: SerializedLexicalNode,
    context: PrettifyContext,
): SerializedLexicalNode {
    if (
        isSerializedUSFMTextNode(node) &&
        node.tokenType === UsfmTokenTypes.text
    ) {
        const { previousSibling } = context;
        if (
            previousSibling &&
            isSerializedUSFMTextNode(previousSibling) &&
            previousSibling.tokenType === UsfmTokenTypes.numberRange
        ) {
            const verseNumber = previousSibling.text.trim();
            // Check if text starts with optional whitespace + verseNumber
            // e.g. " 5 Text", "5Text", " 5Text"
            const regex = new RegExp(`^\\s*${verseNumber}\\s*`);
            if (regex.test(node.text)) {
                const newText = node.text.replace(regex, "");
                // If we stripped everything, we might want to return an empty string or handle it.
                // But usually there's text after. If it becomes empty, that's fine.
                // We also want to ensure we don't strip *too* much if the user intended something else,
                // but the requirement says "strip the number and any following whitespace".

                // Wait, the requirement says: "Ensure it strips the number *and* any following whitespace, leaving the text clean."
                // My regex `^\\s*${verseNumber}\\s*` matches leading space, the number, and trailing space.
                // Replacing that with "" (empty string) effectively removes it.

                return {
                    ...node,
                    text: newText,
                } as SerializedUSFMTextNode;
            }
        }
    }
    return node;
}

/**
 * If node is a numberRange following a \c marker, ensure a linebreak node follows it.
 */
export function insertLinebreakAfterChapterNumberRange(
    node: SerializedLexicalNode,
    context: PrettifyContext,
): SerializedLexicalNode | SerializedLexicalNode[] {
    if (
        isSerializedUSFMTextNode(node) &&
        node.tokenType === UsfmTokenTypes.numberRange
    ) {
        // Check if it is a chapter number
        let isChapter = false;
        if (node.marker === "c") {
            isChapter = true;
        } else if (!node.marker && context.previousSibling) {
            // Fallback: check previous sibling
            if (
                isSerializedUSFMTextNode(context.previousSibling) &&
                context.previousSibling.marker === "c"
            ) {
                isChapter = true;
            }
        }

        if (isChapter) {
            return [node, { type: "linebreak", version: 1 }];
        }
    }
    return node;
}

/**
 * Ensure a linebreak node exists before any VALID_PARA_MARKERS.
 */
export function insertLinebreakBeforeParaMarkers(
    node: SerializedLexicalNode,
    context: PrettifyContext,
): SerializedLexicalNode | SerializedLexicalNode[] {
    if (
        isSerializedUSFMTextNode(node) &&
        node.marker &&
        VALID_PARA_MARKERS.has(node.marker)
    ) {
        // Requirement: ALWAYS insert a linebreak before poetry markers (remove exclusion).
        // So we just check VALID_PARA_MARKERS.

        const { previousSibling } = context;
        if (previousSibling && previousSibling.type === "linebreak") {
            return node;
        }
        // If it's the first node, we don't necessarily need a linebreak before it
        if (!previousSibling) return node;

        return [{ type: "linebreak", version: 1 }, node];
    }
    return node;
}

/**
 * Ensure a linebreak node exists after any VALID_PARA_MARKERS.
 */
export function insertLinebreakAfterParaMarkers(
    node: SerializedLexicalNode,
    context: PrettifyContext,
): SerializedLexicalNode | SerializedLexicalNode[] {
    if (
        isSerializedUSFMTextNode(node) &&
        node.marker &&
        VALID_PARA_MARKERS.has(node.marker)
    ) {
        // Check if it is a poetry marker
        const isPoetry = context.poetryMarkers?.has(node.marker);

        if (isPoetry) {
            // Requirement: ONLY insert a linebreak after a poetry marker IF the next sibling is a MARKER node.
            const { nextSibling } = context;
            if (
                nextSibling &&
                isSerializedUSFMTextNode(nextSibling) &&
                nextSibling.tokenType === UsfmTokenTypes.marker
            ) {
                // Insert linebreak
            } else {
                // DO NOT insert linebreak
                return node;
            }
        }

        // For non-poetry markers, OR if poetry condition met:
        const { nextSibling } = context;
        if (nextSibling && nextSibling.type === "linebreak") {
            return node;
        }
        return [node, { type: "linebreak", version: 1 }];
    }
    return node;
}

/**
 * Reduce multiple spaces between a paragraph marker and its content to a single space.
 */
export function normalizeSpacingAfterParaMarkers(
    node: SerializedLexicalNode,
    context: PrettifyContext,
): SerializedLexicalNode | SerializedLexicalNode[] {
    if (
        isSerializedUSFMTextNode(node) &&
        node.tokenType === UsfmTokenTypes.text
    ) {
        const usfmNode = node as SerializedUSFMTextNode;
        const { previousSibling } = context;
        if (
            previousSibling &&
            isSerializedUSFMTextNode(previousSibling) &&
            previousSibling.marker &&
            VALID_PARA_MARKERS.has(previousSibling.marker)
        ) {
            // Normalize leading spaces to exactly one space
            const newText = usfmNode.text.replace(/^ +/, " ");
            if (newText !== usfmNode.text) {
                return { ...usfmNode, text: newText } as SerializedUSFMTextNode;
            }
        }
    }
    return node;
}

/**
 * Removes linebreaks if they are immediately followed by a Verse Marker (\v).
 * Keeps them if followed by Paragraph Marker or Text.
 */
export function removeInterVerseLinebreaks(
    node: SerializedLexicalNode,
    context: PrettifyContext,
): SerializedLexicalNode | SerializedLexicalNode[] {
    if (node.type === "linebreak") {
        const { nextSibling, previousSibling } = context;

        // If previous sibling is a paragraph marker, we MUST keep the linebreak
        // to avoid the cycle with insertLinebreakAfterParaMarkers
        if (
            previousSibling &&
            isSerializedUSFMTextNode(previousSibling) &&
            previousSibling.marker &&
            VALID_PARA_MARKERS.has(previousSibling.marker)
        ) {
            return node;
        }

        if (
            nextSibling &&
            isSerializedUSFMTextNode(nextSibling) &&
            nextSibling.tokenType === UsfmTokenTypes.marker &&
            nextSibling.marker === "v"
        ) {
            return [];
        }
    }
    return node;
}

export type PendingVerse = {
    verseNumber: string;
    resultIndex: number;
};

/**
 * Distributes combined verse text (e.g. "\v 1 \v 2 1. TextOne 2. TextTwo")
 * to their respective verse markers.
 */
export function distributeCombinedVerseText(
    nodes: SerializedLexicalNode[],
): SerializedLexicalNode[] {
    const result: SerializedLexicalNode[] = [];
    const pendingVerses: PendingVerse[] = [];

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        // Clear pending verses if we encounter a marker that is not a verse marker
        if (
            isSerializedUSFMTextNode(node) &&
            node.tokenType === UsfmTokenTypes.marker &&
            node.marker !== "v"
        ) {
            pendingVerses.length = 0;
        } else if (
            !isSerializedUSFMTextNode(node) &&
            node.type !== "linebreak"
        ) {
            // Clear pending verses on non-USFM nodes (except linebreaks)
            pendingVerses.length = 0;
        }

        if (isSerializedUSFMTextNode(node)) {
            // Check for Verse Marker + Number
            if (node.tokenType === UsfmTokenTypes.numberRange) {
                const prevNode = result[result.length - 1];
                if (
                    prevNode &&
                    isSerializedUSFMTextNode(prevNode) &&
                    prevNode.tokenType === UsfmTokenTypes.marker &&
                    prevNode.marker === "v"
                ) {
                    result.push(node);
                    pendingVerses.push({
                        verseNumber: node.text.trim(),
                        resultIndex: result.length,
                    });
                    continue;
                }
            }

            // Check for Text Node
            if (
                node.tokenType === UsfmTokenTypes.text &&
                pendingVerses.length > 0
            ) {
                const text = node.text;
                const matches: { verse: string; start: number }[] = [];

                for (const pv of pendingVerses) {
                    // Regex: verseNumber + [. )]
                    // Escape verseNumber just in case
                    const escapedVerse = pv.verseNumber.replace(
                        /[.*+?^${}()|[\]\\]/g,
                        "\\$&",
                    );
                    const regex = new RegExp(`${escapedVerse}[. )]`);
                    const match = regex.exec(text);
                    if (match) {
                        matches.push({
                            verse: pv.verseNumber,
                            start: match.index,
                        });
                    }
                }

                if (matches.length > 0) {
                    matches.sort((a, b) => a.start - b.start);

                    const preText = text.slice(0, matches[0].start);

                    // Handle preText
                    if (preText.length > 0) {
                        const remainingNode: SerializedUSFMTextNode = {
                            ...node,
                            text: preText,
                        };
                        const insertionIndex = result.length;
                        result.push(remainingNode);

                        // Shift pending verses that were at the end
                        for (const p of pendingVerses) {
                            if (p.resultIndex >= insertionIndex) {
                                p.resultIndex++;
                            }
                        }
                    }

                    // Process matches
                    for (let m = 0; m < matches.length; m++) {
                        const match = matches[m];
                        const nextStart = matches[m + 1]?.start ?? text.length;
                        const segmentText = text.slice(match.start, nextStart);

                        const pvIndex = pendingVerses.findIndex(
                            (p) => p.verseNumber === match.verse,
                        );
                        if (pvIndex !== -1) {
                            const pv = pendingVerses[pvIndex];

                            const newNode: SerializedUSFMTextNode = {
                                ...node,
                                text: segmentText,
                            };

                            result.splice(pv.resultIndex, 0, newNode);

                            // Shift indices
                            for (const p of pendingVerses) {
                                if (p.resultIndex >= pv.resultIndex) {
                                    p.resultIndex++;
                                }
                            }

                            pendingVerses.splice(pvIndex, 1);
                        }
                    }

                    continue;
                } else {
                    // No matches found in this text node, so clear pending verses
                    // to prevent false matches in future text nodes.
                    pendingVerses.length = 0;
                }
            }
        }

        result.push(node);
    }

    return result;
}

/**
 * Ensures at least one space exists between inline nodes (markers, numbers, text).
 */
export function ensureSpaceBetweenNodes(
    node: SerializedLexicalNode,
    context: PrettifyContext,
): SerializedLexicalNode {
    // Skip if node is linebreak
    if (node.type === "linebreak") return node;

    const { previousSibling } = context;

    // Skip if previousSibling is linebreak or undefined
    if (!previousSibling || previousSibling.type === "linebreak") return node;

    // Skip if node or previousSibling are not "text-like"
    if (
        !isSerializedUSFMTextNode(node) ||
        !isSerializedUSFMTextNode(previousSibling)
    ) {
        return node;
    }

    // Check Boundary
    const prevText = (previousSibling as SerializedUSFMTextNode).text;
    const currText = (node as SerializedUSFMTextNode).text;

    const prevEndsWithSpace = /\s$/.test(prevText);
    const currStartsWithSpace = /^\s/.test(currText);

    if (!prevEndsWithSpace && !currStartsWithSpace) {
        return {
            ...node,
            text: ` ${currText}`,
        } as SerializedUSFMTextNode;
    }

    return node;
}

/**
 * Composes all the above transforms.
 */
export function prettifySerializedNode(
    node: SerializedLexicalNode,
    context: PrettifyContext,
): SerializedLexicalNode | SerializedLexicalNode[] {
    let currentNode = node;

    // Apply single-node transforms first
    if (isSerializedUSFMTextNode(currentNode)) {
        const recovered = recoverMalformedMarkers(currentNode);
        if (Array.isArray(recovered)) {
            return recovered;
        }
        currentNode = recovered as SerializedLexicalNode;

        currentNode = collapseWhitespaceInTextNode(
            currentNode as SerializedUSFMTextNode,
        );

        currentNode = ensureSpaceBetweenNodes(currentNode, context);

        currentNode = removeDuplicateVerseNumbers(
            currentNode,
            context,
        ) as SerializedUSFMTextNode;
        const normalized = normalizeSpacingAfterParaMarkers(
            currentNode,
            context,
        );
        if (!Array.isArray(normalized)) {
            currentNode = normalized;
        }
    } else if (currentNode.type === "linebreak") {
        const result = removeInterVerseLinebreaks(currentNode, context);
        if (Array.isArray(result) && result.length === 0) {
            return [];
        }
        if (!Array.isArray(result)) {
            currentNode = result;
        }
    }

    // Now apply transforms that can return arrays
    const result: SerializedLexicalNode[] = [currentNode];

    // Before Para Markers
    const beforePara = insertLinebreakBeforeParaMarkers(currentNode, context);
    if (Array.isArray(beforePara)) {
        result.unshift({
            type: "linebreak",
            version: 1,
        } as SerializedLexicalNode);
    }

    // After Para Markers
    const afterPara = insertLinebreakAfterParaMarkers(currentNode, context);
    if (Array.isArray(afterPara)) {
        result.push({ type: "linebreak", version: 1 } as SerializedLexicalNode);
    }

    // After Chapter Number Range
    const afterChapter = insertLinebreakAfterChapterNumberRange(
        currentNode,
        context,
    );
    if (Array.isArray(afterChapter)) {
        // Check if we already added a linebreak from afterPara (unlikely to be both, but safe)
        if (result[result.length - 1].type !== "linebreak") {
            result.push({
                type: "linebreak",
                version: 1,
            } as SerializedLexicalNode);
        }
    }

    return result.length === 1 ? result[0] : result;
}

/**
 * Iterates through nodes, maintains context (prev/next), applies prettifySerializedNode,
 * and recursively processes children for ElementNode and USFMNestedEditorNode.
 */
export function applyPrettifyToNodeTree(
    nodes: SerializedLexicalNode[],
    poetryMarkers: Set<string> = POETRY_MARKERS,
): SerializedLexicalNode[] {
    // 0. Distribute combined verse text
    const distributedNodes = distributeCombinedVerseText(nodes);

    // 1. Merge adjacent text nodes with same SID/marker/tokenType to allow whitespace collapse across nodes
    const mergedNodes: SerializedLexicalNode[] = [];
    for (const node of distributedNodes) {
        const lastNode = mergedNodes[mergedNodes.length - 1];
        if (
            lastNode &&
            isSerializedUSFMTextNode(lastNode) &&
            isSerializedUSFMTextNode(node) &&
            lastNode.sid === node.sid &&
            lastNode.marker === node.marker &&
            lastNode.tokenType === node.tokenType &&
            lastNode.tokenType === UsfmTokenTypes.text
        ) {
            // Create a new node to avoid mutating the original
            const updatedLastNode = {
                ...(lastNode as SerializedUSFMTextNode),
                text: (lastNode as SerializedUSFMTextNode).text + node.text,
            };
            mergedNodes[mergedNodes.length - 1] = updatedLastNode;
        } else {
            mergedNodes.push(node);
        }
    }

    const intermediateResult: SerializedLexicalNode[] = [];

    for (let i = 0; i < mergedNodes.length; i++) {
        let node = mergedNodes[i];

        // Recursive step for children
        if (isSerializedElementNode(node)) {
            const elementNode = node as SerializedElementNode;
            if (elementNode.children) {
                node = {
                    ...elementNode,
                    children: applyPrettifyToNodeTree(
                        elementNode.children,
                        poetryMarkers,
                    ),
                } as SerializedElementNode;
            }
        } else if (isSerializedUSFMNestedEditorNode(node)) {
            const nestedNode = node as USFMNestedEditorNodeJSON;
            if (nestedNode.editorState?.root?.children) {
                node = {
                    ...nestedNode,
                    editorState: {
                        ...nestedNode.editorState,
                        root: {
                            ...nestedNode.editorState.root,
                            children: applyPrettifyToNodeTree(
                                nestedNode.editorState.root.children,
                                poetryMarkers,
                            ),
                        },
                    },
                } as USFMNestedEditorNodeJSON;
            }
        }

        const context: PrettifyContext = {
            previousSibling: intermediateResult[intermediateResult.length - 1],
            nextSibling: mergedNodes[i + 1],
            poetryMarkers,
        };

        const transformed = prettifySerializedNode(node, context);
        if (Array.isArray(transformed)) {
            intermediateResult.push(...transformed);
        } else {
            intermediateResult.push(transformed);
        }
    }

    // Post-process to remove duplicate linebreaks
    const finalResult: SerializedLexicalNode[] = [];
    for (const node of intermediateResult) {
        if (
            node.type === "linebreak" &&
            finalResult[finalResult.length - 1]?.type === "linebreak"
        ) {
            continue;
        }
        finalResult.push(node);
    }

    return finalResult;
}
