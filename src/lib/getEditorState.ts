import {
    $getRoot,
    type ElementNode,
    type SerializedEditorState,
    type SerializedElementNode,
    type SerializedLineBreakNode,
} from "lexical";
import {
    getSerializedDecoratorNode,
    type USFMDecoratorNodeJSON,
} from "@/features/editor/nodes/USFMMarkerDecoratorNode";
import {
    getSerializedNestedEditorNode,
    type USFMNestedEditorNodeJSON,
} from "@/features/editor/nodes/USFMNestedEditorDecorator";
import {
    $createUSFMElementNode,
    createSerializedUSFMElementNode,
    type USFMElementNodeJSON,
} from "../features/editor/nodes/USFMElementNode";
import {
    $createUSFMTextNode,
    getSerializedTextNode,
    type USFMTextNodeJSON,
} from "../features/editor/nodes/USFMTextNode";
import type { ParsedToken } from "./parse";

// tweak to your USFM set
const _BLOCK_MARKERS = new Set([
    "p",
    "m",
    "mi",
    "q",
    "q1",
    "q2",
    "q3",
    "q4",
    "s",
    "s1",
    "s2",
    "s3",
    "s4",
    "s5",
    "b",
    "d",
]);

function _isRootNode(node: ElementNode) {
    // RootNode.getType() returns 'root'
    return (node as any).getType?.() === "root";
}

// If we're about to append inline content to the root, make a fallback <p>
// function ensureInlineParent(parent: ElementNode): ElementNode {
//   if (isRootNode(parent)) {
//     const p = $createParagraphNode();
//     parent.append(p);
//     return p;
//   }
//   return parent;
// }
const nestedEditorMarkers = new Set(["f", "x"]); // expandable later

export type USFMNodeJSON =
    | USFMElementNodeJSON
    | USFMTextNodeJSON
    | USFMDecoratorNodeJSON
    | SerializedLineBreakNode
    | USFMNestedEditorNodeJSON;
function serializeToken(t: ParsedToken): USFMNodeJSON {
    if (nestedEditorMarkers.has(t.marker ?? "")) {
        return getSerializedNestedEditorNode(
            t,
            () => t.content?.map(serializeToken) ?? [],
        );
    }

    // If token has children → element node
    if (Array.isArray(t.content) && t.content.length > 0) {
        return createSerializedUSFMElementNode(
            t,
            () => t.content?.map(serializeToken) ?? [],
        );
    }
    const token =
        t.type === "idMarker"
            ? {
                  ...t,
                  marker: "id",
                  type: "marker",
                  text: t.text.replace("id", ""),
                  cuid: t.cuid,
              }
            : t;

    if (token.type === "nl") {
        const lb: SerializedLineBreakNode = {
            type: "linebreak",
            version: 1,
        };
        return lb;
    }

    const decoratorMarkers = ["c", "v"];
    if (decoratorMarkers.includes(token.marker ?? "")) {
        return getSerializedDecoratorNode(token);
    }

    // everything else is text
    return getSerializedTextNode(token);
}

export function getSerializedLexicalNodes(
    tokens: ParsedToken[],
): SerializedEditorState {
    const serializedPara: SerializedElementNode = {
        children: tokens.map(serializeToken),
        type: "paragraph",
        version: 1,
        direction: "ltr",
        format: "start",
        indent: 0,
    };

    return {
        root: {
            children: [serializedPara],
            type: "root",
            version: 1,
            direction: "ltr",
            format: "start",
            indent: 0,
        },
    };
}

function appendOne(parent: ElementNode, t: ParsedToken) {
    // TEXT: simple leaf
    if (t.type === "text" || t.type === "marker") {
        const target = parent;
        target.append(
            $createUSFMTextNode(t.text, t.cuid, {
                inPara: t.inPara,
                sid: t.sid,
                usfmType: t.type,
                level: t.level,
                marker: t.marker,
                attributes: t.attributes ?? {},
            }),
        );
        return;
    }

    // MARKER WITH CHILDREN: make a container and recurse
    const hasChildren = Array.isArray(t.content) && t.content.length > 0;
    if (hasChildren) {
        const container = $createUSFMElementNode({
            marker: t.marker,
            cuid: t.cuid,
            inPara: t.inPara,
            sid: t.sid,
            level: t.level,
            attributes: t.attributes ?? {},
        });

        parent.append(container);

        // Always render the marker as a visible span (even if empty),
        // so you can "see" it in the DOM.
        container.append(
            $createUSFMTextNode(t.text ?? "", t.cuid, {
                inPara: t.inPara,
                sid: t.sid,
                usfmType: t.type,
                level: t.level,
                marker: t.marker,
                attributes: t.attributes ?? {},
            }),
        );

        // Recurse for children
        appendTokens(container, t.content!);
        return;
    }

    // MARKER WITHOUT CHILDREN
    // if (t.type === "marker") {
    //   const isBlock = BLOCK_MARKERS.has(t.marker ?? "");

    //   if (isBlock) {
    //     // Represent block markers as an element container,
    //     // but still put a visible "marker span" inside.
    //     const block = $createUSFMElementNode({
    //       marker: t.marker,
    //       inPara: t.inPara,
    //       sid: t.sid,
    //       level: t.level,
    //       attributes: t.attributes ?? {},
    //     });

    //     parent.append(block);

    //     block.append(
    //       $createUSFMTextNode(t.text ?? "", {
    //         inPara: t.inPara,
    //         sid: t.sid,
    //         attributes: {
    //           ...(t.attributes ?? {}),
    //           marker: t.marker ?? "",
    //         },
    //       })
    //     );
    //   } else {
    //     // Inline marker → render as a visible span
    //     const target = isRootNode(parent) ? ensureInlineParent(parent) : parent;
    //     target.append(
    //       $createUSFMTextNode(t.text ?? "", {
    //         inPara: t.inPara,
    //         sid: t.sid,
    //         attributes: {
    //           ...(t.attributes ?? {}),
    //           marker: t.marker ?? "",
    //         },
    //       })
    //     );
    //   }
    //   return;
    // }

    // Fallback: treat unknown token types as inline text
    parent.append(
        $createUSFMTextNode(t.text ?? "", t.cuid, {
            inPara: t.inPara,
            sid: t.sid,
            usfmType: t.type,
            level: t.level,
            marker: t.marker,
            attributes: t.attributes ?? {},
        }),
    );
}

export function appendTokens(parent: ElementNode, tokens: ParsedToken[]) {
    for (const t of tokens) {
        appendOne(parent, t);
    }
}

export function parseTokensToLexicalState(tokens: ParsedToken[]) {
    const root = $getRoot();
    appendTokens(root, tokens);
    return root;
}
