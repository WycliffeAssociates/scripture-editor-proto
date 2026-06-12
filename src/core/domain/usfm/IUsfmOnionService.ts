import type {
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
