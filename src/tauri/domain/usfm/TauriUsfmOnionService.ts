import { invoke } from "@tauri-apps/api/core";
import { timeInDevAsync } from "@/app/ui/hooks/utils/domUtils.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { LegacyLintableToken as LintableToken } from "@/core/domain/usfm/legacyTokenTypes.ts";
import {
    defaultBuildSidBlocksOptions,
    defaultIntoTokensOptions,
    defaultProjectUsfmOptions,
    defaultTokenLintOptions,
    parseChapterDocumentFromTokens,
    toOnionFlatTokens,
} from "@/core/domain/usfm/usfmOnionAdapters.ts";
import type {
    BatchExecutionOptions,
    BuildSidBlocksOptions,
    Diff,
    DiffPathPair,
    DiffScopeItem,
    DiffScopeOptions,
    FlatToken,
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
    UsfmMarkerCatalog,
} from "@/core/domain/usfm/usfmOnionTypes.ts";

function toTauriBatchOptions(batchOptions?: BatchExecutionOptions | null) {
    return {
        parallel: batchOptions?.parallel ?? true,
    };
}

function toTauriTokenViewOptions(options?: IntoTokensOptions | null) {
    return {
        mergeHorizontalWhitespace: options?.mergeHorizontalWhitespace ?? false,
    };
}

function toTauriLintSuppressions(options?: TokenLintOptions) {
    return (options?.suppressions ?? []).map((suppression) => ({
        code: suppression.code,
        sid: suppression.sid,
    }));
}

function toTauriTokenLintOptions(options?: TokenLintOptions) {
    return {
        disabledRules: options?.disabledRules ?? [],
        suppressions: toTauriLintSuppressions(options),
    };
}

function toTauriLintOptions(options?: LintOptions | null) {
    if (!options) return null;
    return {
        includeParseRecoveries: options.includeParseRecoveries ?? false,
        tokenView: toTauriTokenViewOptions(options.tokenView),
        tokenRules: toTauriTokenLintOptions(options.tokenRules),
    };
}

function toTauriProjectOptions(options?: ProjectUsfmOptions | null) {
    return {
        tokenOptions: toTauriTokenViewOptions(options?.tokenOptions),
        lintOptions: toTauriLintOptions(options?.lintOptions ?? null),
    };
}

function toTauriTokenFix(fix: TokenFix) {
    switch (fix.type) {
        case "replaceToken":
            return {
                kind: "replaceToken" as const,
                code: fix.code,
                label: fix.label,
                labelParams: fix.label_params,
                targetTokenId: fix.targetTokenId,
                replacements: fix.replacements,
            };
        case "deleteToken":
            return {
                kind: "deleteToken" as const,
                code: fix.code,
                label: fix.label,
                labelParams: fix.label_params,
                targetTokenId: fix.targetTokenId,
            };
        case "insertAfter":
            return {
                kind: "insertAfter" as const,
                code: fix.code,
                label: fix.label,
                labelParams: fix.label_params,
                targetTokenId: fix.targetTokenId,
                insert: fix.insert,
            };
    }
}

function fromTauriTokenFix(fix: {
    kind?: string;
    type?: string;
    code?: string;
    label: string;
    labelParams?: Record<string, string>;
    label_params?: Record<string, string>;
    targetTokenId: string;
    replacements?: Array<{
        kind: string;
        text: string;
        marker: string | null;
        sid: string | null;
    }>;
    insert?: Array<{
        kind: string;
        text: string;
        marker: string | null;
        sid: string | null;
    }>;
}): TokenFix | null {
    const type = fix.kind ?? fix.type;
    const code = fix.code ?? "";
    const labelParams = fix.labelParams ?? fix.label_params ?? {};
    if (type === "replaceToken") {
        return {
            type: "replaceToken",
            code,
            label: fix.label,
            label_params: labelParams,
            targetTokenId: fix.targetTokenId,
            replacements: fix.replacements ?? [],
        };
    }
    if (type === "deleteToken") {
        return {
            type: "deleteToken",
            code,
            label: fix.label,
            label_params: labelParams,
            targetTokenId: fix.targetTokenId,
        };
    }
    if (type === "insertAfter") {
        return {
            type: "insertAfter",
            code,
            label: fix.label,
            label_params: labelParams,
            targetTokenId: fix.targetTokenId,
            insert: fix.insert ?? [],
        };
    }
    return null;
}

function fromTauriLintIssue(issue: {
    code: string;
    severity?: string;
    marker?: string | null;
    message: string;
    messageParams?: Record<string, string>;
    span: { start: number; end: number };
    relatedSpan?: { start: number; end: number } | null;
    tokenId?: string | null;
    relatedTokenId?: string | null;
    sid?: string | null;
    fix?: {
        kind?: string;
        type?: string;
        code?: string;
        label: string;
        labelParams?: Record<string, string>;
        label_params?: Record<string, string>;
        targetTokenId: string;
        replacements?: Array<{
            kind: string;
            text: string;
            marker: string | null;
            sid: string | null;
        }>;
        insert?: Array<{
            kind: string;
            text: string;
            marker: string | null;
            sid: string | null;
        }>;
    } | null;
}): LintIssue {
    return {
        code: issue.code,
        severity: issue.severity ?? "warning",
        marker: issue.marker ?? null,
        message: issue.message,
        messageParams: issue.messageParams ?? {},
        span: {
            start: issue.span.start,
            end: issue.span.end,
        },
        relatedSpan: issue.relatedSpan
            ? {
                  start: issue.relatedSpan.start,
                  end: issue.relatedSpan.end,
              }
            : null,
        tokenId: issue.tokenId ?? null,
        relatedTokenId: issue.relatedTokenId ?? null,
        sid: issue.sid ?? null,
        fix: issue.fix ? fromTauriTokenFix(issue.fix) : null,
    };
}

function shouldKeepLintIssue(issue: { code: string; marker?: string | null }) {
    return issue.code !== "unknown-marker" || issue.marker !== "s5";
}

function stripSyntheticChapterTokens(
    parsed: ParsedUsfmDocument,
    bookCode: string,
    syntheticChapter: number,
): ParsedUsfmDocument {
    const chapterTokens = parsed.chapters[syntheticChapter] ?? [];
    const syntheticSid = `${bookCode} ${syntheticChapter}:0`;
    const filteredChapterTokens = chapterTokens.filter((token, index) => {
        if (
            index === 0 &&
            token.tokenType === "marker" &&
            token.marker === "c"
        ) {
            return false;
        }
        if (
            index === 1 &&
            token.tokenType === "numberRange" &&
            token.sid === syntheticSid
        ) {
            return false;
        }
        return true;
    });

    return {
        ...parsed,
        chapters: {
            ...parsed.chapters,
            [syntheticChapter]: filteredChapterTokens,
        },
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
        const results = await invoke<
            Array<
                Array<{
                    code: string;
                    severity?: string;
                    marker?: string | null;
                    message: string;
                    messageParams?: Record<string, string>;
                    span: { start: number; end: number };
                    relatedSpan?: { start: number; end: number } | null;
                    tokenId?: string | null;
                    relatedTokenId?: string | null;
                    sid?: string | null;
                    fix?: {
                        kind?: string;
                        type?: string;
                        code?: string;
                        label: string;
                        labelParams?: Record<string, string>;
                        label_params?: Record<string, string>;
                        targetTokenId: string;
                        replacements?: Array<{
                            kind: string;
                            text: string;
                            marker: string | null;
                            sid: string | null;
                        }>;
                        insert?: Array<{
                            kind: string;
                            text: string;
                            marker: string | null;
                            sid: string | null;
                        }>;
                    } | null;
                }>
            >
        >("usfm_onion_lint_paths", {
            paths,
            options: toTauriLintOptions(options),
            batchOptions: toTauriBatchOptions(batchOptions),
        });
        return results.map((batch) =>
            batch.filter(shouldKeepLintIssue).map(fromTauriLintIssue),
        );
    }

    private async lintTokenBatches(
        tokenBatches: Array<Array<LintableToken | FlatToken>>,
        options: TokenLintOptions = defaultTokenLintOptions(),
        batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<LintIssue[][]> {
        return timeInDevAsync(async () => {
            const results = await invoke<
                Array<
                    Array<{
                        code: string;
                        severity?: string;
                        marker?: string | null;
                        message: string;
                        messageParams?: Record<string, string>;
                        span: { start: number; end: number };
                        relatedSpan?: { start: number; end: number } | null;
                        tokenId?: string | null;
                        relatedTokenId?: string | null;
                        sid?: string | null;
                        fix?: {
                            kind?: string;
                            type?: string;
                            code?: string;
                            label: string;
                            labelParams?: Record<string, string>;
                            label_params?: Record<string, string>;
                            targetTokenId: string;
                            replacements?: Array<{
                                kind: string;
                                text: string;
                                marker: string | null;
                                sid: string | null;
                            }>;
                            insert?: Array<{
                                kind: string;
                                text: string;
                                marker: string | null;
                                sid: string | null;
                            }>;
                        } | null;
                    }>
                >
            >("usfm_onion_lint_token_batches", {
                tokenBatches: tokenBatches.map((tokens) =>
                    toOnionFlatTokens(tokens),
                ),
                options: toTauriTokenLintOptions(options),
                batchOptions: toTauriBatchOptions(batchOptions),
            });
            return results.map((batch) =>
                batch.filter(shouldKeepLintIssue).map(fromTauriLintIssue),
            );
        }, `[tauri] lintTokenBatches (batches: ${tokenBatches.length})`);
    }

    private async formatBatchFromPaths(
        paths: string[],
        tokenOptions: IntoTokensOptions = defaultIntoTokensOptions(),
        formatOptions: FormatScopeOptions["formatOptions"] = {},
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
        tokenBatches: FlatToken[][],
        options: FormatScopeOptions["formatOptions"] = {},
        batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<TokenTransformResult[]> {
        return timeInDevAsync(
            async () =>
                invoke("usfm_onion_format_token_batches", {
                    tokenBatches: tokenBatches.map((tokens) =>
                        toOnionFlatTokens(tokens),
                    ),
                    options,
                    batchOptions: toTauriBatchOptions(batchOptions),
                }),
            `[tauri] formatTokenBatches (batches: ${tokenBatches.length})`,
        );
    }

    private async diffBatchFromPathPairs(
        pathPairs: DiffPathPair[],
        tokenOptions: IntoTokensOptions = defaultIntoTokensOptions(),
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
        options: ProjectUsfmOptions = defaultProjectUsfmOptions(),
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
        options: ProjectUsfmOptions = defaultProjectUsfmOptions(),
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
        options: ProjectUsfmOptions = defaultProjectUsfmOptions(),
        batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<ProjectedUsfmDocument[]> {
        return timeInDevAsync(
            async () =>
                Promise.all(
                    sources.map((source) => this.projectUsfm(source, options)),
                ),
            `[tauri] projectUsfmBatchFromContents (sources: ${sources.length}, parallel: ${batchOptions.parallel ?? true})`,
        );
    }

    async parseUsfmChapter(
        chapterUsfm: string,
        bookCode: string,
    ): Promise<ParsedUsfmDocument> {
        const hasExplicitChapter = /^\s*\\c\b/mu.test(chapterUsfm);
        const syntheticChapter = 1;
        const synthetic = hasExplicitChapter
            ? `\\id ${bookCode}\n${chapterUsfm}`
            : `\\id ${bookCode}\n\\c ${syntheticChapter}\n${chapterUsfm}`;
        const projected = await this.projectUsfm(synthetic, {
            lintOptions: null,
        });
        const parsed = parseChapterDocumentFromTokens(projected.tokens);
        return hasExplicitChapter
            ? parsed
            : stripSyntheticChapterTokens(parsed, bookCode, syntheticChapter);
    }

    async lintExisting<T extends LintableToken | FlatToken>(
        tokens: T[],
        options: TokenLintOptions = defaultTokenLintOptions(),
    ): Promise<LintIssue[]> {
        return timeInDevAsync(async () => {
            const results = await invoke<
                Array<{
                    code: string;
                    severity?: string;
                    marker?: string | null;
                    message: string;
                    messageParams?: Record<string, string>;
                    span: { start: number; end: number };
                    relatedSpan?: { start: number; end: number } | null;
                    tokenId?: string | null;
                    relatedTokenId?: string | null;
                    sid?: string | null;
                    fix?: {
                        kind?: string;
                        type?: string;
                        code?: string;
                        label: string;
                        labelParams?: Record<string, string>;
                        label_params?: Record<string, string>;
                        targetTokenId: string;
                        replacements?: Array<{
                            kind: string;
                            text: string;
                            marker: string | null;
                            sid: string | null;
                        }>;
                        insert?: Array<{
                            kind: string;
                            text: string;
                            marker: string | null;
                            sid: string | null;
                        }>;
                    } | null;
                }>
            >("usfm_onion_lint_tokens", {
                tokens: toOnionFlatTokens(tokens),
                options: toTauriTokenLintOptions(options),
            });
            return results.filter(shouldKeepLintIssue).map(fromTauriLintIssue);
        }, `[tauri] lintExisting (tokens: ${tokens.length})`);
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
                options.batchOptions,
            );
            for (let i = 0; i < pathResults.length; i++) {
                results[pathIndices[i]] = pathResults[i] ?? [];
            }
        }

        if (tokenArgs.length > 0) {
            const tokenResults = await this.lintTokenBatches(
                tokenArgs,
                options.tokenOptions ?? defaultTokenLintOptions(),
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
        tokens: FlatToken[],
        fixes: TokenFix[],
    ): Promise<TokenTransformResult> {
        return timeInDevAsync(
            async () =>
                invoke("usfm_onion_apply_token_fixes", {
                    tokens: toOnionFlatTokens(tokens),
                    fixes: fixes.map(toTauriTokenFix),
                }),
            `[tauri] applyTokenFixes (tokens: ${tokens.length}, fixes: ${fixes.length})`,
        );
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
        baselineTokens: FlatToken[],
        currentTokens: FlatToken[],
        buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
    ): Promise<Diff[]> {
        return timeInDevAsync(
            async () =>
                invoke("usfm_onion_diff_tokens", {
                    baselineTokens: toOnionFlatTokens(baselineTokens),
                    currentTokens: toOnionFlatTokens(currentTokens),
                    buildOptions,
                }),
            `[tauri] diffTokens (baseline: ${baselineTokens.length}, current: ${currentTokens.length})`,
        );
    }

    async revertDiffBlock(
        baselineTokens: FlatToken[],
        currentTokens: FlatToken[],
        blockId: string,
        buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
    ): Promise<FlatToken[]> {
        return timeInDevAsync(
            async () =>
                invoke("usfm_onion_revert_diff_block", {
                    baselineTokens: toOnionFlatTokens(baselineTokens),
                    currentTokens: toOnionFlatTokens(currentTokens),
                    blockId,
                    buildOptions,
                }),
            `[tauri] revertDiffBlock (blockId: ${blockId}, baseline: ${baselineTokens.length}, current: ${currentTokens.length})`,
        );
    }
}
