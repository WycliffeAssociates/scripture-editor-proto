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

function buildSearchRegex({
    searchTerm,
    matchCase,
    matchWholeWord,
}: Pick<FindMatchArgs, "searchTerm" | "matchCase" | "matchWholeWord">) {
    const escapedTerm = escapeRegex(searchTerm);
    const pattern = matchWholeWord ? `\\b${escapedTerm}\\b` : escapedTerm;
    const flags = matchCase ? "g" : "gi";
    return new RegExp(pattern, flags);
}

type FindMatchArgs = {
    textToSearch: string;
    searchTerm: string;
    matchCase: boolean;
    matchWholeWord: boolean;
};

type FindAllMatchesArgs = FindMatchArgs;

export function findAllMatches({
    textToSearch,
    searchTerm,
    matchCase,
    matchWholeWord,
}: FindAllMatchesArgs): Array<{
    start: number;
    end: number;
    matchedTerm: string;
}> {
    if (!searchTerm) return [];
    const regex = buildSearchRegex({ searchTerm, matchCase, matchWholeWord });
    const matches: Array<{ start: number; end: number; matchedTerm: string }> =
        [];
    let match: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: Intentional assignment in while condition
    while ((match = regex.exec(textToSearch)) !== null) {
        matches.push({
            start: match.index,
            end: match.index + match[0].length,
            matchedTerm: match[0],
        });
    }
    return matches;
}

export function findMatch({
    textToSearch,
    searchTerm,
    matchCase,
    matchWholeWord,
}: FindMatchArgs) {
    if (!searchTerm) {
        return { isMatch: false, matchedTerm: null };
    }

    const regex = buildSearchRegex({ searchTerm, matchCase, matchWholeWord });
    const result = regex.exec(textToSearch);
    if (result) {
        return { isMatch: true, matchedTerm: result[0] };
    }

    return { isMatch: false, matchedTerm: null };
}

type ReplaceInTextArgs = {
    text: string;
    searchTerm: string;
    replaceTerm: string;
    matchCase: boolean;
    matchWholeWord: boolean;
};

export function replaceMatchesInText({
    text,
    searchTerm,
    replaceTerm,
    matchCase,
    matchWholeWord,
}: ReplaceInTextArgs) {
    if (!searchTerm) return text;
    const regex = buildSearchRegex({ searchTerm, matchCase, matchWholeWord });
    return text.replace(regex, replaceTerm);
}
