import type { LintableToken } from "@/core/data/usfm/lint.ts";
import type {
    BatchExecutionOptions,
    BuildSidBlocksOptions,
    ChapterDiffEntry,
    Diff,
    DiffPathPair,
    DiffScopeItem,
    DiffScopeOptions,
    FlatToken,
    FormatOptions,
    FormatScopeOptions,
    IntoTokensOptions,
    LintIssue,
    LintOptions,
    LintScopeOptions,
    ParsedUsfmDocument,
    ProjectedUsfmDocument,
    ProjectUsfmOptions,
    TokenFix,
    TokenLintOptions,
    TokenScopeItem,
    TokenTransformResult,
    UsjDocument,
    VrefEntry,
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

    projectUsfm(
        source: string,
        options?: ProjectUsfmOptions,
    ): Promise<ProjectedUsfmDocument>;

    projectUsfmFromPath(
        path: string,
        options?: ProjectUsfmOptions,
    ): Promise<ProjectedUsfmDocument>;

    projectUsfmBatchFromPaths(
        paths: string[],
        options?: ProjectUsfmOptions,
        batchOptions?: BatchExecutionOptions,
    ): Promise<ProjectedUsfmDocument[]>;

    tokensFromUsfm(
        source: string,
        options?: IntoTokensOptions,
    ): Promise<FlatToken[]>;

    tokensFromPath(
        path: string,
        options?: IntoTokensOptions,
    ): Promise<FlatToken[]>;

    tokensFromExisting<T extends LintableToken>(
        tokens: T[],
    ): Promise<FlatToken[]>;

    parseUsfm(source: string): Promise<ParsedUsfmDocument>;

    parseUsfmChapter(
        chapterUsfm: string,
        bookCode: string,
    ): Promise<ParsedUsfmDocument>;

    lintUsfm(source: string, options?: LintOptions): Promise<LintIssue[]>;

    lintPath(path: string, options?: LintOptions): Promise<LintIssue[]>;
    lintBatchFromPaths(
        paths: string[],
        options?: LintOptions,
        batchOptions?: BatchExecutionOptions,
    ): Promise<LintIssue[][]>;

    lintExisting<T extends LintableToken | FlatToken>(
        tokens: T[],
        options?: TokenLintOptions,
    ): Promise<LintIssue[]>;
    lintScope(
        scope: TokenScopeItem[],
        options?: LintScopeOptions,
    ): Promise<LintIssue[][]>;
    lintTokenBatches<T extends LintableToken | FlatToken>(
        tokenBatches: T[][],
        options?: TokenLintOptions,
        batchOptions?: BatchExecutionOptions,
    ): Promise<LintIssue[][]>;

    formatTokens(
        tokens: FlatToken[],
        options?: FormatOptions,
    ): Promise<TokenTransformResult>;
    formatScope(
        scope: TokenScopeItem[],
        options?: FormatScopeOptions,
    ): Promise<TokenTransformResult[]>;
    formatTokenBatches(
        tokenBatches: FlatToken[][],
        options?: FormatOptions,
        batchOptions?: BatchExecutionOptions,
    ): Promise<TokenTransformResult[]>;
    formatBatchFromPaths(
        paths: string[],
        tokenOptions?: IntoTokensOptions,
        formatOptions?: FormatOptions,
        batchOptions?: BatchExecutionOptions,
    ): Promise<TokenTransformResult[]>;

    applyTokenFixes(
        tokens: FlatToken[],
        fixes: TokenFix[],
    ): Promise<TokenTransformResult>;

    diffUsfm(
        baselineUsfm: string,
        currentUsfm: string,
        tokenOptions?: IntoTokensOptions,
        buildOptions?: BuildSidBlocksOptions,
    ): Promise<Diff[]>;

    diffUsfmByChapter(
        baselineUsfm: string,
        currentUsfm: string,
        tokenOptions?: IntoTokensOptions,
        buildOptions?: BuildSidBlocksOptions,
    ): Promise<ChapterDiffEntry[]>;

    diffTokens(
        baselineTokens: FlatToken[],
        currentTokens: FlatToken[],
        buildOptions?: BuildSidBlocksOptions,
    ): Promise<Diff[]>;

    revertDiffBlock(
        baselineTokens: FlatToken[],
        currentTokens: FlatToken[],
        blockId: string,
        buildOptions?: BuildSidBlocksOptions,
    ): Promise<FlatToken[]>;

    toUsj(source: string): Promise<UsjDocument>;
    toUsjFromPath(path: string): Promise<UsjDocument>;
    fromUsj(document: UsjDocument): Promise<string>;
    toUsx(source: string): Promise<string>;
    toUsxFromPath(path: string): Promise<string>;
    fromUsx(value: string): Promise<string>;
    toVref(source: string): Promise<VrefEntry[]>;
    toVrefFromPath(path: string): Promise<VrefEntry[]>;

    diffPaths(
        baselinePath: string,
        currentPath: string,
        tokenOptions?: IntoTokensOptions,
        buildOptions?: BuildSidBlocksOptions,
    ): Promise<Diff[]>;

    diffPathsByChapter(
        baselinePath: string,
        currentPath: string,
        tokenOptions?: IntoTokensOptions,
        buildOptions?: BuildSidBlocksOptions,
    ): Promise<ChapterDiffEntry[]>;
    diffScope(
        scope: DiffScopeItem[],
        options?: DiffScopeOptions,
    ): Promise<Diff[][]>;
    diffBatchFromPathPairs(
        pathPairs: DiffPathPair[],
        tokenOptions?: IntoTokensOptions,
        buildOptions?: BuildSidBlocksOptions,
        batchOptions?: BatchExecutionOptions,
    ): Promise<Diff[][]>;

    toUsjBatchFromPaths(
        paths: string[],
        batchOptions?: BatchExecutionOptions,
    ): Promise<UsjDocument[]>;
    toUsxBatchFromPaths(
        paths: string[],
        batchOptions?: BatchExecutionOptions,
    ): Promise<string[]>;
    toVrefBatchFromPaths(
        paths: string[],
        batchOptions?: BatchExecutionOptions,
    ): Promise<VrefEntry[][]>;
}
