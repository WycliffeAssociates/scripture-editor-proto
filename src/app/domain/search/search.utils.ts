import type { SerializedLexicalNode } from "lexical";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import type { USFMElementNodeJSON } from "@/app/domain/editor/nodes/USFMElementNode.ts";
import { isSerializedElementNode } from "@/app/domain/editor/nodes/USFMElementNode.ts";
import type { USFMNestedEditorNodeJSON } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { isSerializedUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import type { SerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { isSerializedPlainTextUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";

export function reduceSerializedNodesToText(
    serializedNodes: SerializedLexicalNode[],
    includeUSFM = false,
): Record<string, string> {
    const result: Record<string, string> = {};

    for (const node of serializedNodes) {
        if (isSerializedPlainTextUSFMTextNode(node) && node.sid) {
            debugger;
            const textToAppend = includeUSFM ? getMarkerText(node) : node.text;
            result[node.sid] = (result[node.sid] || "") + textToAppend;
        }

        if (isSerializedElementNode(node)) {
            const markerPrefix =
                includeUSFM && (node as USFMElementNodeJSON).marker
                    ? `\\${(node as USFMElementNodeJSON).marker}`
                    : "";
            const childText = reduceSerializedNodesToText(
                node.children,
                includeUSFM,
            );
            for (const [sid, text] of Object.entries(childText)) {
                result[sid] = (result[sid] || "") + markerPrefix + text;
            }
        }

        if (isSerializedUSFMNestedEditorNode(node)) {
            const markerPrefix =
                includeUSFM && (node as USFMNestedEditorNodeJSON).marker
                    ? `\\${(node as USFMNestedEditorNodeJSON).marker}*`
                    : "";
            const childText = reduceSerializedNodesToText(
                node.editorState.root.children,
                includeUSFM,
            );
            for (const [sid, text] of Object.entries(childText)) {
                result[sid] = (result[sid] || "") + markerPrefix + text;
            }
        }
    }

    return result;
}

function getMarkerText(node: SerializedUSFMTextNode): string {
    if (node.tokenType === UsfmTokenTypes.marker && node.marker) {
        return `\\${node.marker}${node.text}`;
    }
    if (
        node.tokenType === UsfmTokenTypes.endMarker ||
        node.tokenType === "implicitClose"
    ) {
        return `\\*${node.text}`;
    }
    return node.text;
}

export function escapeRegex(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type FindMatchArgs = {
    textToSearch: string;
    searchTerm: string;
    matchCase: boolean;
    matchWholeWord: boolean;
};

export function findMatch({
    textToSearch,
    searchTerm,
    matchCase,
    matchWholeWord,
}: FindMatchArgs) {
    if (!searchTerm) {
        return { isMatch: false, matchedTerm: null };
    }

    if (matchWholeWord) {
        const escapedTerm = escapeRegex(searchTerm);
        const regex = new RegExp(
            `\\b${escapedTerm}\\b`,
            matchCase ? "g" : "gi",
        );
        const result = regex.exec(textToSearch);
        if (result) {
            return { isMatch: true, matchedTerm: result[0] };
        }
    } else {
        if (matchCase) {
            const index = textToSearch.indexOf(searchTerm);
            if (index > -1) {
                return { isMatch: true, matchedTerm: searchTerm };
            }
        } else {
            const index = textToSearch
                .toLowerCase()
                .indexOf(searchTerm.toLowerCase());
            if (index > -1) {
                const originalTerm = textToSearch.substring(
                    index,
                    index + searchTerm.length,
                );
                return { isMatch: true, matchedTerm: originalTerm };
            }
        }
    }
    return { isMatch: false, matchedTerm: null };
}
