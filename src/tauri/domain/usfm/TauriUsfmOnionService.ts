import { invoke } from "@tauri-apps/api/core";
import { timeInDevAsync } from "@/app/ui/hooks/utils/domUtils.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import { defaultBuildSidBlocksOptions } from "@/core/domain/usfm/usfmOnionAdapters.ts";
import type {
    BatchExecutionOptions,
    BuildSidBlocksOptions,
    Diff,
    DiffPathPair,
    DiffScopeItem,
    DiffScopeOptions,
    FormatOptions,
    FormatScopeOptions,
    LintIssue,
    LintOptions,
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

function toTauriBatchOptions(batchOptions?: BatchExecutionOptions | null) {
    return {
        parallel: batchOptions?.parallel ?? true,
    };
}

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
    };
}

function shouldKeepLintIssue(issue: { code: string; marker?: string | null }) {
    return issue.code !== "unknown-marker" || issue.marker !== "s5";
}

function fromTauriLintIssue(issue: {
    code: string;
    severity?: string;
    marker?: string | null;
    message: string;
    span?: { start: number; end: number } | null;
    relatedSpan?: { start: number; end: number } | null;
    tokenId?: string | null;
    relatedTokenId?: string | null;
    sid?: string | null;
    fix?: TokenFix | null;
}): LintIssue {
    return {
        code: issue.code,
        severity: issue.severity ?? "warning",
        marker: issue.marker ?? null,
        message: issue.message,
        messageParams: {},
        span: issue.span ?? null,
        relatedSpan: issue.relatedSpan ?? null,
        tokenId: issue.tokenId ?? null,
        relatedTokenId: issue.relatedTokenId ?? null,
        sid: issue.sid ?? null,
        fix: issue.fix ?? null,
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
        if (a.text !== b.text) return false;
        if ((a.sid ?? null) !== (b.sid ?? null)) return false;
        if ((a.marker ?? null) !== (b.marker ?? null)) return false;
        if (
            (a.span?.start ?? null) !== (b.span?.start ?? null) ||
            (a.span?.end ?? null) !== (b.span?.end ?? null)
        ) {
            return false;
        }
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

    async getMarkerCatalog(): Promise<UsfmMarkerCatalog> {
        return invoke("usfm_onion_marker_catalog");
    }

    private async lintBatchFromPaths(
        paths: string[],
        options: LintScopeOptions["lintOptions"] = {},
        batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<LintIssue[][]> {
        const results = await invoke<LintIssue[][]>("usfm_onion_lint_paths", {
            paths,
            options: toTauriLintOptions(options),
            batchOptions: toTauriBatchOptions(batchOptions),
        });
        return results.map((batch) =>
            batch.filter(shouldKeepLintIssue).map(fromTauriLintIssue),
        );
    }

    private async lintTokenBatches(
        tokenBatches: Token[][],
        options: TokenLintOptions = {},
        batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<LintIssue[][]> {
        return timeInDevAsync(async () => {
            const results = await invoke<LintIssue[][]>(
                "usfm_onion_lint_token_batches",
                {
                    tokenBatches,
                    options: toTauriTokenLintOptions(options),
                    batchOptions: toTauriBatchOptions(batchOptions),
                },
            );
            return results.map((batch) =>
                batch.filter(shouldKeepLintIssue).map(fromTauriLintIssue),
            );
        }, `[tauri] lintTokenBatches (batches: ${tokenBatches.length})`);
    }

    private async formatBatchFromPaths(
        paths: string[],
        tokenOptions = { mergeHorizontalWhitespace: false },
        formatOptions: FormatOptions = {},
        batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<TokenTransformResult[]> {
        return invoke("usfm_onion_format_paths", {
            paths,
            tokenOptions,
            formatOptions,
            batchOptions: toTauriBatchOptions(batchOptions),
        });
    }

    private async formatTokenBatches(
        tokenBatches: Token[][],
        options: FormatOptions = {},
        batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<TokenTransformResult[]> {
        return timeInDevAsync(async () => {
            const results = await invoke<TokenTransformResult[]>(
                "usfm_onion_format_token_batches",
                {
                    tokenBatches,
                    options,
                    batchOptions: toTauriBatchOptions(batchOptions),
                },
            );
            return results.map((result, index) =>
                withFormatChangeFlag(tokenBatches[index] ?? [], result),
            );
        }, `[tauri] formatTokenBatches (batches: ${tokenBatches.length})`);
    }

    private async diffBatchFromPathPairs(
        pathPairs: DiffPathPair[],
        tokenOptions = { mergeHorizontalWhitespace: false },
        buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
        batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<Diff[][]> {
        return invoke("usfm_onion_diff_path_pairs", {
            pathPairs,
            tokenOptions,
            buildOptions,
            batchOptions: toTauriBatchOptions(batchOptions),
        });
    }

    async projectUsfm(
        source: string,
        options: ProjectUsfmOptions = {
            tokenOptions: { mergeHorizontalWhitespace: false },
            lintOptions: null,
        },
    ): Promise<ProjectedUsfmDocument> {
        return timeInDevAsync(async () => {
            const projection = await invoke<ProjectedUsfmDocument>(
                "usfm_onion_project_usfm",
                {
                    source,
                    options: toTauriProjectOptions(options),
                },
            );
            return {
                ...projection,
                lintIssues:
                    projection.lintIssues
                        ?.filter(shouldKeepLintIssue)
                        .map(fromTauriLintIssue) ?? null,
            };
        }, `[tauri] projectUsfm (sourceLength: ${source.length})`);
    }

    async projectUsfmBatchFromPaths(
        paths: string[],
        options: ProjectUsfmOptions = {
            tokenOptions: { mergeHorizontalWhitespace: false },
            lintOptions: null,
        },
        batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<ProjectedUsfmDocument[]> {
        return timeInDevAsync(async () => {
            const projections = await invoke<ProjectedUsfmDocument[]>(
                "usfm_onion_project_paths",
                {
                    paths,
                    options: toTauriProjectOptions(options),
                    batchOptions: toTauriBatchOptions(batchOptions),
                },
            );
            return projections.map((projection) => ({
                ...projection,
                lintIssues:
                    projection.lintIssues
                        ?.filter(shouldKeepLintIssue)
                        .map(fromTauriLintIssue) ?? null,
            }));
        }, `[tauri] projectUsfmBatchFromPaths (paths: ${paths.length})`);
    }

    async projectUsfmBatchFromContents(
        sources: string[],
        options: ProjectUsfmOptions = {
            tokenOptions: { mergeHorizontalWhitespace: false },
            lintOptions: null,
        },
        _batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<ProjectedUsfmDocument[]> {
        return Promise.all(
            sources.map((source) => this.projectUsfm(source, options)),
        );
    }

    async lintExisting(
        tokens: Token[],
        options: TokenLintOptions = {},
    ): Promise<LintIssue[]> {
        const [result] = await this.lintTokenBatches([tokens], options, {
            parallel: true,
        });
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
                options.batchOptions,
            );
            for (let i = 0; i < pathResults.length; i++) {
                results[pathIndices[i]] = pathResults[i] ?? [];
            }
        }

        if (tokenArgs.length > 0) {
            const tokenResults = await this.lintTokenBatches(
                tokenArgs,
                options.tokenOptions ?? {},
                options.batchOptions,
            );
            for (let i = 0; i < tokenResults.length; i++) {
                results[tokenIndices[i]] = tokenResults[i] ?? [];
            }
        }

        return results;
    }

    async formatScope(
        scope: TokenScopeItem[],
        options: FormatScopeOptions = {},
    ): Promise<TokenTransformResult[]> {
        if (!scope.length) return [];

        const results: TokenTransformResult[] = Array.from(
            { length: scope.length },
            () => ({ tokens: [], appliedChanges: [], skippedChanges: [] }),
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
            const pathResults = await this.formatBatchFromPaths(
                pathArgs,
                {
                    mergeHorizontalWhitespace:
                        options.tokenOptions?.mergeHorizontalWhitespace ??
                        false,
                },
                options.formatOptions ?? {},
                options.batchOptions,
            );
            for (let i = 0; i < pathResults.length; i++) {
                results[pathIndices[i]] = pathResults[i];
            }
        }

        if (tokenArgs.length > 0) {
            const tokenResults = await this.formatTokenBatches(
                tokenArgs,
                options.formatOptions ?? {},
                options.batchOptions,
            );
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

        return timeInDevAsync(async () => {
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

            return {
                tokens: nextTokens as Token[],
                appliedChanges,
                skippedChanges: [],
            };
        }, `[tauri] applyTokenFixes (tokens: ${tokens.length}, fixes: ${fixes.length})`);
    }

    async diffScope(
        scope: DiffScopeItem[],
        options: DiffScopeOptions = {},
    ): Promise<Diff[][]> {
        if (!scope.length) return [];

        const results: Diff[][] = Array.from(
            { length: scope.length },
            () => [],
        );
        const pathIndices: number[] = [];
        const pathPairs: DiffPathPair[] = [];
        const tokenIndices: number[] = [];
        const tokenPairs: Array<{
            baseline: Token[];
            current: Token[];
        }> = [];

        for (let i = 0; i < scope.length; i++) {
            const item = scope[i];
            if (item.baselineTokens && item.currentTokens) {
                tokenIndices.push(i);
                tokenPairs.push({
                    baseline: item.baselineTokens,
                    current: item.currentTokens,
                });
                continue;
            }
            if (item.baselinePath && item.currentPath && this.supportsPathIo) {
                pathIndices.push(i);
                pathPairs.push({
                    baselinePath: item.baselinePath,
                    currentPath: item.currentPath,
                });
                continue;
            }
            throw new Error(
                `diffScope item at index ${i} must include baseline/current tokens or baseline/current paths`,
            );
        }

        if (pathPairs.length > 0) {
            const pathResults = await this.diffBatchFromPathPairs(
                pathPairs,
                {
                    mergeHorizontalWhitespace:
                        options.tokenOptions?.mergeHorizontalWhitespace ??
                        false,
                },
                options.buildOptions ?? defaultBuildSidBlocksOptions(),
                options.batchOptions,
            );
            for (let i = 0; i < pathResults.length; i++) {
                results[pathIndices[i]] = pathResults[i] ?? [];
            }
        }

        if (tokenPairs.length > 0) {
            const tokenResults = await Promise.all(
                tokenPairs.map((pair) =>
                    this.diffTokens(
                        pair.baseline,
                        pair.current,
                        options.buildOptions ?? defaultBuildSidBlocksOptions(),
                    ),
                ),
            );
            for (let i = 0; i < tokenResults.length; i++) {
                results[tokenIndices[i]] = tokenResults[i] ?? [];
            }
        }

        return results;
    }

    async diffTokens(
        baselineTokens: Token[],
        currentTokens: Token[],
        buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
    ): Promise<Diff[]> {
        return timeInDevAsync(async () => {
            return invoke("usfm_onion_diff_tokens", {
                baselineTokens,
                currentTokens,
                buildOptions,
            });
        }, `[tauri] diffTokens (baseline: ${baselineTokens.length}, current: ${currentTokens.length})`);
    }

    async revertDiffBlock(
        baselineTokens: Token[],
        currentTokens: Token[],
        blockId: string,
        buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
    ): Promise<Token[]> {
        return invoke("usfm_onion_revert_diff_block", {
            baselineTokens,
            currentTokens,
            blockId,
            buildOptions,
        });
    }
}
