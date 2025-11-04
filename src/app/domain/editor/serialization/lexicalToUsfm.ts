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
import {parseSid} from "@/core/data/bible/bible";

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

/**
 * Configuration for the serialization process.
 */
type SerializeOptions = {
  // The desired output format.
  mode: "usfmString" | "sidUsfmMap" | "sidTextMap";
  // If true, nested editors (e.g., footnotes) are skipped.
  ignoreFootnotes?: boolean;
  // In 'sidTextMap' mode, if true, converts line breaks to spaces.
  lineBreakToSpace?: boolean;
  includeVerseSidsOnly?: boolean;
};

/**
 * Internal state used during the recursive traversal.
 */
type TraversalState = {
  // Tracks the last seen Scripture ID to correctly associate content.
  lastSid?: string;
};

/**
 * The core recursive engine for processing an array of serialized nodes.
 * @param nodes - The array of nodes to process.
 * @param options - The configuration determining the output format and behavior.
 * @param accumulator - The object being built (either a string or a Record).
 * @param state - The internal state for the traversal (e.g., lastSid).
 */
export function processSerializedNodes<
  T extends Record<string, string> | {str: string}
>(
  nodes: SerializedLexicalNode[],
  options: SerializeOptions,
  accumulator: T,
  state: TraversalState = {}
): T {
  for (const node of nodes) {
    // --- Handle Line Breaks ---
    if (node.type === "linebreak") {
      if (options.mode === "usfmString") {
        (accumulator as {str: string}).str += "\n";
      } else if (state.lastSid) {
        const map = accumulator as Record<string, string>;
        const content = options.lineBreakToSpace ? " " : "\n";
        // Avoid adding multiple spaces
        if (content === " " && map[state.lastSid]?.endsWith(" ")) continue;
        map[state.lastSid] = (map[state.lastSid] || "") + content;
      }
      continue;
    }

    // --- Handle USFM Text Nodes (Markers, Text, Verses) ---
    if (isSerializedUSFMTextNode(node) && node.sid) {
      let textToAppend = "";
      // in text only mode, filter out book/chapter/metadata only sids
      if (options.mode === "sidTextMap") {
        const sidParsed = parseSid(node.sid);
        // in verse only, filter out usfm
        if (options.includeVerseSidsOnly) {
          const doAdd = sidParsed && !sidParsed.isBookChapOnly;
          if (isSerializedPlainTextUSFMTextNode(node) && doAdd) {
            textToAppend = node.text.trimStart();
          }
        } else {
          textToAppend = node.text;
        }
      } else {
        // In USFM modes, include all content from the node.
        textToAppend = node.text;
      }

      if (textToAppend) {
        if (options.mode === "usfmString") {
          (accumulator as {str: string}).str += textToAppend;
        } else if (node.sid) {
          const map = accumulator as Record<string, string>;
          map[node.sid] = (map[node.sid] || "") + textToAppend;
          state.lastSid = node.sid;
        }
      }
    }

    // --- Handle Nested Editors (Footnotes, Cross-references) ---
    if (isSerializedUSFMNestedEditorNode(node)) {
      if (options.mode === "usfmString") {
        accumulator.str += `\\${node.marker} `;
        processSerializedNodes(
          node.editorState.root.children,
          options,
          accumulator,
          state
        );
        accumulator.str += `\\${node.marker}*`;
        return accumulator;
      } else if (options.mode === "sidTextMap") {
        // usfmTextMap or sidTextMap
        if (options.ignoreFootnotes && state.lastSid) {
          // insert a space to separate the text from ellided footnote
          (accumulator as Record<string, string>)[state.lastSid] = `${
            (accumulator as Record<string, string>)[state.lastSid] || ""
          } `;
        }
      } else if (options.mode === "sidUsfmMap" && state.lastSid) {
        (accumulator as Record<string, string>)[
          state.lastSid
        ] = `\\${node.marker} `;
        processSerializedNodes(
          node.editorState.root.children,
          options,
          accumulator,
          state
        );
        (accumulator as Record<string, string>)[
          state.lastSid
        ] += `\\${node.marker}*`;
        return accumulator;
      }
    }
    // --- Handle Element Nodes (e.g., 'paragraph') by recursing through children ---
    if (isSerializedElementNode(node) && node.children) {
      processSerializedNodes(node.children, options, accumulator, state);
    }
  }
  return accumulator;
}
