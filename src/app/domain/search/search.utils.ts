import type { SerializedLexicalNode } from "lexical";
import {
    isSerializedPlainTextUSFMTextNode,
    isSerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { materializeFlatTokensArray } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";
import { replaceMatchesInText } from "@/core/domain/search/replaceEngine.ts";
import {
    escapeRegex,
    findAllMatches,
    findMatch,
} from "@/core/domain/search/searchEngine.ts";

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

export { escapeRegex, findAllMatches, findMatch, replaceMatchesInText };
