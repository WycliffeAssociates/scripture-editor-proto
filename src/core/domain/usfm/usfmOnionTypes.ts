import type {
    BuildSidBlocksOptions as OnionBuildSidBlocksOptions,
    ChapterTokenDiff as OnionChapterTokenDiff,
    DiffTokenChange as OnionDiffTokenChange,
    DiffUndoSide as OnionDiffUndoSide,
    FormatOptions as OnionFormatOptions,
    LintCode as OnionLintCode,
    LintIssue as OnionLintIssue,
    LintIssueType as OnionLintIssueType,
    LintOptions as OnionLintOptions,
    LintSeverity as OnionLintSeverity,
    MarkerInfo as OnionMarkerInfo,
    ParsedUsfm as OnionParsedUsfm,
    Span as OnionSpan,
    Token as OnionToken,
    UsfmMarkerCatalog as OnionUsfmMarkerCatalog,
    TokenFix,
} from "usfm-onion-web";

/**
 * Shared USFM Onion type surface re-exported into Dovetail's core domain.
 *
 * Keeping these aliases here prevents the rest of the codebase from depending
 * directly on package-specific names at every call site.
 */
export type Span = OnionSpan;
export type Token = OnionToken;
export type BuildSidBlocksOptions = OnionBuildSidBlocksOptions;
export type FormatOptions = OnionFormatOptions;
export type ParsedUsfm = OnionParsedUsfm;
export type MarkerInfo = OnionMarkerInfo;
export type RawUsfmMarkerCatalog = OnionUsfmMarkerCatalog;
export type DiffTokenChange = OnionDiffTokenChange;
export type DiffUndoSide = OnionDiffUndoSide;
export type { TokenFix };

export type BatchExecutionOptions = {
    parallel?: boolean;
};

export type IntoTokensOptions = {
    mergeHorizontalWhitespace?: boolean;
};

export type TokenScopeItem = {
    path?: string;
    tokens?: Token[];
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
    baselineTokens?: Token[];
    currentTokens?: Token[];
};

export type DiffScopeOptions = {
    tokenOptions?: IntoTokensOptions;
    buildOptions?: BuildSidBlocksOptions;
    batchOptions?: BatchExecutionOptions;
};

export type TokenScopeLintSuppression = {
    code: OnionLintCode | string;
    sid: string;
};

export type TokenLintOptions = {
    disabledRules?: string[];
    suppressions?: TokenScopeLintSuppression[];
};

export type LintOptions = OnionLintOptions & {
    includeParseRecoveries?: boolean;
    tokenView?: IntoTokensOptions;
    tokenRules?: TokenLintOptions;
};

export type ProjectUsfmOptions = {
    tokenOptions?: IntoTokensOptions;
    lintOptions?: LintOptions | null;
};

// todo: this is a whacky type. and I still dislike how much we are recreating some of this stuff ourself
export type LintIssueType = OnionLintIssueType;

export type LintIssue = Omit<
    OnionLintIssue,
    | "code"
    | "category"
    | "severity"
    | "issueType"
    | "marker"
    | "messageParams"
    | "span"
    | "relatedSpan"
    | "tokenId"
    | "relatedTokenId"
    | "sid"
    | "fix"
> & {
    code: OnionLintCode | string;
    category?: OnionLintIssue["category"];
    severity: OnionLintSeverity | string;
    issueType: LintIssueType;
    marker: string | null;
    messageParams: Record<string, string>;
    span: Span | null;
    relatedSpan: Span | null;
    tokenId: string | null;
    relatedTokenId: string | null;
    sid: string | null;
    fix: TokenFix | null;
};
export type ProjectedUsfmDocument = {
    tokens: Token[];
    lintIssues: LintIssue[] | null;
};

export type UsfmMarkerCatalog = {
    raw?: RawUsfmMarkerCatalog;
    allMarkers: string[];
    paragraphMarkers: string[];
    noteMarkers: string[];
    noteSubmarkers: string[];
    regularCharacterMarkers: string[];
    documentMarkers: string[];
    chapterVerseMarkers: string[];
    infoByMarker: Record<string, MarkerInfo>;
};

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
    tokens: Token[];
    appliedChanges: TokenTransformChange[];
    skippedChanges: SkippedTokenTransform[];
};

export type DiffTokenAlignment = {
    change: DiffTokenChange;
    counterpartIndex: number | null;
};

export type Diff = {
    blockId: string;
    semanticSid: string;
    status: OnionChapterTokenDiff["status"];
    original?: OnionChapterTokenDiff["original"];
    current?: OnionChapterTokenDiff["current"];
    originalText: string;
    currentText: string;
    originalTextOnly: string;
    currentTextOnly: string;
    isWhitespaceChange: boolean;
    isUsfmStructureChange: boolean;
    originalTokens: Token[];
    currentTokens: Token[];
    originalAlignment: DiffTokenAlignment[];
    currentAlignment: DiffTokenAlignment[];
    undoSide: DiffUndoSide;
};
