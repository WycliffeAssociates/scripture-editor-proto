import {
  $getRoot,
  ElementNode,
  type LexicalEditor,
  type LexicalNode,
  LineBreakNode,
  type SerializedLexicalNode,
} from "lexical";
import {USFM_TEXT_NODE_TYPE} from "@/app/data/editor";
import {isSerializedElementNode} from "@/app/domain/editor/nodes/USFMElementNode";
import {
  $isUSFMNestedEditorNode,
  isSerializedUSFMNestedEditorNode,
  type USFMNestedEditorNode,
} from "@/app/domain/editor/nodes/USFMNestedEditorNode";
import {
  $isUSFMTextNode,
  isSerializedPlainTextUSFMTextNode,
  isSerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode";

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
  editor: LexicalEditor
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
  const accumulator = {str: ""};
  traverseForUsfmString(nodes, accumulator);
  return accumulator.str;
}

function traverseForUsfmString(
  nodes: SerializedLexicalNode[],
  accumulator: {str: string}
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
      accumulator.str += `\\${node.marker} `;
      traverseForUsfmString(node.editorState.root.children, accumulator);
      accumulator.str += `\\${node.marker}*`;
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
  options: SidTextMapOptions = {}
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
  state: SidTextMapState
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
          state
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
  nodes: SerializedLexicalNode[];
  parentChapterNodeList: SerializedLexicalNode[];
  startIndexInParent: number;
  previousSid: string | null;
  text: string; // The full USFM text for this block, for diffing
};

export type SidContentMap = Record<string, SidContent>;

/**
 * Processes a single chapter's node list into a rich, contextual map (SidContentMap)
 * ideal for performing state reversions. This version correctly handles ALL node types.
 * @param chapterNodeList - The `root.children` array from a chapter's lexical state.
 */
export function buildSidContentMapForChapter(
  chapterNodeList: SerializedLexicalNode[],
  _map?: SidContentMap
): SidContentMap {
  const map: SidContentMap = _map || {};
  let currentSid: string | null = null;
  let previousSid: string | null = null;

  for (let i = 0; i < chapterNodeList.length; i++) {
    const node = chapterNodeList[i];

    // Condition to check if this node marks the beginning of a NEW SID block.
    if (isSerializedUSFMTextNode(node) && node.sid && node.sid !== currentSid) {
      previousSid = currentSid; // The one we just finished is the anchor for this new one.
      currentSid = node.sid;

      map[currentSid] = {
        nodes: [],
        text: "",
        parentChapterNodeList: chapterNodeList,
        startIndexInParent: i,
        previousSid: previousSid,
      };
    }

    // Associate the current node with the active SID block.
    // This is the crucial logic that prevents dropping SID-less nodes.
    if (currentSid) {
      map[currentSid].nodes.push(node);

      // Accumulate a simple text representation for diffing purposes.
      // This can be expanded if footnotes need to be handled differently.
      if (node.type === "linebreak") {
        map[currentSid].text += "\n";
      } else if (isSerializedUSFMTextNode(node)) {
        map[currentSid].text += node.text ?? "";
      } else if (isSerializedUSFMNestedEditorNode(node)) {
        // For simplicity in diffing, represent the entire footnote block.
        const nestedText = serializeToUsfmString(
          node.editorState.root.children
        );
        map[
          currentSid
        ].text += `\\${node.marker} ${nestedText} \\${node.marker}*`;
      }
    }
    if (isSerializedElementNode(node) && node.children) {
      buildSidContentMapForChapter(node.children, map);
    }
  }

  return map;
}
