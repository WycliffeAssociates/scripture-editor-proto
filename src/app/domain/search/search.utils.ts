import type { SerializedLexicalNode } from "lexical";
import {
    isSerializedPlainTextUSFMTextNode,
    isSerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { materializeFlatTokensArray } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";

export function reduceSerializedNodesToText(
    serializedNodes: SerializedLexicalNode[],
    includeUSFM = false,
): Record<string, string> {
    const result: Record<string, string> = {};
    const flatNodes = materializeFlatTokensArray(serializedNodes);

    for (const node of flatNodes) {
        if (isSerializedPlainTextUSFMTextNode(node) && node.sid) {
            const textToAppend = node.text;
            result[node.sid] = (result[node.sid] || "") + textToAppend;
        } else if (isSerializedUSFMTextNode(node) && node.sid && includeUSFM) {
            result[node.sid] = (result[node.sid] || "") + node.text;
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
