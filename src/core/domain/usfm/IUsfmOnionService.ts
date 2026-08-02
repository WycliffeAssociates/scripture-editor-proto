import type {
  DiffSkeleton,
  DiffScopeItem,
  FormatScopeOptions,
  LintIssue,
  LintScopeOptions,
  MergeRequest,
  ProjectedUsfmDocument,
  ProjectUsfmOptions,
  Token,
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
 */
export interface IUsfmOnionService {
  readonly supportsPathIo: boolean;

  parseUsfm(
    source: string,
    options?: ProjectUsfmOptions,
  ): Promise<ProjectedUsfmDocument>;

  parseUsfmBatchFromPaths(
    paths: string[],
    options?: ProjectUsfmOptions,
  ): Promise<ProjectedUsfmDocument[]>;

  parseUsfmBatchFromContents(
    sources: string[],
    options?: ProjectUsfmOptions,
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
    baselineTokens: readonly Token[],
    currentTokens: readonly Token[],
  ): Promise<DiffSkeleton>;

  mergeDiffBlocks(
    baselineTokens: readonly Token[],
    currentTokens: readonly Token[],
    request: MergeRequest,
  ): Promise<Token[]>;

  diffScope(scope: DiffScopeItem[]): Promise<DiffSkeleton[]>;
}
