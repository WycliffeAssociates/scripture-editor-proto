import type { SerializedLexicalNode } from "lexical";
import { isSerializedElementNode } from "@/app/domain/editor/nodes/USFMElementNode.ts";
import { isSerializedUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { isSerializedPlainTextUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";

export function reduceSerializedNodesToText(
    serializedNodes: SerializedLexicalNode[],
): Record<string, string> {
    const result: Record<string, string> = {};

    for (const node of serializedNodes) {
        if (isSerializedPlainTextUSFMTextNode(node) && node.sid) {
            result[node.sid] = (result[node.sid] || "") + node.text;
        }

        if (isSerializedElementNode(node)) {
            const childText = reduceSerializedNodesToText(node.children);
            for (const [sid, text] of Object.entries(childText)) {
                result[sid] = (result[sid] || "") + text;
            }
        }

        if (isSerializedUSFMNestedEditorNode(node)) {
            const childText = reduceSerializedNodesToText(
                node.editorState.root.children,
            );
            for (const [sid, text] of Object.entries(childText)) {
                result[sid] = (result[sid] || "") + text;
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
