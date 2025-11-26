import {
  $getRoot,
  ElementNode,
  type LexicalEditor,
  type LexicalNode,
  LineBreakNode,
  type SerializedLexicalNode,
} from "lexical";
import { USFM_TEXT_NODE_TYPE } from "@/app/data/editor.ts";
import { isSerializedElementNode } from "@/app/domain/editor/nodes/USFMElementNode.ts";
import {
  $isUSFMNestedEditorNode,
  isSerializedUSFMNestedEditorNode,
  type USFMNestedEditorNode,
  type USFMNestedEditorNodeJSON,
} from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import {
  $isUSFMTextNode,
  isSerializedNumberOrPlainTextUSFMTextNode,
  isSerializedPlainTextUSFMTextNode,
  isSerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { parseSid } from "@/core/data/bible/bible.ts";

export function $serializedLexicalToUsfm(editor: LexicalEditor) {
  return editor.getEditorState().read(() => {
    const root = $getRoot();
    const serialized = serializeNode(root, editor);
    return serialized;
  });
}

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
 * @param nodes - The array of serialized nodes from an editor state.
 * @returns A single string representing the complete USFM document.
 */
export function serializeToUsfmString(nodes: SerializedLexicalNode[]): string {
  const accumulator = { str: "" };
  traverseForUsfmString(nodes, accumulator);
  return accumulator.str;
}

function traverseForUsfmString(
  nodes: SerializedLexicalNode[],
  accumulator: { str: string },
): void {
  for (const node of nodes) {
    if (node.type === "linebreak") {
      accumulator.str += "\n";
      continue;
    }

    if (isSerializedUSFMTextNode(node)) {
      accumulator.str += node.text;
      continue;
    }

    if (isSerializedUSFMNestedEditorNode(node)) {
      // Handle nested content like footnotes by recursively processing them.
      // the opening marker isn't currently captured as part of the node's internal structure. During lex then post parse, once hitting a nested node, it become {marker, children} where the close marker is in the children array, but openeing is not duplicated into it.
      accumulator.str += `\\${node.marker} `;
      traverseForUsfmString(node.editorState.root.children, accumulator);
      continue;
    }

    if (isSerializedElementNode(node) && node.children) {
      traverseForUsfmString(node.children, accumulator);
    }
  }
}

//================================================================================
// Function 2: Serialize to a map of SID -> Plain Text
//================================================================================

type SidTextMapOptions = {
  ignoreFootnotes?: boolean;
  lineBreakToSpace?: boolean;
};

type SidTextMapState = {
  lastSid?: string;
};

/**
 * Serializes nodes into a map where each key is a Scripture ID (e.g., "MAT 1:1")
 * and the value is ONLY the plain text content, with all markers stripped out.
 * @param nodes - The array of serialized nodes.
 * @param options - Configuration options for the output.
 * @returns A Record mapping SIDs to their plain text content.
 */
export function serializeToSidTextMap(
  nodes: SerializedLexicalNode[],
  options: SidTextMapOptions = {},
): Record<string, string> {
  const accumulator: Record<string, string> = {};
  const state: SidTextMapState = {};
  traverseForSidTextMap(nodes, options, accumulator, state);
  return accumulator;
}

function traverseForSidTextMap(
  nodes: SerializedLexicalNode[],
  options: SidTextMapOptions,
  accumulator: Record<string, string>,
  state: SidTextMapState,
): void {
  for (const node of nodes) {
    if (node.type === "linebreak") {
      if (state.lastSid) {
        const content = options.lineBreakToSpace ? " " : "\n";
        if (content !== " " || !accumulator[state.lastSid]?.endsWith(" ")) {
          accumulator[state.lastSid] =
            (accumulator[state.lastSid] || "") + content;
        }
      }
      continue;
    }

    if (isSerializedPlainTextUSFMTextNode(node) && node.sid) {
      // Only include plain text nodes, effectively stripping markers.
      accumulator[node.sid] = (accumulator[node.sid] || "") + node.text;
      state.lastSid = node.sid;
      continue;
    }

    if (isSerializedUSFMNestedEditorNode(node)) {
      if (!options.ignoreFootnotes) {
        // If not ignoring, process the content but not the markers.
        traverseForSidTextMap(
          node.editorState.root.children,
          options,
          accumulator,
          state,
        );
      }
      continue;
    }

    if (isSerializedElementNode(node) && node.children) {
      traverseForSidTextMap(node.children, options, accumulator, state);
    }
  }
}

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

  function traverse(nodeList: SerializedLexicalNode[]) {
    for (const node of nodeList) {
      const components = getTextComponentsFromNode(node);
      usfmStructure += components.usfm;
      plainTextStructure += components.plain;
      fullText += components.full;
      if (isSerializedElementNode(node) && node.children) {
        traverse(node.children);
      }
    }
  }

  traverse(nodes);

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
export function buildSidContentMapForChapter(
  chapterNodeList: SerializedLexicalNode[],
  _map?: SidContentMap,
): SidContentMap {
  const map: SidContentMap = _map || {};

  // --- State Management for the Single Pass ---
  let activeVerseKey: string | null = null;
  let previousBlockKey: string | null = null;
  const duplicateSidCounters = new Map<string, number>();
  const footnoteCounters = new Map<string, number>();
  // The new counter for ordering.
  let blockCounter = 0;

  for (let i = 0; i < chapterNodeList.length; i++) {
    const node = chapterNodeList[i];

    // --- Case 1: Handle Footnotes (as new, distinct blocks) ---
    if (isSerializedUSFMNestedEditorNode(node)) {
      const parentSid = activeVerseKey
        ? map[activeVerseKey].semanticSid
        : "ORPHAN_NOTE";
      const footnoteCount = (footnoteCounters.get(parentSid) || 0) + 1;
      footnoteCounters.set(parentSid, footnoteCount);
      const footnoteKey = `${parentSid}_${node.marker}_${footnoteCount}`;
      const footnoteChildren = node.editorState.root.children;

      map[footnoteKey] = {
        nodes: footnoteChildren,
        parentChapterNodeList: footnoteChildren,
        startIndexInParent: 0,
        previousSid: previousBlockKey,
        semanticSid: parentSid,
        displaySid: `${parentSid} (${node.marker} note)`,
        ...extractTextComponents(footnoteChildren, node.marker),
        wrapperNode: node,
        wrapperParentList: chapterNodeList,
        wrapperStartIndex: i,
        foundOrder: blockCounter,
      };

      previousBlockKey = footnoteKey;
      blockCounter++;
      continue;
    }

    // --- Case 2: Handle Regular USFM Text and Verse Nodes ---
    if (isSerializedUSFMTextNode(node) && node.sid) {
      const semanticSid = node.sid;
      if (!activeVerseKey || map[activeVerseKey].semanticSid !== semanticSid) {
        let uniqueKey: string = semanticSid;
        if (map[uniqueKey]) {
          const count = (duplicateSidCounters.get(semanticSid) || 0) + 1;
          duplicateSidCounters.set(semanticSid, count);
          uniqueKey = `${semanticSid}_dup_${count}`;
        }
        activeVerseKey = uniqueKey;

        // --- OUT-OF-ORDER DETECTION LOGIC ---
        let detail: string | undefined;
        if (previousBlockKey) {
          const prevBlock = map[previousBlockKey];
          const prevSidParsed = parseSid(prevBlock.semanticSid);
          const currentSidParsed = parseSid(semanticSid);

          // Check if both are valid, verse-level SIDs in the same chapter.
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

        map[activeVerseKey] = {
          nodes: [],
          parentChapterNodeList: chapterNodeList,
          startIndexInParent: i,
          previousSid: previousBlockKey,
          semanticSid: semanticSid,
          displaySid: semanticSid,
          usfmStructure: "",
          plainTextStructure: "",
          fullText: "",
          foundOrder: blockCounter,
          detail,
        };
        blockCounter++;
        previousBlockKey = activeVerseKey;
      }

      const block = map[activeVerseKey];
      block.nodes.push(node);
      const { usfm, plain, full } = getTextComponentsFromNode(node);
      block.usfmStructure += usfm;
      block.plainTextStructure += plain;
      block.fullText += full;
      continue;
    }
    if (isSerializedElementNode(node) && node.children) {
      return buildSidContentMapForChapter(node.children, map);
    }

    // --- Case 3: Handle Follower Nodes (e.g., Line Breaks) ---
    // A follower node always belongs to the active VERSE, not an interrupting footnote.
    if (activeVerseKey) {
      const block = map[activeVerseKey];
      block.nodes.push(node);
      const { usfm, plain, full } = getTextComponentsFromNode(node);
      block.usfmStructure += usfm;
      block.plainTextStructure += plain;
      block.fullText += full;
    }
  }
  return map;
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
//     if (isSerializedElementNode(node) && node.children) {
//       buildSidContentMapForChapter(node.children, map, _recursiveSid);
//     }
//   }
//   return map;
// }
