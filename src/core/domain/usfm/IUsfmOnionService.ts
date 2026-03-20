import type {
    BatchExecutionOptions,
    BuildSidBlocksOptions,
    Diff,
    DiffScopeItem,
    DiffScopeOptions,
    FormatScopeOptions,
    LintIssue,
    LintScopeOptions,
    ProjectedUsfmDocument,
    ProjectUsfmOptions,
    Token,
    TokenFix,
    TokenLintOptions,
    TokenScopeItem,
    TokenTransformResult,
    UsfmMarkerCatalog,
} from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * Async boundary for USFM Onion operations.
 *
 * Keep this interface async even when a specific implementation is synchronous
 * so web/wasm and Tauri/native callers can share one contract.
 *
 * This first integration slice covers:
 * - lexical token projection
 * - the current Dovetail parse tree shape used by the editor
 *
 * Future slices should expand this same interface with lint/format/diff and
 * conversion methods instead of introducing parallel service contracts.
 */
export interface IUsfmOnionService {
    readonly supportsPathIo: boolean;

    getMarkerCatalog(): Promise<UsfmMarkerCatalog>;

    parseUsfm(
        source: string,
        options?: ProjectUsfmOptions,
    ): Promise<ProjectedUsfmDocument>;

    parseUsfmBatchFromPaths(
        paths: string[],
        options?: ProjectUsfmOptions,
        batchOptions?: BatchExecutionOptions,
    ): Promise<ProjectedUsfmDocument[]>;

    parseUsfmBatchFromContents(
        sources: string[],
        options?: ProjectUsfmOptions,
        batchOptions?: BatchExecutionOptions,
    ): Promise<ProjectedUsfmDocument[]>;

    lintExisting(
        tokens: Token[],
        options?: TokenLintOptions,
    ): Promise<LintIssue[]>;
    lintScope(
        scope: TokenScopeItem[],
        options?: LintScopeOptions,
    ): Promise<LintIssue[][]>;
    formatScope(
        scope: TokenScopeItem[],
        options?: FormatScopeOptions,
    ): Promise<TokenTransformResult[]>;

    applyTokenFixes(
        tokens: Token[],
        fixes: TokenFix[],
    ): Promise<TokenTransformResult>;

    diffTokens(
        baselineTokens: Token[],
        currentTokens: Token[],
        buildOptions?: BuildSidBlocksOptions,
    ): Promise<Diff[]>;

    revertDiffBlock(
        baselineTokens: Token[],
        currentTokens: Token[],
        blockId: string,
        buildOptions?: BuildSidBlocksOptions,
    ): Promise<Token[]>;
    diffScope(
        scope: DiffScopeItem[],
        options?: DiffScopeOptions,
    ): Promise<Diff[][]>;
}
