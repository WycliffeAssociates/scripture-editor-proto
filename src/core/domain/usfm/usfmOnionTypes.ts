import type {
    AstDocument as OnionAstDocument,
    AstElement as OnionAstElement,
    AstNode as OnionAstNode,
    BatchExecutionOptions as OnionBatchExecutionOptions,
    BuildSidBlocksOptions as OnionBuildSidBlocksOptions,
    FormatOptions as OnionFormatOptions,
    IntoTokensOptions as OnionIntoTokensOptions,
    Span as OnionSpan,
    TokenFix as OnionTokenFix,
    UsjDocument as OnionUsjDocument,
    UsjElement as OnionUsjElement,
    UsjNode as OnionUsjNode,
} from "usfm-onion-web";
import type { ParsedToken } from "@/core/data/usfm/parse.ts";
import type { LegacyLintError as LintError } from "@/core/domain/usfm/legacyTokenTypes.ts";

export type Span = OnionSpan;

export type IntoTokensOptions = OnionIntoTokensOptions;

export type BuildSidBlocksOptions = OnionBuildSidBlocksOptions;

export type BatchExecutionOptions = OnionBatchExecutionOptions;

export type TokenScopeItem = {
    path?: string;
    tokens?: FlatToken[];
};

export type LintScopeOptions = {
    lintOptions?: LintOptions;
    tokenOptions?: TokenLintOptions;
    batchOptions?: BatchExecutionOptions;
};

export type FormatScopeOptions = {
    tokenOptions?: IntoTokensOptions;
    formatOptions?: FormatOptions;
    batchOptions?: BatchExecutionOptions;
};

export type DiffPathPair = {
    baselinePath: string;
    currentPath: string;
};

export type DiffScopeItem = {
    baselinePath?: string;
    currentPath?: string;
    baselineTokens?: FlatToken[];
    currentTokens?: FlatToken[];
};

export type DiffScopeOptions = {
    tokenOptions?: IntoTokensOptions;
    buildOptions?: BuildSidBlocksOptions;
    batchOptions?: BatchExecutionOptions;
};

export type FlatToken = {
    id: string;
    kind: string;
    span: Span;
    sid: string | null;
    marker: string | null;
    text: string;
};

export type TokenFix = OnionTokenFix;

export type TokenLintOptions = {
    disabledRules?: string[];
    suppressions?: Array<{
        code: string;
        sid: string;
    }>;
};

export type LintOptions = {
    includeParseRecoveries?: boolean;
    tokenView?: IntoTokensOptions;
    tokenRules?: TokenLintOptions;
};

export type ProjectUsfmOptions = {
    tokenOptions?: IntoTokensOptions;
    lintOptions?: LintOptions | null;
};

export type LintIssue = {
    code: string;
    severity: string;
    marker: string | null;
    message: string;
    messageParams: Record<string, string>;
    span: Span;
    relatedSpan: Span | null;
    tokenId: string | null;
    relatedTokenId: string | null;
    sid: string | null;
    fix: TokenFix | null;
};

export type ProjectedUsfmDocument = {
    tokens: FlatToken[];
    lintIssues: LintIssue[] | null;
};

export type FormatOptions = OnionFormatOptions;
export type AstDocument = OnionAstDocument;
export type AstNode = OnionAstNode;
export type AstElement = OnionAstElement;
export type UsjDocument = OnionUsjDocument;
export type UsjNode = OnionUsjNode;
export type UsjElement = OnionUsjElement;

export type TokenTransformChange = {
    kind: string;
    code: string;
    label: string;
    labelParams: Record<string, string>;
    targetTokenId: string | null;
};

export type SkippedTokenTransform = {
    kind: string;
    code: string;
    label: string;
    labelParams: Record<string, string>;
    reasonCode: string;
    targetTokenId: string | null;
    reason: string;
};

export type TokenTransformResult = {
    tokens: FlatToken[];
    appliedChanges: TokenTransformChange[];
    skippedChanges: SkippedTokenTransform[];
};

export type Diff = {
    blockId: string;
    semanticSid: string;
    status: string;
    originalText: string;
    currentText: string;
    originalTextOnly: string;
    currentTextOnly: string;
    isWhitespaceChange: boolean;
    isUsfmStructureChange: boolean;
    originalTokens: FlatToken[];
    currentTokens: FlatToken[];
    originalAlignment: DiffTokenAlignment[];
    currentAlignment: DiffTokenAlignment[];
    undoSide: DiffUndoSide;
};

export type DiffTokenChange = "unchanged" | "added" | "deleted" | "modified";

export type DiffUndoSide = "original" | "current";

export type DiffTokenAlignment = {
    change: DiffTokenChange;
    counterpartIndex: number | null;
};

export type ParsedUsfmChapters = Record<number, ParsedToken[]>;

export type ParsedUsfmDocument = {
    chapters: ParsedUsfmChapters;
    lintErrors: LintError[];
};
