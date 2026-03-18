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

    // @ai - all the "project" names don't click with me and read as the term project as in the noun. Can we just call these parse? The indirection in the implementatiosn is a little confusing too. We'd prefer to stick to as close as possible to usfm onion's terminology for each of these concepts and not introduce new terms.
    projectUsfm(
        source: string,
        options?: ProjectUsfmOptions,
    ): Promise<ProjectedUsfmDocument>;

    projectUsfmBatchFromPaths(
        paths: string[],
        options?: ProjectUsfmOptions,
        batchOptions?: BatchExecutionOptions,
    ): Promise<ProjectedUsfmDocument[]>;

    projectUsfmBatchFromContents(
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
