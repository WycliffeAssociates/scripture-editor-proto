import type { SerializedLexicalNode } from "lexical";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { isSerializedParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import { isSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { materializeFlatTokensArray } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";
import { VALID_PARA_MARKERS } from "@/core/data/usfm/tokens.ts";
import {
    PRETTIFY_LINEBREAK_BEFORE_AND_AFTER_MARKERS,
    PRETTIFY_LINEBREAK_BEFORE_IF_NEXT_MARKER_MARKERS,
    PRETTIFY_LINEBREAK_BEFORE_MARKERS,
} from "@/core/domain/usfm/prettify/prettifyMarkers.ts";

/**
 * Para markers that should NOT be copied from source to target.
 */
const PARA_MARKERS_TO_SKIP = new Set(["s5"]);

/**
 * Type guard to check if a node has a `marker` property.
 */
function hasMarker(
    node: SerializedLexicalNode,
): node is SerializedLexicalNode & { marker: string } {
    return (
        "marker" in node &&
        typeof (node as { marker?: unknown }).marker === "string"
    );
}

/**
 * Type guard to check if a node has an `sid` property.
 */
function hasSid(
    node: SerializedLexicalNode,
): node is SerializedLexicalNode & { sid: string } {
    return "sid" in node && typeof (node as { sid?: unknown }).sid === "string";
}

/**
 * Type guard to check if a node has an `id` property.
 */
function hasId(
    node: SerializedLexicalNode,
): node is SerializedLexicalNode & { id: string } {
    return "id" in node && typeof (node as { id?: unknown }).id === "string";
}

/**
 * Identifies if a node is a structural USFM marker (e.g., \p, \q, \m).
 */
function isStructureMarker(node: SerializedLexicalNode): boolean {
    const marker = hasMarker(node) ? node.marker : undefined;
    const isMarkerToken =
        isSerializedUSFMTextNode(node) &&
        node.tokenType === UsfmTokenTypes.marker;
    const isElementMarker = isSerializedParagraphNode(node) && !!marker;
    return (
        (isMarkerToken || isElementMarker) &&
        !!marker &&
        VALID_PARA_MARKERS.has(marker)
    );
}

/**
 * Identifies if a node is a structure marker that should be skipped (not copied).
 */
function isSkippedStructureMarker(node: SerializedLexicalNode): boolean {
    if (!isStructureMarker(node)) return false;
    const marker = hasMarker(node) ? node.marker : undefined;
    return !!marker && PARA_MARKERS_TO_SKIP.has(marker);
}

/**
 * Checks if a node is a verse marker (\v).
 */
function isVerseMarker(node: SerializedLexicalNode): boolean {
    return (
        isSerializedUSFMTextNode(node) &&
        node.tokenType === UsfmTokenTypes.marker &&
        node.marker === "v"
    );
}

/**
 * Helper to clone a node with a new ID if it's an element or USFM node.
 */
function cloneNode(node: SerializedLexicalNode): SerializedLexicalNode {
    const nodeId = hasId(node) ? node.id : undefined;
    const newNode = {
        ...node,
        id:
            nodeId ??
            (typeof crypto !== "undefined"
                ? crypto.randomUUID()
                : Math.random().toString(36).slice(2)),
    } as SerializedLexicalNode & { id: string; lexicalKey?: string };
    if ("lexicalKey" in newNode) {
        newNode.lexicalKey = undefined;
    }
    return newNode as SerializedLexicalNode;
}

/**
 * Matches the paragraph/structural formatting of sourceNodes to targetNodes.
 *
 * Guiding principle: Copy para markers that come BEFORE verse content starts,
 * but NOT markers that appear mid-verse (after text has begun) since we can't
 * know where to insert them in the target text.
 *
 * Algorithm (backwards pass):
 * 1. Walk source nodes backwards to build a map of SID -> markers that precede it.
 *    Once we hit the numberRange + verse marker combo, collect paragraph markers
 *    until the SID changes.
 * 2. Queue all content nodes from Target by their SID.
 * 3. Reconstruct: for each unique SID (in order), emit its markers then its content.
 * 4. Append any leftover Target content at the end.
 */
export function matchFormattingToSource(
    targetNodes: SerializedLexicalNode[],
    sourceNodes: SerializedLexicalNode[],
): SerializedLexicalNode[] {
    // Convert to flat arrays for processing
    const allSourceNodes = materializeFlatTokensArray(sourceNodes, {
        nested: "preserve",
    });
    const allTargetNodes = materializeFlatTokensArray(targetNodes, {
        nested: "preserve",
    });

    // Map: SID -> markers/structure that should appear before this verse
    const markersForSid = new Map<string, SerializedLexicalNode[]>();
    // Track SIDs in order of first appearance
    const sidOrder: string[] = [];

    // 1. Collect Structure from Source
    // Walk backwards through source nodes
    let i = allSourceNodes.length - 1;
    while (i >= 0) {
        const node = allSourceNodes[i];

        // Look for content with SID (this identifies a verse)
        if (hasSid(node) && node.sid) {
            const sid = node.sid;

            // Track SID order (we'll reverse later)
            if (!markersForSid.has(sid)) {
                sidOrder.push(sid);
                markersForSid.set(sid, []);
            }

            // Walk backwards through all content with same SID
            while (
                i >= 0 &&
                hasSid(allSourceNodes[i]) &&
                (allSourceNodes[i] as SerializedLexicalNode & { sid: string })
                    .sid === sid
            ) {
                i--;
            }

            // Skip the verse marker (\v) if present
            if (i >= 0 && isVerseMarker(allSourceNodes[i])) {
                i--;
            }

            // Collect everything that precedes this verse (going backwards)
            // until we hit another SID-bearing node or start of file.
            const structure: SerializedLexicalNode[] = [];
            while (i >= 0) {
                const prevNode = allSourceNodes[i];

                if (isStructureMarker(prevNode)) {
                    if (!isSkippedStructureMarker(prevNode)) {
                        structure.unshift(prevNode); // prepend to maintain forward order
                    }
                } else if (hasSid(prevNode) && prevNode.sid) {
                    // Hit another verse's content (that isn't a structure marker), stop
                    break;
                }

                // We SKIP linebreaks from the reference (sourceNodes)
                // as per user instruction to not copy them.
                i--;
            }

            if (structure.length > 0) {
                markersForSid.set(sid, structure);
            }
        } else {
            i--;
        }
    }

    // Reverse sidOrder since we collected backwards
    sidOrder.reverse();

    // 2. Process Target (Merge Strategy)
    const result: SerializedLexicalNode[] = [];
    const buffer: SerializedLexicalNode[] = [];

    // Iterate through Target nodes
    for (const node of allTargetNodes) {
        if (isVerseMarker(node) && hasSid(node) && node.sid) {
            const sid = node.sid;

            // Reconcile Buffer with Source Expectations for this SID
            const expectedStructure = markersForSid.get(sid) || [];

            // Identify which Expected Markers are missing from the Buffer
            // We scan the buffer for structure markers to see if we satisfy expectations.
            // We use a simplified check: does the buffer contain a marker of the same type?
            // Note: This simple check might be insufficient if order/quantity matters (e.g. multiple \p),
            // but for USFM structure, usually distinct markers matter most.

            const bufferMarkers = new Set(
                buffer
                    .filter(isStructureMarker)
                    .flatMap((n) => (hasMarker(n) ? [n.marker] : [])),
            );

            const markersToInsert: SerializedLexicalNode[] = [];

            for (const expNode of expectedStructure) {
                const expMarker = hasMarker(expNode)
                    ? expNode.marker
                    : undefined;
                if (expMarker && !bufferMarkers.has(expMarker)) {
                    markersToInsert.push(cloneNode(expNode));
                }
            }

            // Emit Buffer first (preserving Target content/structure)
            result.push(...buffer);

            // Insert missing markers immediately before the verse
            for (const markerNode of markersToInsert) {
                const marker = hasMarker(markerNode)
                    ? markerNode.marker
                    : undefined;

                // 1. Check if we need a linebreak BEFORE this inserted marker
                // AND if the previous node (from buffer or result) isn't already a linebreak
                if (marker && PRETTIFY_LINEBREAK_BEFORE_MARKERS.has(marker)) {
                    const lastNode = result[result.length - 1];
                    if (!lastNode || lastNode.type !== "linebreak") {
                        result.push({ type: "linebreak", version: 1 });
                    }
                }

                // 2. Insert the Marker
                result.push(markerNode);

                // 3. Check if we need a linebreak AFTER this inserted marker
                // Logic mirrors insertLinebreakAfterParaMarkers from Prettify
                if (marker) {
                    let shouldInsertAfter = false;

                    if (
                        PRETTIFY_LINEBREAK_BEFORE_AND_AFTER_MARKERS.has(marker)
                    ) {
                        shouldInsertAfter = true;
                    } else if (
                        PRETTIFY_LINEBREAK_BEFORE_IF_NEXT_MARKER_MARKERS.has(
                            marker,
                        )
                    ) {
                        // For poetry, we usually only want a linebreak after if it's followed by another marker.
                        // Since we are inserting this BEFORE a verse marker (\v), the "next" node is effectively \v.
                        // So yes, we want a linebreak.
                        shouldInsertAfter = true;
                    }

                    if (shouldInsertAfter) {
                        result.push({ type: "linebreak", version: 1 });
                    }
                }
            }

            result.push(node); // The Verse Marker
            buffer.length = 0; // Clear buffer
        } else {
            buffer.push(node);
        }
    }

    // Flush remaining buffer (content after last verse, or if no verses found)
    result.push(...buffer);

    return result;
}
