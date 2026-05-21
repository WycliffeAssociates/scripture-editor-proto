import type {
    AttributeItem as OnionAttributeItem,
    BuildSidBlocksOptions as OnionBuildSidBlocksOptions,
    ChapterTokenDiff as OnionChapterTokenDiff,
    DiffUndoSide as OnionDiffUndoSide,
    LintCode as OnionLintCode,
    LintIssue as OnionLintIssue,
    LintOptions as OnionLintOptions,
    MarkerInfo as OnionMarkerInfo,
    ParsedUsfm as OnionParsedUsfm,
    Token as OnionToken,
    TokenAlignment as OnionTokenAlignment,
    UsfmMarkerCatalog as OnionUsfmMarkerCatalog,
    TokenFix,
} from "usfm-onion-web";

/**
 * Shared USFM Onion type surface re-exported into Zephyr's core domain.
 *
 * Keeping these aliases here prevents the rest of the codebase from depending
 * directly on package-specific names at every call site.
 */
export type Token = OnionToken;
/** USFM 3.1 character-marker attribute (`|key="value"` after `\w` etc.). */
export type AttributeItem = OnionAttributeItem;
export type BuildSidBlocksOptions = OnionBuildSidBlocksOptions;
export type ParsedUsfm = OnionParsedUsfm;
export type MarkerInfo = OnionMarkerInfo;
export type RawUsfmMarkerCatalog = OnionUsfmMarkerCatalog;
export type DiffUndoSide = OnionDiffUndoSide;
export type DiffTokenAlignment = OnionTokenAlignment;
export type LintIssue = OnionLintIssue;
export type { TokenFix };

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
};

export type FormatScopeOptions = {
    tokenOptions?: IntoTokensOptions;
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
