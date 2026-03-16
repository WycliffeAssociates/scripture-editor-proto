import type { ParsedToken } from "@/core/data/usfm/parse.ts";
import type { LegacyLintableToken as LintableToken } from "@/core/domain/usfm/legacyTokenTypes.ts";
import type {
    BuildSidBlocksOptions,
    FlatToken,
    ParsedUsfmDocument,
    ProjectUsfmOptions,
    TokenLintOptions,
} from "@/core/domain/usfm/usfmOnionTypes.ts";

function legacyTokenTypeToOnionKind(tokenType: string): string {
    switch (tokenType) {
        case "nl":
        case "verticalWhitespace":
            return "newline";
        case "ws":
        case "horizontalWhitespace":
            return "whitespace";
        case "endMarker":
            return "end-marker";
        case "milestoneEnd":
            return "milestone-end";
        case "bookCode":
            return "book-code";
        case "optBreak":
            return "optbreak";
        case "numberRange":
            return "number";
        default:
            return tokenType;
    }
}

function normalizeFlatToken(token: FlatToken): FlatToken {
    return {
        ...token,
        kind: legacyTokenTypeToOnionKind(token.kind),
    };
}

function flatTokensFromLintableTokens<T extends LintableToken>(
    tokens: T[],
): FlatToken[] {
    let cursor = 0;
    return tokens.map((token) => {
        const start = cursor;
        const text = token.text ?? "";
        const end = start + text.length;
        cursor = end;
        return {
            id: token.id,
            kind: legacyTokenTypeToOnionKind(token.tokenType),
            span: {
                start,
                end,
            },
            sid: token.sid ?? null,
            marker: token.marker ?? null,
            text,
        };
    });
}

export function toOnionFlatTokens<T extends LintableToken | FlatToken>(
    tokens: T[],
): FlatToken[] {
    if (!tokens.length) return [];
    const first = tokens[0] as Partial<FlatToken>;
    if (
        typeof first.kind === "string" &&
        typeof first.span?.start === "number" &&
        typeof first.span?.end === "number"
    ) {
        return (tokens as FlatToken[]).map(normalizeFlatToken);
    }

    return flatTokensFromLintableTokens(tokens as LintableToken[]);
}

function flatTokenKindToParsedTokenType(kind: string): string {
    switch (kind) {
        case "marker":
        case "milestone":
            return "marker";
        case "end-marker":
        case "milestone-end":
            return "endMarker";
        case "newline":
            return "verticalWhitespace";
        case "number":
            return "numberRange";
        case "book-code":
            return "bookCode";
        default:
            return kind;
    }
}

function flatTokenToParsedToken(token: FlatToken): ParsedToken {
    return {
        id: token.id,
        text: token.text,
        sid: token.sid ?? undefined,
        marker: token.marker ?? undefined,
        tokenType: flatTokenKindToParsedTokenType(token.kind),
    };
}

function chapterFromToken(token: FlatToken, currentChapter: number): number {
    if (token.marker === "c" && token.kind === "marker") {
        return currentChapter;
    }
    if (!token.sid) return currentChapter;
    const parts = token.sid.split(/\s+/, 2);
    if (parts.length < 2) return currentChapter;
    const chapterPart = parts[1]?.split(":")[0] ?? "";
    const parsedChapter = Number.parseInt(chapterPart, 10);
    return Number.isFinite(parsedChapter) ? parsedChapter : currentChapter;
}

export function parseChapterDocumentFromTokens(
    tokens: FlatToken[],
): ParsedUsfmDocument {
    const chapters: ParsedUsfmDocument["chapters"] = {};
    let currentChapter = 0;

    for (const token of tokens) {
        currentChapter = chapterFromToken(token, currentChapter);
        chapters[currentChapter] ??= [];
        chapters[currentChapter].push(flatTokenToParsedToken(token));
    }

    return { chapters, lintErrors: [] };
}

export function defaultIntoTokensOptions() {
    return { mergeHorizontalWhitespace: false };
}

export function defaultProjectUsfmOptions(): ProjectUsfmOptions {
    return {
        tokenOptions: defaultIntoTokensOptions(),
        lintOptions: null,
    };
}

export function defaultTokenLintOptions(): TokenLintOptions {
    return {};
}

export function defaultBuildSidBlocksOptions(): BuildSidBlocksOptions {
    return { allowEmptySid: true };
}
