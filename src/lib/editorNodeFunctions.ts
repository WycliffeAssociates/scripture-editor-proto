import {
    $getNodeByKey,
    $getRoot,
    $getSelection,
    $isRangeSelection,
    $isTextNode,
    EditorState,
    ElementNode,
    LexicalEditor,
    LexicalNode,
    LineBreakNode,
    SerializedEditorState,
    SerializedLexicalNode,
    TextNode,
} from "lexical";
import { ParsedFile } from "@/customTypes/types";
import { nodeIsUsfmElementNode } from "@/features/editor/nodes/USFMElementNode";
import {
    USFM_DECORATOR_TYPE,
    USFMDecoratorNode,
} from "@/features/editor/nodes/USFMMarkerDecoratorNode";
import {
    $isUSFMNestedEditorNode,
    getChildrenFromNestedEditorNode,
    USFM_NESTED_DECORATOR_TYPE,
    USFMNestedEditorNode,
} from "@/features/editor/nodes/USFMNestedEditorDecorator";
import {
    isSerializedUSFMTextNode,
    USFMTextNode,
} from "@/features/editor/nodes/USFMTextNode";
import { tokensExpectingClose } from "./lex";
import { parseUSFM } from "./parse";

export function moveDecoratorNode(editor: LexicalEditor, nodeKey: string) {
    editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (!node) return;

        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        const anchorNode = selection.anchor.getNode();
        const offset = selection.anchor.offset;

        // Remove decorator from old position
        node.remove();

        if ($isTextNode(anchorNode)) {
            // Split text node at cursor
            const [left, right] = anchorNode.splitText(offset);

            // Insert decorator between left and right
            left.insertAfter(node);
        } else {
            // Fallback for non-text nodes
            anchorNode.getParentOrThrow().insertAfter(node, false);
        }
    });
}
// export function moveDecoratorNode(editor: LexicalEditor, nodeKey: string) {
//   editor.update(() => {
//     const node = $getNodeByKey(nodeKey);
//     if (!node) return;

//     const selection = $getSelection();
//     if (!$isRangeSelection(selection)) return;

//     const anchorNode = selection.anchor.getNode();
//     const offset = selection.anchor.offset;

//     node.remove(); // remove decorator from old spot

//     if ($isTextNode(anchorNode)) {
//       const [left, right] = anchorNode.splitText(offset);

//       // Determine drag direction
//       const isForward = node.getKey() > anchorNode.getKey();

//       if (isForward) {
//         // Moving forward: prepend left-over text to next text node
//         const nextText = right.getNextSibling();
//         if ($isTextNode(nextText)) {
//           nextText.setTextContent(
//             right.getTextContent() + nextText.getTextContent()
//           );
//           right.remove();
//         }
//         // Insert decorator before next text node
//         left.insertAfter(node);
//       } else {
//         // Moving backward: append left-over text to previous text node
//         const prevText = left.getPreviousSibling();
//         if ($isTextNode(prevText)) {
//           prevText.setTextContent(
//             prevText.getTextContent() + left.getTextContent()
//           );
//           left.remove();
//         }
//         // Insert decorator after previous text node
//         prevText?.insertAfter(node);
//       }
//     } else {
//       // fallback for non-text nodes
//       anchorNode.getParentOrThrow().insertAfter(node, false);
//     }
//   });
// }

// Converts Lexical editor state to USFM string
export function lexicalToUSFM(editor: LexicalEditor): string {
    return editor.getEditorState().read(() => {
        const root = $getRoot();
        const serialized = serializeNode(root, editor);
        console.log(serialized);
        return serialized;
    });
}

function serializeNode(node: LexicalNode, editor: LexicalEditor): string {
    const nodeType = node.getType();

    if ($isUSFMNestedEditorNode(node)) {
        // what to
        const editorState = editor.parseEditorState(node.__editorState);
        let nestedVal = `\\${node.getMarker()} `;
        editorState.read(() => {
            const nestedRoot = $getRoot();
            nestedVal += nestedRoot
                .getChildren()
                .map((c) => serializeNode(c, editor))
                .join("");
            nestedVal += `\\${node.getMarker()}*`;
            console.log(nestedVal);
            return nestedVal;
        });
        return nestedVal;
    }

    // USFM text node
    if (nodeType === "usfm-text") {
        const n = node as USFMTextNode; // instance type
        const options = n.getOptions?.() ?? {};
        const marker = options.marker ?? "";
        const text = n.getTextContent?.() ?? "";
        const attrs = options.attributes ?? {};
        let attrString = "";

        const attrKeys = Object.keys(attrs);
        if (attrKeys.length) {
            const pairs = attrKeys.map((k) => `${k}="${attrs[k]}"`);
            attrString = `|${pairs.join(",")}`;
        }

        return marker ? `\\${marker} ${text}${attrString}` : text;
    }

    // USFM decorator node
    if (nodeType === USFM_DECORATOR_TYPE) {
        // Cast to **instance type**, not constructor
        const n = node as USFMDecoratorNode;
        const options = n.getOptions?.() ?? {};
        const marker = options.marker ?? "";
        const text = options.text ?? "";
        const attrs = options.attributes ?? {};
        let attrString = "";

        const attrKeys = Object.keys(attrs);
        if (attrKeys.length) {
            const pairs = attrKeys.map((k) => `${k}="${attrs[k]}"`);
            attrString = `|${pairs.join(",")}`;
        }

        return marker ? `\\${marker}${text}${attrString} ` : `${text} `;
    }

    if (nodeIsUsfmElementNode(node)) {
        const marker = node.getMarker();
        const start = `\\${marker} `;
        const end = tokensExpectingClose.has(marker ?? "")
            ? `\\${marker}*`
            : "";
        return `${start}${node
            .getChildren?.()
            .map((c) => serializeNode(c, editor))
            .join("")}${end}`;
    }

    // Element nodes: recurse
    if (node instanceof ElementNode || nodeType === "paragraph") {
        const elNode = node as ElementNode;
        const children = elNode.getChildren?.() ?? [];
        return children.map((c) => serializeNode(c, editor)).join("");
    }

    // Less specific node types
    if (node instanceof LineBreakNode) {
        return "\n";
    }
    if (node instanceof TextNode) {
        return node.getTextContent();
    }

    // Fallback for unknown node types
    return node.getTextContent?.() ?? "";
}

export type SearchMatch = {
    text: string;
    cuid: string;
    sid: string;
    indices: Array<[number, number]>; // start/end positions of match
    file: string;
    chapter: string;
};

export type ChapterSearchResult = {
    [chapter: string]: SearchMatch[];
};

export function searchParsedFile(
    file: ParsedFile,
    searchTerm: string,
): { hasResults: boolean; results: ChapterSearchResult } {
    const lowerSearch = searchTerm.toLowerCase();
    const results: ChapterSearchResult = {};

    for (const [chapter, chapterData] of Object.entries(file.chapters)) {
        const matches: SearchMatch[] = [];
        const rootChildren = chapterData.lexicalState.root?.children ?? [];

        traverseLexicalNodes({
            nodes: rootChildren,
            lowerSearch,
            matches,
            fileName: file.path,
            chapter,
        });

        if (matches.length > 0) {
            results[chapter] = matches;
        }
    }

    const hasResults = Object.keys(results).length > 0;
    return {
        hasResults,
        results,
    };
}

/**
 * Recursively traverse lexical nodes to find text nodes matching the search term
 */
type TraverseLexicalNodeArgs = {
    nodes: SerializedLexicalNode[];
    lowerSearch: string;
    matches: SearchMatch[];
    fileName: string;
    chapter: string;
};
function traverseLexicalNodes({
    nodes,
    lowerSearch,
    matches,
    fileName,
    chapter,
}: TraverseLexicalNodeArgs) {
    for (const node of nodes) {
        if ("children" in node && Array.isArray(node.children)) {
            traverseLexicalNodes({
                nodes: node.children,
                lowerSearch,
                matches,
                fileName,
                chapter,
            });
        } else if (isSerializedUSFMTextNode(node)) {
            const textLower = node.text.toLowerCase();
            let startIndex = 0;
            let idx = textLower.indexOf(lowerSearch, startIndex);

            while (idx !== -1) {
                matches.push({
                    cuid: node.cuid ?? "",
                    text: node.text ?? "",
                    file: fileName,
                    sid: node.sid ?? "",
                    chapter,
                    indices: [[idx, idx + lowerSearch.length]],
                });
                startIndex = idx + lowerSearch.length;
                idx = textLower.indexOf(lowerSearch, startIndex);
            }
        }
    }
}
