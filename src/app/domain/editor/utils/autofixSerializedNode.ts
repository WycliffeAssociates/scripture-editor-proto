import type { SerializedElementNode, SerializedLexicalNode } from "lexical";
import { USFM_TEXT_NODE_TYPE, UsfmTokenTypes } from "@/app/data/editor.ts";
import { isSerializedElementNode } from "@/app/domain/editor/nodes/USFMElementNode.ts";
import {
    isSerializedUSFMNestedEditorNode,
    type USFMNestedEditorNodeJSON,
} from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import {
    isSerializedUSFMTextNode,
    type SerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import type { LintError } from "@/core/data/usfm/lint.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";

export function applyAutofixToSerializedState(
    nodes: SerializedLexicalNode[],
    error: LintError,
): boolean {
    if (!error.fix) return false;
    const { type, data } = error.fix;

    const SUPPORTED_TYPES = ["insertEndMarker", "convertToMarkerAndText"];
    // We only support insertEndMarker for now, but structure allows extension
    if (!SUPPORTED_TYPES.includes(type)) return false;

    const { nodeId, marker } = data;

    switch (type) {
        case "insertEndMarker":
            return fixEndMarkerLint({ error, nodes, nodeId, marker });
        case "convertToMarkerAndText":
            return fixConvertToMarkerAndText({ error, nodes, nodeId, marker });
    }

    return false;
}

type FixFunctionArgs = {
    error: LintError;
    nodes: SerializedLexicalNode[];
    nodeId: string;
    marker: string;
};

function fixEndMarkerLint({ error, nodes, nodeId, marker }: FixFunctionArgs) {
    let fixed = false;
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        // Check if this is the target node
        // We check text nodes primarily
        if (isSerializedUSFMTextNode(node) && node.id === nodeId) {
            const markerNode: SerializedUSFMTextNode = {
                type: USFM_TEXT_NODE_TYPE,
                text: `\\${marker}*`, // e.g. \f*
                marker: `${marker}*`,
                tokenType: UsfmTokenTypes.endMarker,
                version: 1,
                id: guidGenerator(),
                sid: node.sid, // inherit SID from the previous node
                inPara: node.inPara,
                inChars: node.inChars,
                show: true,
                isMutable: true,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                lexicalType: "usfm-text-node",
            };

            // Insert after current node
            nodes.splice(i + 1, 0, markerNode);
            fixed = true;
        }

        // Recursive search in ElementNode children
        if (isSerializedElementNode(node)) {
            const elementNode = node as SerializedElementNode;
            if (elementNode.children) {
                if (
                    applyAutofixToSerializedState(elementNode.children, error)
                ) {
                    return true;
                }
            }
        }

        // Recursive search in Nested Editor
        if (isSerializedUSFMNestedEditorNode(node)) {
            const nestedNode = node as USFMNestedEditorNodeJSON;
            if (nestedNode.editorState?.root?.children) {
                if (
                    applyAutofixToSerializedState(
                        nestedNode.editorState.root.children,
                        error,
                    )
                ) {
                    fixed = true;
                }
            }
        }
    }
    return fixed;
}

function fixConvertToMarkerAndText({
    error,
    nodes,
    nodeId,
    marker,
}: FixFunctionArgs) {
    const textAfter =
        error.fix?.type === "convertToMarkerAndText"
            ? error.fix.data.textAfter
            : "";

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        if (isSerializedUSFMTextNode(node) && node.id === nodeId) {
            // 1. Create the new Marker Node
            const markerNode: SerializedUSFMTextNode = {
                type: USFM_TEXT_NODE_TYPE,
                text: `\\${marker}`,
                marker: marker,
                tokenType: UsfmTokenTypes.marker,
                version: 1,
                id: guidGenerator(),
                sid: node.sid,
                inPara: node.inPara,
                inChars: node.inChars,
                show: true,
                isMutable: true,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                lexicalType: "usfm-text-node",
            };

            // 2. Create the new Text Node (with leading space)
            const textNode: SerializedUSFMTextNode = {
                type: USFM_TEXT_NODE_TYPE,
                text: ` ${textAfter}`,
                tokenType: UsfmTokenTypes.text,
                version: 1,
                id: guidGenerator(),
                sid: node.sid,
                inPara: node.inPara,
                inChars: node.inChars,
                show: true,
                isMutable: true,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                lexicalType: "usfm-text-node",
            };

            // 3. Replace the original node with these two
            nodes.splice(i, 1, markerNode, textNode);
            return true;
        }

        // Recursive search in ElementNode children
        if (isSerializedElementNode(node)) {
            const elementNode = node as SerializedElementNode;
            if (elementNode.children) {
                if (
                    applyAutofixToSerializedState(elementNode.children, error)
                ) {
                    return true;
                }
            }
        }

        // Recursive search in Nested Editor
        if (isSerializedUSFMNestedEditorNode(node)) {
            const nestedNode = node as USFMNestedEditorNodeJSON;
            if (nestedNode.editorState?.root?.children) {
                if (
                    applyAutofixToSerializedState(
                        nestedNode.editorState.root.children,
                        error,
                    )
                ) {
                    return true;
                }
            }
        }
    }
    return false;
}
