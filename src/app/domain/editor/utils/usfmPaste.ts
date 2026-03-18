import { $createLineBreakNode, type LexicalNode } from "lexical";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { $createUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

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

export type ClipboardUsfmTokenParseResult =
    | { ok: true; tokens: Token[] }
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

function onionKindToLexicalTokenType(kind: Token["kind"]): string {
    switch (kind) {
        case "marker":
            return UsfmTokenTypes.marker;
        case "endMarker":
            return UsfmTokenTypes.endMarker;
        case "newline":
            return UsfmTokenTypes.verticalWhitespace;
        case "number":
            return UsfmTokenTypes.numberRange;
        case "bookCode":
        case "optBreak":
        case "attributeList":
            return UsfmTokenTypes.text;
        default:
            return kind;
    }
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
    usfmOnionService: IUsfmOnionService;
}): Promise<ClipboardUsfmTokenParseResult> {
    return parseClipboardUsfmToTokensAsync(args);
}

async function parseClipboardUsfmToTokensAsync(args: {
    text: string;
    bookCode: string;
    direction: "ltr" | "rtl";
    usfmOnionService: IUsfmOnionService;
}): Promise<ClipboardUsfmTokenParseResult> {
    try {
        if (hasMalformedChapterOrVerseNumber(args.text)) {
            return { ok: false, reason: "parse-failed" };
        }

        const projected = await args.usfmOnionService.projectUsfm(args.text, {
            lintOptions: null,
        });
        const hasInsertableTokens = projected.tokens.some((token) =>
            VALID_INSERTABLE_TOKEN_TYPES.has(
                onionKindToLexicalTokenType(token.kind),
            ),
        );
        if (!hasInsertableTokens) {
            return { ok: false, reason: "parse-failed" };
        }

        return { ok: true, tokens: projected.tokens };
    } catch (error) {
        console.error("Error parsing USFM:", error);
        return { ok: false, reason: "parse-failed" };
    }
}

export function parsedUsfmTokensToInsertableNodes(
    tokens: Token[],
): LexicalNode[] {
    const nodes: LexicalNode[] = [];
    for (const token of tokens) {
        const tokenType = onionKindToLexicalTokenType(token.kind);
        if (!VALID_INSERTABLE_TOKEN_TYPES.has(tokenType)) {
            continue;
        }

        if (tokenType === UsfmTokenTypes.verticalWhitespace) {
            nodes.push($createLineBreakNode());
            continue;
        }

        nodes.push(
            $createUSFMTextNode(token.text, {
                id: token.id || guidGenerator(),
                sid: token.sid || "",
                tokenType,
                marker: token.marker,
                inPara: "",
                lintErrors: [],
            }),
        );
    }
    return nodes;
}
