import {
    $getRoot,
    ElementNode,
    type LexicalEditor,
    type LexicalNode,
    LineBreakNode,
    type SerializedLexicalNode,
} from "lexical";
import { USFM_TEXT_NODE_TYPE, UsfmTokenTypes } from "@/app/data/editor.ts";
import {
    $isUSFMNestedEditorNode,
    isSerializedUSFMNestedEditorNode,
    nestedEditorMarkers,
    type USFMNestedEditorNode,
    type USFMNestedEditorNodeJSON,
} from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { isSerializedParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    $isUSFMTextNode,
    isSerializedNumberOrPlainTextUSFMTextNode,
    isSerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { materializeFlatTokensFromSerialized } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";
import { parseSid } from "@/core/data/bible/bible.ts";

// function $serializedLexicalToUsfm(editor: LexicalEditor) {
//   return editor.getEditorState().read(() => {
//     const root = $getRoot();
//     const serialized = serializeNode(root, editor);
//     return serialized;
//   });
// }

function serializeNode(node: LexicalNode, editor: LexicalEditor): string {
    const nodeType = node.getType();
    if ($isUSFMNestedEditorNode(node)) {
        return serializeNestedEditorState(node, editor);
    }
    if (nodeType === USFM_TEXT_NODE_TYPE && $isUSFMTextNode(node)) {
        return node.getTextContent();
    }
    if (node instanceof ElementNode || nodeType === "paragraph") {
        const elNode = node as ElementNode;
        const children = elNode.getChildren?.() ?? [];
        return children.map((c) => serializeNode(c, editor)).join("");
    }
    if (node instanceof LineBreakNode) {
        return "\n";
    }
    return "";
}

function serializeNestedEditorState(
    node: USFMNestedEditorNode,
    editor: LexicalEditor,
) {
    // what to
    const editorState = editor.parseEditorState(node.getLatestEditorState());
    let nestedVal = `\\${node.getMarker()} `;
    editorState.read(() => {
        const nestedRoot = $getRoot();
        nestedVal += nestedRoot
            .getChildren()
            .map((c) => serializeNode(c, editor))
            .join("");
        nestedVal += ` \\${node.getMarker()}*`;
        return nestedVal;
    });
    return nestedVal;
}

//================================================================================
// Function 1: Serialize to a single USFM string
//================================================================================

/**
 * Serializes an array of Lexical nodes into a single, flat USFM string.
 * Uses the flat token adapter to handle both flat and paragraph-tree structures uniformly.
 * @param nodes - The array of serialized nodes from an editor state (root.children).
 * @returns A single string representing the complete USFM document.
 */
export function serializeToUsfmString(nodes: SerializedLexicalNode[]): string {
    let result = "";

    // The adapter yields tokens in reading order, including:
    // - Synthetic paragraph markers for USFMParagraphNode containers
    // - Nested editor content (but we handle opening markers specially)
    for (const node of materializeFlatTokensFromSerialized(nodes)) {
        if (node.type === "linebreak") {
            result += "\n";
            continue;
        }

        if (isSerializedUSFMTextNode(node)) {
            result += node.text;
            continue;
        }

        if (isSerializedUSFMNestedEditorNode(node)) {
            // The adapter will yield nested content after this node,
            // but we need to emit the opening marker here.
            // The close marker is inside the nested content.
            result += `\\${node.marker} `;
        }

        // Paragraph containers are already handled by the adapter
        // (synthetic markers emitted), so we skip them here.
    }

    return result;
}

//================================================================================
// Function 2: Serialize to a map of SID -> Plain Text
//================================================================================

// type SidTextMapOptions = {
//     ignoreFootnotes?: boolean;
//     lineBreakToSpace?: boolean;
// };

// type SidTextMapState = {
//     lastSid?: string;
// };

/**
 * Serializes nodes into a map where each key is a Scripture ID (e.g., "MAT 1:1")
 * and the value is ONLY the plain text content, with all markers stripped out.
 * @param nodes - The array of serialized nodes.
 * @param options - Configuration options for the output.
 * @returns A Record mapping SIDs to their plain text content.
 */
// function serializeToSidTextMap(
//   nodes: SerializedLexicalNode[],
//   options: SidTextMapOptions = {}
// ): Record<string, string> {
//   const accumulator: Record<string, string> = {};
//   const state: SidTextMapState = {};
//   traverseForSidTextMap(nodes, options, accumulator, state);
//   return accumulator;
// }

// function traverseForSidTextMap(
//   nodes: SerializedLexicalNode[],
//   options: SidTextMapOptions,
//   accumulator: Record<string, string>,
//   state: SidTextMapState
// ): void {
//   for (const node of nodes) {
//     if (node.type === "linebreak") {
//       if (state.lastSid) {
//         const content = options.lineBreakToSpace ? " " : "\n";
//         if (content !== " " || !accumulator[state.lastSid]?.endsWith(" ")) {
//           accumulator[state.lastSid] =
//             (accumulator[state.lastSid] || "") + content;
//         }
//       }
//       continue;
//     }

//     if (isSerializedPlainTextUSFMTextNode(node) && node.sid) {
//       // Only include plain text nodes, effectively stripping markers.
//       accumulator[node.sid] = (accumulator[node.sid] || "") + node.text;
//       state.lastSid = node.sid;
//       continue;
//     }

//     if (isSerializedUSFMNestedEditorNode(node)) {
//       if (!options.ignoreFootnotes) {
//         // If not ignoring, process the content but not the markers.
//         traverseForSidTextMap(
//           node.editorState.root.children,
//           options,
//           accumulator,
//           state
//         );
//       }
//       continue;
//     }

//     if (isSerializedParagraphNode(node) && node.children) {
//       traverseForSidTextMap(node.children, options, accumulator, state);
//     }
//   }
// }

//================================================================================
// Function 3: Build the rich, contextual map for reversion (CORRECTED)
//================================================================================
export type SidContent = {
    /** The nodes that make up the content of this block. For a verse, it's the top-level
     *  nodes. For a footnote, it's the nodes INSIDE the footnote's editorState. */
    nodes: SerializedLexicalNode[];

    /** The parent array that `nodes` belongs to. This is the array to splice for
     *  INTERNAL content changes. */
    parentChapterNodeList: SerializedLexicalNode[];

    /** The starting index of the first node of this block within its parent list. */
    startIndexInParent: number;

    /** The unique key of the immediately preceding block, used as a revert anchor. */
    previousSid: string | null;

    /** The original, semantic SID for this block (e.g., "GEN 9:2"). */
    semanticSid: string;

    /** A UI-friendly version of the SID, especially for nested content. */
    displaySid: string;

    /** A "signature" of the structural USFM markers. */
    usfmStructure: string;

    /** ONLY the plain, user-visible text content for this block. */
    plainTextStructure: string;

    /** The full USFM text for this block, including all markers. */
    fullText: string;

    /** If this is a nested block (like a footnote), this is the wrapper node itself. */
    wrapperNode?: USFMNestedEditorNodeJSON;

    /** The parent list of the wrapper node (i.e., the chapter's root.children). */
    wrapperParentList?: SerializedLexicalNode[];

    /** The index of the wrapper node within its parent list. */
    wrapperStartIndex?: number;

    /** A zero-based index representing the order in which this block was found in the document. */
    foundOrder: number;

    detail?: string;
};

export type SidContentMap = Record<string, SidContent>; // The key is the unique, mangled SID.

//==================================================================
// 2. Helper Functions
//===============================================================

/**
 * Extracts the different text components from a single serialized node.
 */
function getTextComponentsFromNode(node: SerializedLexicalNode): {
    usfm: string;
    plain: string;
    full: string;
} {
    const text =
        "text" in node && typeof node.text === "string"
            ? node.text
            : node.type === "linebreak"
              ? "\n"
              : "";
    if (node.type === "linebreak") {
        return { usfm: "\n", plain: "\n", full: "\n" };
    }
    if (isSerializedNumberOrPlainTextUSFMTextNode(node)) {
        return { usfm: "", plain: text, full: text };
    }
    if (isSerializedUSFMTextNode(node)) {
        return { usfm: text, plain: "", full: text };
    }
    // Generic elements have no direct text value.
    return { usfm: "", plain: "", full: "" };
}

/**
 * Extracts and serializes the text components from an array of nodes,
 * optionally wrapping them with USFM markers (for footnotes).
 */
function extractTextComponents(
    nodes: SerializedLexicalNode[],
    marker?: string,
): { usfmStructure: string; plainTextStructure: string; fullText: string } {
    let usfmStructure = marker ? `\\${marker} ` : "";
    let plainTextStructure = "";
    let fullText = marker ? `\\${marker} ` : "";

    for (const node of walkNodes(nodes)) {
        const components = getTextComponentsFromNode(node);
        usfmStructure += components.usfm;
        plainTextStructure += components.plain;
        fullText += components.full;
    }

    return { usfmStructure, plainTextStructure, fullText };
}

/**
 * Processes a chapter's node list into a rich, contextual SidContentMap.
 * This is the definitive, single-pass, non-recursive implementation that correctly handles
 * duplicate SIDs, interruptions by nested content (e.g., footnotes), and makes
 * every semantic block independently revertable.
 *
 * @param chapterNodeList The `root.children` array from a chapter's lexical state.
 */
type BuildState = {
    activeVerseKey: string | null;
    activeFootnoteKey: string | null;
    activeFootnoteMarker: string | null;
    previousBlockKey: string | null;
    duplicateSidCounters: Map<string, number>;
    footnoteCounters: Map<string, number>;
    blockCounter: number;
    map: SidContentMap;
};

/**
 * Processes a chapter's node list into a rich, contextual SidContentMap.
 * This implementation correctly handles duplicate SIDs, nested elements (paragraphs),
 * and supports both structured and flattened (Source Mode) footnotes.
 *
 * @param chapterNodeList The `root.children` array from a chapter's lexical state.
 */
export function buildSidContentMapForChapter(
    chapterNodeList: SerializedLexicalNode[],
    _map?: SidContentMap,
): SidContentMap {
    const state: BuildState = {
        activeVerseKey: null,
        activeFootnoteKey: null,
        activeFootnoteMarker: null,
        previousBlockKey: null,
        duplicateSidCounters: new Map<string, number>(),
        footnoteCounters: new Map<string, number>(),
        blockCounter: 0,
        map: _map || {},
    };

    function traverse(
        nodes: SerializedLexicalNode[],
        parentList: SerializedLexicalNode[],
    ) {
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];

            // --- Case 0: Handle ongoing capture of flattened footnote ---
            if (state.activeFootnoteKey) {
                const block = state.map[state.activeFootnoteKey];

                // Stop capturing if we hit the footnote's own end marker or a new verse marker (implied by new SID)
                const isFootnoteEndMarker =
                    isSerializedUSFMTextNode(node) &&
                    node.tokenType === UsfmTokenTypes.endMarker &&
                    (node.marker === state.activeFootnoteMarker ||
                        node.text?.trim() ===
                            `\\${state.activeFootnoteMarker}*`);

                const isNewVerse =
                    isSerializedUSFMTextNode(node) &&
                    (node.sid !== block.semanticSid ||
                        (node.tokenType === UsfmTokenTypes.marker &&
                            node.marker === "v"));

                if (isNewVerse) {
                    state.activeFootnoteKey = null;
                    state.activeFootnoteMarker = null;
                    i--; // Re-process this node in the normal flow
                    continue;
                }

                // Node belongs to footnote
                block.nodes.push(node);
                const { usfm, plain, full } = getTextComponentsFromNode(node);
                block.usfmStructure += usfm;
                block.plainTextStructure += plain;
                block.fullText += full;

                if (isFootnoteEndMarker) {
                    state.activeFootnoteKey = null;
                    state.activeFootnoteMarker = null;
                }
                continue;
            }

            // --- Case 1: Handle Footnotes (as new, distinct blocks) ---
            // Structured Case (WYSIWYG)
            if (isSerializedUSFMNestedEditorNode(node)) {
                const parentSid = state.activeVerseKey
                    ? state.map[state.activeVerseKey].semanticSid
                    : "ORPHAN_NOTE";
                const footnoteCount =
                    (state.footnoteCounters.get(parentSid) || 0) + 1;
                state.footnoteCounters.set(parentSid, footnoteCount);
                const footnoteKey = `${parentSid}_${node.marker}_${footnoteCount}`;
                const footnoteChildren = node.editorState.root.children;

                state.map[footnoteKey] = {
                    nodes: footnoteChildren,
                    parentChapterNodeList: footnoteChildren,
                    startIndexInParent: 0,
                    previousSid: state.previousBlockKey,
                    semanticSid: parentSid,
                    displaySid: `${parentSid} (${node.marker} note)`,
                    ...extractTextComponents(footnoteChildren, node.marker),
                    wrapperNode: node,
                    wrapperParentList: parentList,
                    wrapperStartIndex: i,
                    foundOrder: state.blockCounter,
                };

                state.previousBlockKey = footnoteKey;
                state.blockCounter++;
                continue;
            }

            // Flattened Case (Source Mode)
            if (
                isSerializedUSFMTextNode(node) &&
                node.tokenType === UsfmTokenTypes.marker &&
                nestedEditorMarkers.has(node.marker || "")
            ) {
                const parentSid = state.activeVerseKey
                    ? state.map[state.activeVerseKey].semanticSid
                    : "ORPHAN_NOTE";
                const footnoteCount =
                    (state.footnoteCounters.get(parentSid) || 0) + 1;
                state.footnoteCounters.set(parentSid, footnoteCount);
                const footnoteKey = `${parentSid}_${node.marker}_${footnoteCount}`;

                state.map[footnoteKey] = {
                    nodes: [node],
                    parentChapterNodeList: parentList,
                    startIndexInParent: i,
                    previousSid: state.previousBlockKey,
                    semanticSid: parentSid,
                    displaySid: `${parentSid} (${node.marker} note)`,
                    usfmStructure: "",
                    plainTextStructure: "",
                    fullText: "",
                    foundOrder: state.blockCounter,
                };
                const { usfm, plain, full } = getTextComponentsFromNode(node);
                state.map[footnoteKey].usfmStructure += usfm;
                state.map[footnoteKey].plainTextStructure += plain;
                state.map[footnoteKey].fullText += full;

                state.activeFootnoteKey = footnoteKey;
                state.activeFootnoteMarker = node.marker || null;
                state.previousBlockKey = footnoteKey;
                state.blockCounter++;
                continue;
            }

            // --- Case 2: Handle Regular USFM Text and Verse Nodes ---
            if (isSerializedUSFMTextNode(node) && node.sid) {
                const semanticSid = node.sid;
                if (
                    !state.activeVerseKey ||
                    state.map[state.activeVerseKey].semanticSid !== semanticSid
                ) {
                    let uniqueKey: string = semanticSid;
                    if (state.map[uniqueKey]) {
                        const count =
                            (state.duplicateSidCounters.get(semanticSid) || 0) +
                            1;
                        state.duplicateSidCounters.set(semanticSid, count);
                        uniqueKey = `${semanticSid}_dup_${count}`;
                    }
                    state.activeVerseKey = uniqueKey;

                    // Out-of-order detection
                    let detail: string | undefined;
                    if (state.previousBlockKey) {
                        const prevBlock = state.map[state.previousBlockKey];
                        const prevSidParsed = parseSid(prevBlock.semanticSid);
                        const currentSidParsed = parseSid(semanticSid);

                        if (
                            prevSidParsed &&
                            !prevSidParsed.isBookChapOnly &&
                            currentSidParsed &&
                            !currentSidParsed.isBookChapOnly &&
                            prevSidParsed.chapter === currentSidParsed.chapter
                        ) {
                            const expectedVerse = prevSidParsed.verseEnd + 1;
                            if (currentSidParsed.verseStart !== expectedVerse) {
                                detail = `Out of order (expected v. ${expectedVerse})`;
                            }
                        }
                    }

                    state.map[state.activeVerseKey] = {
                        nodes: [],
                        parentChapterNodeList: parentList,
                        startIndexInParent: i,
                        previousSid: state.previousBlockKey,
                        semanticSid: semanticSid,
                        displaySid: semanticSid,
                        usfmStructure: "",
                        plainTextStructure: "",
                        fullText: "",
                        foundOrder: state.blockCounter,
                        detail,
                    };
                    state.blockCounter++;
                    state.previousBlockKey = state.activeVerseKey;
                }

                const block = state.map[state.activeVerseKey];
                block.nodes.push(node);
                const { usfm, plain, full } = getTextComponentsFromNode(node);
                block.usfmStructure += usfm;
                block.plainTextStructure += plain;
                block.fullText += full;
                continue;
            }

            // --- Case 3: Recursion into Paragraph Nodes ---
            if (isSerializedParagraphNode(node) && node.children) {
                traverse(node.children, node.children);
                continue;
            }

            // --- Case 4: Handle Follower Nodes (e.g., Line Breaks) ---
            if (state.activeVerseKey) {
                const block = state.map[state.activeVerseKey];
                block.nodes.push(node);
                const { usfm, plain, full } = getTextComponentsFromNode(node);
                block.usfmStructure += usfm;
                block.plainTextStructure += plain;
                block.fullText += full;
            }
        }
    }

    traverse(chapterNodeList, chapterNodeList);
    return state.map;
}

/**
 * Processes a single chapter's node list into a rich, contextual map (SidContentMap)
 * ideal for performing state reversions. This version correctly handles ALL node types.
 * @param chapterNodeList - The `root.children` array from a chapter's lexical state.
 */
// export function buildSidContentMapForChapter(
//   chapterNodeList: SerializedLexicalNode[],
//   _map?: SidContentMap,
//   _recursiveSid?: string,
//   _prevMapKey?: string,
// ): SidContentMap {
//   const map: SidContentMap = _map || {};
//   let currentMapKey: string | null = null; // This will be our unique key.
//   let previousMapKey: string | null = _prevMapKey || null;

//   // State to track and handle duplicates.
//   const seenSids = new Set<string>();
//   const duplicateCounters = new Map<string, number>();

//   for (let i = 0; i < chapterNodeList.length; i++) {
//     const node = chapterNodeList[i];

//     if (isSerializedUSFMTextNode(node) && node.sid) {
//       const semanticSid = _recursiveSid || node.sid;

//       // Condition to check if this node marks the beginning of a NEW block.
//       // This is true if it's the first SID we've seen, or if the SID changes.
//       if (
//         !currentMapKey ||
//         (map[currentMapKey] && map[currentMapKey].semanticSid !== semanticSid)
//       ) {
//         previousMapKey = currentMapKey;

//         let uniqueKey: string = semanticSid;

//         // --- DUPLICATE HANDLING LOGIC ---
//         // if previous was a note, then we don't want to count it as a duplicate to support use case of \v 1 stuff \f note \f* end verse.
//         if (seenSids.has(semanticSid) && !previousMapKey?.includes("note")) {
//           // We've seen this SID before, it's a duplicate.
//           const count = (duplicateCounters.get(semanticSid) || 0) + 1;
//           duplicateCounters.set(semanticSid, count);
//           uniqueKey = `${semanticSid}_dup_${count}`; // Create the mangled key.
//         } else {
//           // First time seeing this SID.
//           seenSids.add(semanticSid);
//         }

//         currentMapKey = uniqueKey;

//         map[currentMapKey] = {
//           nodes: [],
//           parentChapterNodeList: chapterNodeList,
//           startIndexInParent: i,
//           previousSid: previousMapKey, // Use the previous unique key as the anchor
//           semanticSid: semanticSid, // Store the original, clean SID
//           usfmStructure: "",
//           plainTextStructure: "",
//           fullText: "",
//         };
//       }
//     }

//     // Associate the current node with the active SID block using its unique key.
//     if (currentMapKey) {
//       map[currentMapKey].nodes.push(node);

//       // Accumulate a simple text representation for diffing purposes.
//       // This can be expanded if footnotes need to be handled differently.
//       if (node.type === "linebreak") {
//         map[currentMapKey].fullText += "\n";
//         map[currentMapKey].plainTextStructure += "\n";
//       } else if (isSerializedUSFMTextNode(node)) {
//         const isForUsfm = TOKEN_TYPES_CAN_TOGGLE_HIDE.has(node.tokenType ?? "");
//         const isForPlainText =
//           node.tokenType === UsfmTokenTypes.numberRange ||
//           node.tokenType === UsfmTokenTypes.text;
//         if (isForPlainText) {
//           map[currentMapKey].plainTextStructure += node.text ?? "";
//         } else if (isForUsfm) {
//           map[currentMapKey].usfmStructure += node.text ?? "";
//         }
//         // regardles add to full text
//         map[currentMapKey].fullText += node.text ?? "";
//       } else if (isSerializedUSFMNestedEditorNode(node)) {
//         // sid should be the same on each node in there, so the plainText will fill out. We have this one manual step here of putting the open and close markers in the usfmStructure and full text though:
//         const nestedOpen = `\\${node.marker}`;
//         if (!node.sid) {
//           console.error("Missing SID on nested node");
//           break
//         }
//         previousMapKey = currentMapKey;
//         currentMapKey = `${currentMapKey}_note_${i}`;
//         map[currentMapKey] = {
//           nodes: [],
//           parentChapterNodeList: chapterNodeList,
//           startIndexInParent: i,
//           previousSid: previousMapKey, // Use the previous unique key as the anchor
//           semanticSid: node.sid, // Store the original, clean SID
//           usfmStructure: "",
//           plainTextStructure: "",
//           fullText: "",
//         };
//         map[currentMapKey].usfmStructure += nestedOpen;
//         map[currentMapKey].fullText += nestedOpen;
//         ;
//         buildSidContentMapForChapter(
//           node.editorState.root.children,
//           map,
//           currentMapKey,
//         );
//         const nestedClose = `\\${node.marker}*`;
//         map[currentMapKey].usfmStructure += nestedClose;
//         map[currentMapKey].fullText += nestedClose;
//       }
//     }
//     // only a contaienr (root paragraph element for example), just recurse in
//     if (isSerializedParagraphNode(node) && node.children) {
//       buildSidContentMapForChapter(node.children, map, _recursiveSid);
//     }
//   }
//   return map;
// }
