import type { LegacyLintableToken as LintableToken } from "@/core/domain/usfm/legacyTokenTypes.ts";
import type {
    BatchExecutionOptions,
    BuildSidBlocksOptions,
    Diff,
    DiffScopeItem,
    DiffScopeOptions,
    FlatToken,
    FormatScopeOptions,
    LintIssue,
    LintScopeOptions,
    ParsedUsfmDocument,
    ProjectedUsfmDocument,
    ProjectUsfmOptions,
    TokenFix,
    TokenLintOptions,
    TokenScopeItem,
    TokenTransformResult,
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

    parseUsfmChapter(
        chapterUsfm: string,
        bookCode: string,
    ): Promise<ParsedUsfmDocument>;

    lintExisting(
        tokens: Array<LintableToken | FlatToken>,
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
        tokens: FlatToken[],
        fixes: TokenFix[],
    ): Promise<TokenTransformResult>;

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
    diffScope(
        scope: DiffScopeItem[],
        options?: DiffScopeOptions,
    ): Promise<Diff[][]>;
}
