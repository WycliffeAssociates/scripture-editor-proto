import { invoke } from "@tauri-apps/api/core";

import { devTimer } from "@/app/ui/hooks/utils/domUtils.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type {
  DiffSkeleton,
  DiffScopeItem,
  LintIssue,
  LintOptions,
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
 * Desktop implementation of the shared USFM-onion seam.
 *
 * Heavy parsing, diffing, and formatting work runs in Tauri Rust commands so
 * large scripture workspaces can stream through native rayon parallelism
 * instead of round-tripping every document into JS.
 */

function toTauriTokenLintOptions(options?: TokenLintOptions) {
  return {
    disabledRules: options?.disabledRules ?? [],
    suppressions: (options?.suppressions ?? []).map((suppression) => ({
      code: suppression.code,
      sid: suppression.sid,
    })),
  };
}

function toTauriLintOptions(options?: LintOptions | null) {
  if (!options) return null;
  return {
    // scope gates the document-level rules in the library; the editor
    // doesn't thread chapter-grain scope yet, so lint the whole book.
    // TODO(lint-scope): thread chapter-grain scope (book-granular today).
    scope: options.scope ?? "book",
    enabledCodes: options.enabledCodes,
    disabledCodes: options.disabledCodes,
    suppressed: options.suppressed,
    allowImplicitChapterContentVerse:
      options.allowImplicitChapterContentVerse ?? false,
  };
}

function toTauriProjectOptions(options?: ProjectUsfmOptions | null) {
  return {
    tokenOptions: {
      mergeHorizontalWhitespace:
        options?.tokenOptions?.mergeHorizontalWhitespace ?? false,
    },
    lintOptions: toTauriLintOptions(options?.lintOptions ?? null),
    includeSourceMd5: options?.includeSourceMd5 ?? false,
  };
}

function tokensEqual(left: Token[], right: Token[]): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    const a = left[i];
    const b = right[i];
    if (!a || !b) return false;
    if (a.id !== b.id) return false;
    if (a.kind !== b.kind) return false;
    if (a.source !== b.source) return false;
    if ((a.sid ?? null) !== (b.sid ?? null)) return false;
    if ((a.marker ?? null) !== (b.marker ?? null)) return false;
  }
  return true;
}

function withFormatChangeFlag(
  originalTokens: Token[],
  result: TokenTransformResult,
): TokenTransformResult {
  return {
    ...result,
    appliedChanges: tokensEqual(originalTokens, result.tokens)
      ? []
      : [
          {
            kind: "formatTokens",
            code: "format-tokens",
            label: "Format tokens",
            labelParams: {},
            targetTokenId: null,
          },
        ],
  };
}

export class TauriUsfmOnionService implements IUsfmOnionService {
  readonly supportsPathIo = true;

  private async lintBatchFromPaths(
    paths: string[],
    options: LintScopeOptions["lintOptions"] = {},
  ): Promise<LintIssue[][]> {
    const results = await invoke<LintIssue[][]>("usfm_onion_lint_paths", {
      paths,
      options: toTauriLintOptions(options),
    });
    return results;
  }

  private async lintTokenBatches(
    tokenBatches: Token[][],
    options: TokenLintOptions = {},
  ): Promise<LintIssue[][]> {
    const end = devTimer(
      `[tauri] lintTokenBatches (batches: ${tokenBatches.length})`,
    );
    const results = await invoke<LintIssue[][]>(
      "usfm_onion_lint_token_batches",
      {
        tokenBatches,
        options: toTauriTokenLintOptions(options),
      },
    );
    end();
    return results;
  }

  private async formatBatchFromPaths(
    paths: string[],
    tokenOptions = { mergeHorizontalWhitespace: false },
  ): Promise<TokenTransformResult[]> {
    return invoke("usfm_onion_format_paths", {
      paths,
      tokenOptions,
    });
  }

  private async formatTokenBatches(
    tokenBatches: Token[][],
  ): Promise<TokenTransformResult[]> {
    const end = devTimer(
      `[tauri] formatTokenBatches (batches: ${tokenBatches.length})`,
    );
    const results = await invoke<TokenTransformResult[]>(
      "usfm_onion_format_token_batches",
      {
        tokenBatches,
      },
    );
    const mapped = results.map((result, index) =>
      withFormatChangeFlag(tokenBatches[index] ?? [], result),
    );
    end();
    return mapped;
  }

  async parseUsfm(
    source: string,
    options: ProjectUsfmOptions = {
      tokenOptions: { mergeHorizontalWhitespace: false },
      lintOptions: null,
    },
  ): Promise<ProjectedUsfmDocument> {
    const end = devTimer(`[tauri] parseUsfm (sourceLength: ${source.length})`);
    const projection = await invoke<ProjectedUsfmDocument>(
      "usfm_onion_project_usfm",
      {
        source,
        options: toTauriProjectOptions(options),
      },
    );
    end();
    return projection;
  }

  async parseUsfmBatchFromPaths(
    paths: string[],
    options: ProjectUsfmOptions = {
      tokenOptions: { mergeHorizontalWhitespace: false },
      lintOptions: null,
    },
  ): Promise<ProjectedUsfmDocument[]> {
    const end = devTimer(
      `[tauri] parseUsfmBatchFromPaths (paths: ${paths.length})`,
    );
    const projections = await invoke<ProjectedUsfmDocument[]>(
      "usfm_onion_project_paths",
      {
        paths,
        options: toTauriProjectOptions(options),
      },
    );
    end();
    return projections;
  }

  async parseUsfmBatchFromContents(
    sources: string[],
    options: ProjectUsfmOptions = {
      tokenOptions: { mergeHorizontalWhitespace: false },
      lintOptions: null,
    },
  ): Promise<ProjectedUsfmDocument[]> {
    return Promise.all(
      sources.map((source) => this.parseUsfm(source, options)),
    );
  }

  async lintExisting(
    tokens: Token[],
    options: TokenLintOptions = {},
  ): Promise<LintIssue[]> {
    const [result] = await this.lintTokenBatches([tokens], options);
    return result ?? [];
  }

  async lintScope(
    scope: TokenScopeItem[],
    options: LintScopeOptions = {},
  ): Promise<LintIssue[][]> {
    if (!scope.length) return [];

    const results: LintIssue[][] = Array.from(
      { length: scope.length },
      () => [],
    );
    const pathIndices: number[] = [];
    const pathArgs: string[] = [];
    const tokenIndices: number[] = [];
    const tokenArgs: Token[][] = [];

    for (let i = 0; i < scope.length; i++) {
      const item = scope[i];
      if (item.tokens) {
        tokenIndices.push(i);
        tokenArgs.push(item.tokens);
        continue;
      }
      if (item.path && this.supportsPathIo) {
        pathIndices.push(i);
        pathArgs.push(item.path);
        continue;
      }
      throw new Error(
        `lintScope item at index ${i} must include non-empty tokens or a path`,
      );
    }

    if (pathArgs.length > 0) {
      const pathResults = await this.lintBatchFromPaths(
        pathArgs,
        options.lintOptions ?? {},
      );
      for (let i = 0; i < pathResults.length; i++) {
        results[pathIndices[i]] = pathResults[i] ?? [];
      }
    }

    if (tokenArgs.length > 0) {
      const tokenResults = await this.lintTokenBatches(
        tokenArgs,
        options.tokenOptions ?? {},
      );
      for (let i = 0; i < tokenResults.length; i++) {
        results[tokenIndices[i]] = tokenResults[i] ?? [];
      }
    }

    return results;
  }

  async formatScope(scope: TokenScopeItem[]): Promise<TokenTransformResult[]> {
    if (!scope.length) return [];

    const results: TokenTransformResult[] = Array.from(
      { length: scope.length },
      () => ({
        tokens: [],
        appliedChanges: [],
        skippedChanges: [],
      }),
    );
    const pathIndices: number[] = [];
    const pathArgs: string[] = [];
    const tokenIndices: number[] = [];
    const tokenArgs: Token[][] = [];

    for (let i = 0; i < scope.length; i++) {
      const item = scope[i];
      if (item.tokens) {
        tokenIndices.push(i);
        tokenArgs.push(item.tokens);
        continue;
      }
      if (item.path && this.supportsPathIo) {
        pathIndices.push(i);
        pathArgs.push(item.path);
        continue;
      }
      throw new Error(
        `formatScope item at index ${i} must include non-empty tokens or a path`,
      );
    }

    if (pathArgs.length > 0) {
      const pathResults = await this.formatBatchFromPaths(pathArgs);
      for (let i = 0; i < pathResults.length; i++) {
        results[pathIndices[i]] = pathResults[i];
      }
    }

    if (tokenArgs.length > 0) {
      const tokenResults = await this.formatTokenBatches(tokenArgs);
      for (let i = 0; i < tokenResults.length; i++) {
        results[tokenIndices[i]] = tokenResults[i];
      }
    }

    return results;
  }

  async applyTokenFixes(
    tokens: Token[],
    fixes: TokenFix[],
  ): Promise<TokenTransformResult> {
    if (!fixes.length) {
      return {
        tokens,
        appliedChanges: [],
        skippedChanges: [],
      };
    }

    const end = devTimer(
      `[tauri] applyTokenFixes (tokens: ${tokens.length}, fixes: ${fixes.length})`,
    );
    let nextTokens = tokens;
    const appliedChanges: TokenTransformResult["appliedChanges"] = [];
    for (const fix of fixes) {
      nextTokens = await invoke("usfm_onion_apply_token_fix", {
        tokens: nextTokens,
        fix,
      });
      appliedChanges.push({
        kind: "applyTokenFix",
        code: fix.code,
        label: fix.label,
        labelParams: fix.labelParams,
        targetTokenId: fix.targetTokenId ?? null,
      });
    }

    end();
    return {
      tokens: nextTokens as Token[],
      appliedChanges,
      skippedChanges: [],
    };
  }

  async diffScope(scope: DiffScopeItem[]): Promise<DiffSkeleton[]> {
    if (!scope.length) return [];
    return Promise.all(
      scope.map((item) =>
        this.diffTokens(item.baselineTokens, item.currentTokens),
      ),
    );
  }

  async diffTokens(
    baselineTokens: readonly Token[],
    currentTokens: readonly Token[],
  ): Promise<DiffSkeleton> {
    const end = devTimer(
      `[tauri] diffTokens (baseline: ${baselineTokens.length}, current: ${currentTokens.length})`,
    );
    const result = invoke<DiffSkeleton>("usfm_onion_diff_tokens", {
      baselineTokens,
      currentTokens,
    });
    end();
    return result;
  }

  async mergeDiffBlocks(
    baselineTokens: readonly Token[],
    currentTokens: readonly Token[],
    request: MergeRequest,
  ): Promise<Token[]> {
    return invoke("usfm_onion_merge_diff_blocks", {
      baselineTokens,
      currentTokens,
      request,
    });
  }
}
