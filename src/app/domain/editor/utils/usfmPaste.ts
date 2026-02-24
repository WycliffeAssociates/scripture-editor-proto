import { $createLineBreakNode, type LexicalNode } from "lexical";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { $createUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import type { ParsedToken } from "@/core/data/usfm/parse.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";
import { parseUSFMChapter } from "@/core/domain/usfm/parse.ts";

const USFM_MARKER_PATTERN =
    /(^|[\s\u00A0])\\[A-Za-z][A-Za-z0-9]*\*?(?=$|[\s\u00A0])/gmu;
const VALID_INSERTABLE_TOKEN_TYPES = new Set<string>([
    UsfmTokenTypes.marker,
    UsfmTokenTypes.endMarker,
    UsfmTokenTypes.numberRange,
    UsfmTokenTypes.text,
    UsfmTokenTypes.error,
    UsfmTokenTypes.verticalWhitespace,
]);

export type ClipboardUsfmParseResult =
    | { ok: true; nodes: LexicalNode[]; tokens: ParsedToken[] }
    | { ok: false; reason: "parse-failed" };
export type ClipboardUsfmTokenParseResult =
    | { ok: true; tokens: ParsedToken[] }
    | { ok: false; reason: "parse-failed" };

export function isUsfmLikePaste(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed.length) return false;
    const matches = [...trimmed.matchAll(USFM_MARKER_PATTERN)];
    if (matches.length === 0) return false;
    if (matches.length > 1) return true;
    return (
        /^\s*\\[A-Za-z][A-Za-z0-9]*\b/mu.test(trimmed) && /\n/u.test(trimmed)
    );
}

export function flattenParsedChapterMap(
    chapters: Record<number, ParsedToken[]>,
): ParsedToken[] {
    return Object.keys(chapters)
        .map(Number)
        .sort((a, b) => a - b)
        .flatMap((chapter) => chapters[chapter] ?? []);
}

function flattenNestedTokens(tokens: ParsedToken[]): ParsedToken[] {
    const out: ParsedToken[] = [];
    for (const token of tokens) {
        out.push(token);
        if (token.content?.length) {
            out.push(...flattenNestedTokens(token.content));
        }
    }
    return out;
}

function hasMalformedChapterOrVerseNumber(text: string): boolean {
    const lines = text.split(/\r?\n/u);
    for (const line of lines) {
        const markerMatch = line.match(/^\s*\\(c|v)\b(.*)$/u);
        if (!markerMatch) continue;
        const marker = markerMatch[1];
        const tail = markerMatch[2]?.trim() ?? "";
        if (!tail.length) return true;

        if (marker === "c") {
            if (!/^\d+\b/u.test(tail)) return true;
            continue;
        }

        if (!/^\d+(?:-\d+)?[a-z]?\b/iu.test(tail)) return true;
    }
    return false;
}

export function parseClipboardUsfmToTokens(args: {
    text: string;
    bookCode: string;
    direction: "ltr" | "rtl";
}): ClipboardUsfmTokenParseResult {
    try {
        if (hasMalformedChapterOrVerseNumber(args.text)) {
            return { ok: false, reason: "parse-failed" };
        }

        const parsed = parseUSFMChapter(args.text, args.bookCode);

        const chapterTokens = flattenParsedChapterMap(parsed.usfm);
        const flatTokens = flattenNestedTokens(chapterTokens);
        const hasInsertableTokens = flatTokens.some((token) =>
            VALID_INSERTABLE_TOKEN_TYPES.has(token.tokenType),
        );
        if (!hasInsertableTokens) {
            return { ok: false, reason: "parse-failed" };
        }

        return { ok: true, tokens: flatTokens };
    } catch {
        return { ok: false, reason: "parse-failed" };
    }
}

export function parsedUsfmTokensToInsertableNodes(
    tokens: ParsedToken[],
): LexicalNode[] {
    const nodes: LexicalNode[] = [];
    for (const token of tokens) {
        if (!VALID_INSERTABLE_TOKEN_TYPES.has(token.tokenType)) {
            continue;
        }

        if (token.tokenType === UsfmTokenTypes.verticalWhitespace) {
            nodes.push($createLineBreakNode());
            continue;
        }

        nodes.push(
            $createUSFMTextNode(token.text, {
                id: token.id || guidGenerator(),
                sid: token.sid || "",
                tokenType: token.tokenType,
                marker: token.marker,
                inPara: token.inPara || "",
                inChars: token.inChars,
                attributes: token.attributes,
                lintErrors: token.lintErrors,
            }),
        );
    }
    return nodes;
}

export function parseClipboardUsfmToInsertableNodes(args: {
    text: string;
    bookCode: string;
    direction: "ltr" | "rtl";
}): ClipboardUsfmParseResult {
    const parsed = parseClipboardUsfmToTokens(args);
    if (!parsed.ok) return parsed;
    const nodes = parsedUsfmTokensToInsertableNodes(parsed.tokens);
    if (!nodes.length) {
        return { ok: false, reason: "parse-failed" };
    }
    return { ok: true, nodes, tokens: parsed.tokens };
}
