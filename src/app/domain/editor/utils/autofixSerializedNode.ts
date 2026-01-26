import type { SerializedLexicalNode } from "lexical";
import { USFM_TEXT_NODE_TYPE, UsfmTokenTypes } from "@/app/data/editor.ts";
import {
    isSerializedUSFMTextNode,
    type SerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    findNodeWithContext,
    type NodeContext,
} from "@/app/domain/editor/utils/serializedTraversal.ts";
import type { LintError } from "@/core/data/usfm/lint.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";

export function applyAutofixToSerializedState(
    nodes: SerializedLexicalNode[],
    error: LintError,
): boolean {
    if (!error.fix) return false;
    const { type, data } = error.fix;

    const SUPPORTED_TYPES = ["insertEndMarker", "convertToMarkerAndText"];
    if (!SUPPORTED_TYPES.includes(type)) return false;

    const { nodeId, marker } = data;

    const context = findNodeWithContext(
        nodes,
        (node) => isSerializedUSFMTextNode(node) && node.id === nodeId,
    );
    if (!context) return false;

    switch (type) {
        case "insertEndMarker":
            return fixEndMarkerLint({ error, context, marker });
        case "convertToMarkerAndText":
            return fixConvertToMarkerAndText({ error, context, marker });
    }

    return false;
}

type FixFunctionArgs = {
    error: LintError;
    context: NodeContext;
    marker: string;
};

function fixEndMarkerLint({ context, marker }: FixFunctionArgs) {
    const { node, parentArray, index } = context;
    if (!isSerializedUSFMTextNode(node)) return false;

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
    parentArray.splice(index + 1, 0, markerNode);
    return true;
}

function fixConvertToMarkerAndText({
    error,
    context,
    marker,
}: FixFunctionArgs) {
    const { node, parentArray, index } = context;
    if (!isSerializedUSFMTextNode(node)) return false;

    const textAfter =
        error.fix?.type === "convertToMarkerAndText"
            ? error.fix.data.textAfter
            : "";

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
    parentArray.splice(index, 1, markerNode, textNode);
    return true;
}
