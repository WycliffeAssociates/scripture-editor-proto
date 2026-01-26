import type { SerializedLexicalNode } from "lexical";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { isSerializedElementNode } from "@/app/domain/editor/nodes/USFMElementNode.ts";
import { isSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { walkNodes } from "@/app/domain/editor/utils/serializedTraversal.ts";
import { VALID_PARA_MARKERS } from "@/core/data/usfm/tokens.ts";

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
    const isElementMarker = isSerializedElementNode(node) && !!marker;
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
 * Identifies if a node is "content" (verse anchors, text, char markers, footnotes).
 */
function isContentNode(node: SerializedLexicalNode): boolean {
    if (isStructureMarker(node)) return false;

    // Nodes with an SID are definitely content
    if (hasSid(node) && node.sid) return true;

    // Verse markers are content (anchors)
    if (
        isSerializedUSFMTextNode(node) &&
        node.tokenType === UsfmTokenTypes.marker &&
        node.marker === "v"
    ) {
        return true;
    }

    // Linebreaks are preserved if they appear in the content flow
    if (node.type === "linebreak") return true;

    return false;
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
    const newNode: any = {
        ...node,
        id:
            nodeId ??
            (typeof crypto !== "undefined"
                ? crypto.randomUUID()
                : Math.random().toString(36).slice(2)),
    };
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
    // Convert to array for backwards iteration
    const allSourceNodes = [...walkNodes(sourceNodes)];

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
    for (const node of walkNodes(targetNodes)) {
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
                    .map((n) => (hasMarker(n) ? n.marker : (n as any).marker)),
            );

            const markersToInsert: SerializedLexicalNode[] = [];

            for (const expNode of expectedStructure) {
                const expMarker = hasMarker(expNode)
                    ? expNode.marker
                    : (expNode as any).marker;
                if (expMarker && !bufferMarkers.has(expMarker)) {
                    markersToInsert.push(cloneNode(expNode));
                }
            }

            // Emit Buffer first (preserving Target content/structure)
            result.push(...buffer);

            // Insert missing markers immediately before the verse
            if (markersToInsert.length > 0) {
                result.push(...markersToInsert);
                // Ensure a linebreak exists after inserted markers if needed?
                // Or rely on Prettify later.
                // Usually inserting a block marker implies a newline.
                // Let's add one strictly if we inserted markers.
                result.push({ type: "linebreak", version: 1 });
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
