import { escapeRegex } from "@/core/domain/search/searchEngine.ts";

function buildSearchRegex(args: {
    searchTerm: string;
    matchCase: boolean;
    matchWholeWord: boolean;
}): RegExp {
    const escapedTerm = escapeRegex(args.searchTerm);
    const pattern = args.matchWholeWord ? `\\b${escapedTerm}\\b` : escapedTerm;
    const flags = args.matchCase ? "g" : "gi";
    return new RegExp(pattern, flags);
}

export function replaceInNodeText(args: {
    text: string;
    start: number;
    end: number;
    replacement: string;
}): string {
    return (
        args.text.slice(0, args.start) +
        args.replacement +
        args.text.slice(args.end)
    );
}

export function replaceMatchesInText(args: {
    text: string;
    searchTerm: string;
    replaceTerm: string;
    matchCase: boolean;
    matchWholeWord: boolean;
}): string {
    if (!args.searchTerm) return args.text;
    const regex = buildSearchRegex({
        searchTerm: args.searchTerm,
        matchCase: args.matchCase,
        matchWholeWord: args.matchWholeWord,
    });
    return args.text.replace(regex, args.replaceTerm);
}
