import { invoke } from "@tauri-apps/api/core";
import type { LintableToken } from "@/core/data/usfm/lint.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import {
    defaultBuildSidBlocksOptions,
    defaultIntoTokensOptions,
    defaultProjectUsfmOptions,
    defaultTokenLintOptions,
    flatTokensFromLintableTokens,
    parseChapterDocumentFromUsj,
    toOnionFlatTokens,
    usjDocumentToParsedUsfmDocument,
} from "@/core/domain/usfm/usfmOnionAdapters.ts";
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

export class TauriUsfmOnionService implements IUsfmOnionService {
    readonly supportsPathIo = true;

    private normalizeBatchOptions(batchOptions?: BatchExecutionOptions) {
        return {
            parallel: batchOptions?.parallel ?? true,
        };
    }

    async projectUsfm(
        source: string,
        options: ProjectUsfmOptions = defaultProjectUsfmOptions(),
    ): Promise<ProjectedUsfmDocument> {
        return invoke("usfm_onion_project_usfm", { source, options });
    }

    async projectUsfmFromPath(
        path: string,
        options: ProjectUsfmOptions = defaultProjectUsfmOptions(),
    ): Promise<ProjectedUsfmDocument> {
        return invoke("usfm_onion_project_path", { path, options });
    }

    async projectUsfmBatchFromPaths(
        paths: string[],
        options: ProjectUsfmOptions = defaultProjectUsfmOptions(),
        batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<ProjectedUsfmDocument[]> {
        return invoke("usfm_onion_project_paths", {
            paths,
            options,
            batchOptions,
        });
    }

    async tokensFromUsfm(
        source: string,
        options: IntoTokensOptions = defaultIntoTokensOptions(),
    ): Promise<FlatToken[]> {
        return invoke("usfm_onion_tokens_from_usfm", { source, options });
    }

    async tokensFromPath(
        path: string,
        options: IntoTokensOptions = defaultIntoTokensOptions(),
    ): Promise<FlatToken[]> {
        return invoke("usfm_onion_tokens_from_path", { path, options });
    }

    async tokensFromExisting<T extends LintableToken>(
        tokens: T[],
    ): Promise<FlatToken[]> {
        return flatTokensFromLintableTokens(tokens);
    }

    async parseUsfm(source: string): Promise<ParsedUsfmDocument> {
        const usj = await this.toUsj(source);
        return usjDocumentToParsedUsfmDocument(usj);
    }

    async parseUsfmChapter(
        chapterUsfm: string,
        bookCode: string,
    ): Promise<ParsedUsfmDocument> {
        const synthetic = `\\id ${bookCode}\n${chapterUsfm}`;
        const usj = await this.toUsj(synthetic);
        return parseChapterDocumentFromUsj(usj);
    }

    async lintUsfm(
        source: string,
        options: LintOptions = {},
    ): Promise<LintIssue[]> {
        return invoke("usfm_onion_lint_usfm", { source, options });
    }

    async lintPath(
        path: string,
        options: LintOptions = {},
    ): Promise<LintIssue[]> {
        return invoke("usfm_onion_lint_path", { path, options });
    }

    async lintBatchFromPaths(
        paths: string[],
        options: LintOptions = {},
        batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<LintIssue[][]> {
        return invoke("usfm_onion_lint_paths", {
            paths,
            options,
            batchOptions,
        });
    }

    async lintExisting<T extends LintableToken | FlatToken>(
        tokens: T[],
        options: TokenLintOptions = defaultTokenLintOptions(),
    ): Promise<LintIssue[]> {
        return invoke("usfm_onion_lint_tokens", {
            tokens: toOnionFlatTokens(tokens),
            options,
        });
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
        const tokenArgs: FlatToken[][] = [];

        for (let i = 0; i < scope.length; i++) {
            const item = scope[i];
            if (item.tokens) {
                tokenIndices.push(i);
                tokenArgs.push(toOnionFlatTokens(item.tokens));
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
                this.normalizeBatchOptions(options.batchOptions),
            );
            for (let i = 0; i < pathResults.length; i++) {
                results[pathIndices[i]] = pathResults[i] ?? [];
            }
        }

        if (tokenArgs.length > 0) {
            const tokenResults = await this.lintTokenBatches(
                tokenArgs,
                options.tokenOptions ?? defaultTokenLintOptions(),
                this.normalizeBatchOptions(options.batchOptions),
            );
            for (let i = 0; i < tokenResults.length; i++) {
                results[tokenIndices[i]] = tokenResults[i] ?? [];
            }
        }

        return results;
    }

    async lintTokenBatches<T extends LintableToken | FlatToken>(
        tokenBatches: T[][],
        options: TokenLintOptions = defaultTokenLintOptions(),
        batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<LintIssue[][]> {
        return invoke("usfm_onion_lint_token_batches", {
            tokenBatches: tokenBatches.map((tokens) =>
                toOnionFlatTokens(tokens),
            ),
            options,
            batchOptions,
        });
    }

    async formatTokens(
        tokens: FlatToken[],
        options: FormatOptions = {},
    ): Promise<TokenTransformResult> {
        return invoke("usfm_onion_format_tokens", { tokens, options });
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
        const tokenArgs: FlatToken[][] = [];

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
                options.tokenOptions ?? defaultIntoTokensOptions(),
                options.formatOptions ?? {},
                this.normalizeBatchOptions(options.batchOptions),
            );
            for (let i = 0; i < pathResults.length; i++) {
                results[pathIndices[i]] = pathResults[i];
            }
        }

        if (tokenArgs.length > 0) {
            const tokenResults = await this.formatTokenBatches(
                tokenArgs,
                options.formatOptions ?? {},
                this.normalizeBatchOptions(options.batchOptions),
            );
            for (let i = 0; i < tokenResults.length; i++) {
                results[tokenIndices[i]] = tokenResults[i];
            }
        }

        return results;
    }

    async formatTokenBatches(
        tokenBatches: FlatToken[][],
        options: FormatOptions = {},
        batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<TokenTransformResult[]> {
        return invoke("usfm_onion_format_token_batches", {
            tokenBatches,
            options,
            batchOptions,
        });
    }

    async formatBatchFromPaths(
        paths: string[],
        tokenOptions: IntoTokensOptions = defaultIntoTokensOptions(),
        formatOptions: FormatOptions = {},
        batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<TokenTransformResult[]> {
        return invoke("usfm_onion_format_paths", {
            paths,
            tokenOptions,
            formatOptions,
            batchOptions,
        });
    }

    async applyTokenFixes(
        tokens: FlatToken[],
        fixes: TokenFix[],
    ): Promise<TokenTransformResult> {
        return invoke("usfm_onion_apply_token_fixes", { tokens, fixes });
    }

    async diffUsfm(
        baselineUsfm: string,
        currentUsfm: string,
        tokenOptions: IntoTokensOptions = defaultIntoTokensOptions(),
        buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
    ): Promise<Diff[]> {
        return invoke("usfm_onion_diff_usfm", {
            baselineUsfm,
            currentUsfm,
            tokenOptions,
            buildOptions,
        });
    }

    async diffPaths(
        baselinePath: string,
        currentPath: string,
        tokenOptions: IntoTokensOptions = defaultIntoTokensOptions(),
        buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
    ): Promise<Diff[]> {
        return invoke("usfm_onion_diff_paths", {
            baselinePath,
            currentPath,
            tokenOptions,
            buildOptions,
        });
    }

    async diffUsfmByChapter(
        baselineUsfm: string,
        currentUsfm: string,
        tokenOptions: IntoTokensOptions = defaultIntoTokensOptions(),
        buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
    ): Promise<ChapterDiffEntry[]> {
        return invoke("usfm_onion_diff_usfm_by_chapter", {
            baselineUsfm,
            currentUsfm,
            tokenOptions,
            buildOptions,
        });
    }

    async diffPathsByChapter(
        baselinePath: string,
        currentPath: string,
        tokenOptions: IntoTokensOptions = defaultIntoTokensOptions(),
        buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
    ): Promise<ChapterDiffEntry[]> {
        return invoke("usfm_onion_diff_paths_by_chapter", {
            baselinePath,
            currentPath,
            tokenOptions,
            buildOptions,
        });
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
            baseline: FlatToken[];
            current: FlatToken[];
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
                options.tokenOptions ?? defaultIntoTokensOptions(),
                options.buildOptions ?? defaultBuildSidBlocksOptions(),
                this.normalizeBatchOptions(options.batchOptions),
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

    async diffBatchFromPathPairs(
        pathPairs: DiffPathPair[],
        tokenOptions: IntoTokensOptions = defaultIntoTokensOptions(),
        buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
        batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<Diff[][]> {
        return invoke("usfm_onion_diff_path_pairs", {
            pathPairs,
            tokenOptions,
            buildOptions,
            batchOptions,
        });
    }

    async diffTokens(
        baselineTokens: FlatToken[],
        currentTokens: FlatToken[],
        buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
    ): Promise<Diff[]> {
        return invoke("usfm_onion_diff_tokens", {
            baselineTokens,
            currentTokens,
            buildOptions,
        });
    }

    async revertDiffBlock(
        baselineTokens: FlatToken[],
        currentTokens: FlatToken[],
        blockId: string,
        buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
    ): Promise<FlatToken[]> {
        return invoke("usfm_onion_revert_diff_block", {
            baselineTokens,
            currentTokens,
            blockId,
            buildOptions,
        });
    }

    async toUsj(source: string): Promise<UsjDocument> {
        return invoke("usfm_onion_to_usj", { source });
    }

    async toUsjFromPath(path: string): Promise<UsjDocument> {
        return invoke("usfm_onion_to_usj_path", { path });
    }

    async toUsjBatchFromPaths(
        paths: string[],
        batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<UsjDocument[]> {
        return invoke("usfm_onion_to_usj_paths", { paths, batchOptions });
    }

    async fromUsj(document: UsjDocument): Promise<string> {
        return invoke("usfm_onion_from_usj", { document });
    }

    async toUsx(source: string): Promise<string> {
        return invoke("usfm_onion_to_usx", { source });
    }

    async toUsxFromPath(path: string): Promise<string> {
        return invoke("usfm_onion_to_usx_path", { path });
    }

    async toUsxBatchFromPaths(
        paths: string[],
        batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<string[]> {
        return invoke("usfm_onion_to_usx_paths", { paths, batchOptions });
    }

    async fromUsx(value: string): Promise<string> {
        return invoke("usfm_onion_from_usx", { value });
    }

    async toVref(source: string): Promise<VrefEntry[]> {
        return invoke("usfm_onion_to_vref", { source });
    }

    async toVrefFromPath(path: string): Promise<VrefEntry[]> {
        return invoke("usfm_onion_to_vref_path", { path });
    }

    async toVrefBatchFromPaths(
        paths: string[],
        batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<VrefEntry[][]> {
        return invoke("usfm_onion_to_vref_paths", { paths, batchOptions });
    }
}
