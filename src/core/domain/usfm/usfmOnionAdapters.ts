import type { LegacyLintableToken as LintableToken } from "@/core/domain/usfm/legacyTokenTypes.ts";
import type {
    BuildSidBlocksOptions,
    FlatToken,
    ParsedUsfmDocument,
    ProjectUsfmOptions,
    TokenLintOptions,
    UsjDocument,
} from "@/core/domain/usfm/usfmOnionTypes.ts";
import { usjToParsedUsfmDocument } from "@/core/domain/usfm/usjToParsedUsfm.ts";

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

export function parseChapterDocumentFromUsj(
    usj: UsjDocument,
): ParsedUsfmDocument {
    const parsed = usjToParsedUsfmDocument(usj);
    const filtered: ParsedUsfmDocument["chapters"] = {};

    for (const [chapterNum, tokens] of Object.entries(parsed.chapters)) {
        if (chapterNum !== "0") {
            filtered[Number(chapterNum)] = tokens;
            continue;
        }

        // parseUsfmChapter() is synthesized as `\id BOOK\n{chapterUsfm}`.
        // Never leak synthetic `\id`/book-code tokens back to app flows.
        const chapterTokens = tokens.filter(
            (token) => token.marker !== "id" && token.tokenType !== "bookCode",
        );
        if (chapterTokens.length > 0) {
            filtered[0] = chapterTokens;
        }
    }

    return {
        chapters: filtered,
        lintErrors: parsed.lintErrors,
    };
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
