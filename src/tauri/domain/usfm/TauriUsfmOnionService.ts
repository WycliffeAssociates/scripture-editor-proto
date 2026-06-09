import { invoke } from "@tauri-apps/api/core";
import { timeInDevAsync } from "@/app/ui/hooks/utils/domUtils.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import { defaultBuildSidBlocksOptions } from "@/core/domain/usfm/usfmOnionAdapters.ts";
import type {
    BuildSidBlocksOptions,
    Diff,
    DiffPathPair,
    DiffScopeItem,
    DiffScopeOptions,
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
        // TODO(lint-scope): thread chapter-grain scope (deferred; see agent-tmp/ideas).
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
        return timeInDevAsync(async () => {
            const results = await invoke<LintIssue[][]>(
                "usfm_onion_lint_token_batches",
                {
                    tokenBatches,
                    options: toTauriTokenLintOptions(options),
                },
            );
            return results;
        }, `[tauri] lintTokenBatches (batches: ${tokenBatches.length})`);
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
        return timeInDevAsync(async () => {
            const results = await invoke<TokenTransformResult[]>(
                "usfm_onion_format_token_batches",
                {
                    tokenBatches,
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
    ): Promise<Diff[][]> {
        return invoke("usfm_onion_diff_path_pairs", {
            pathPairs,
            tokenOptions,
            buildOptions,
        });
    }

    async parseUsfm(
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
            return projection;
        }, `[tauri] parseUsfm (sourceLength: ${source.length})`);
    }

    async parseUsfmBatchFromPaths(
        paths: string[],
        options: ProjectUsfmOptions = {
            tokenOptions: { mergeHorizontalWhitespace: false },
            lintOptions: null,
        },
    ): Promise<ProjectedUsfmDocument[]> {
        return timeInDevAsync(async () => {
            const projections = await invoke<ProjectedUsfmDocument[]>(
                "usfm_onion_project_paths",
                {
                    paths,
                    options: toTauriProjectOptions(options),
                },
            );
            return projections;
        }, `[tauri] parseUsfmBatchFromPaths (paths: ${paths.length})`);
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

    async formatScope(
        scope: TokenScopeItem[],
    ): Promise<TokenTransformResult[]> {
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
