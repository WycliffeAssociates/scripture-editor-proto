import type { SerializedLexicalNode } from "lexical";
import type { USFMNestedEditorNodeJSON } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { isSerializedUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import type { USFMParagraphNodeJSON } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import { isSerializedParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    isSerializedPlainTextUSFMTextNode,
    isSerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";

export function reduceSerializedNodesToText(
    serializedNodes: SerializedLexicalNode[],
    includeUSFM = false,
): Record<string, string> {
    const result: Record<string, string> = {};

    for (const node of serializedNodes) {
        if (isSerializedPlainTextUSFMTextNode(node) && node.sid) {
            const textToAppend = node.text;
            result[node.sid] = (result[node.sid] || "") + textToAppend;
        } else if (isSerializedUSFMTextNode(node) && node.sid && includeUSFM) {
            result[node.sid] = (result[node.sid] || "") + node.text;
        }

        if (isSerializedParagraphNode(node)) {
            const markerPrefix =
                includeUSFM && (node as USFMParagraphNodeJSON).marker
                    ? `\\${(node as USFMParagraphNodeJSON).marker}`
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
