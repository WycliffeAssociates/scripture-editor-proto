import * as onion from "usfm-onion-web";
import { timeInDevAsync } from "@/app/ui/hooks/utils/domUtils.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { LegacyLintableToken as LintableToken } from "@/core/domain/usfm/legacyTokenTypes.ts";
import {
    defaultBuildSidBlocksOptions,
    defaultProjectUsfmOptions,
    defaultTokenLintOptions,
    parseChapterDocumentFromTokens,
    toOnionFlatTokens,
} from "@/core/domain/usfm/usfmOnionAdapters.ts";
import type {
    BatchExecutionOptions,
    BuildSidBlocksOptions,
    Diff,
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
    UsfmMarkerCatalog,
} from "@/core/domain/usfm/usfmOnionTypes.ts";

class UnsupportedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "UnsupportedError";
    }
}

function throwPathIoUnsupported(): never {
    throw new UnsupportedError("Path I/O is desktop-only");
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

function toWebBatchOptions(batchOptions?: BatchExecutionOptions | null) {
    return {
        parallel: batchOptions?.parallel ?? true,
    };
}

function toWebTokenViewOptions(options?: IntoTokensOptions | null) {
    if (!options) return null;
    return {
        whitespacePolicy: "mergeToVisible",
    } as const;
}

function toWebIntoTokensOptions(options?: IntoTokensOptions | null) {
    if (!options) return null;
    return {
        mergeHorizontalWhitespace: options.mergeHorizontalWhitespace ?? false,
    };
}

function toWebLintSuppressions(options?: TokenLintOptions) {
    return (options?.suppressions ?? []).map((suppression) => ({
        code: suppression.code,
        sid: suppression.sid,
    }));
}

function toWebTokenFix(fix: TokenFix) {
    switch (fix.type) {
        case "replaceToken":
            return {
                type: "replaceToken" as const,
                code: fix.code,
                label: fix.label,
                label_params: fix.label_params,
                targetTokenId: fix.targetTokenId,
                replacements: fix.replacements,
            };
        case "deleteToken":
            return {
                type: "deleteToken" as const,
                code: fix.code,
                label: fix.label,
                label_params: fix.label_params,
                targetTokenId: fix.targetTokenId,
            };
        case "insertAfter":
            return {
                type: "insertAfter" as const,
                code: fix.code,
                label: fix.label,
                label_params: fix.label_params,
                targetTokenId: fix.targetTokenId,
                insert: fix.insert,
            };
    }
}

function fromWebTokenFix(fix: {
    type: string;
    code?: string;
    label: string;
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
    const code = fix.code ?? "";
    const labelParams = fix.label_params ?? {};
    if (fix.type === "replaceToken") {
        return {
            type: "replaceToken",
            code,
            label: fix.label,
            label_params: labelParams,
            targetTokenId: fix.targetTokenId,
            replacements: fix.replacements ?? [],
        };
    }
    if (fix.type === "deleteToken") {
        return {
            type: "deleteToken",
            code,
            label: fix.label,
            label_params: labelParams,
            targetTokenId: fix.targetTokenId,
        };
    }
    if (fix.type === "insertAfter") {
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

function toWebTokenLintOptions(options?: TokenLintOptions) {
    return {
        disabledRules: options?.disabledRules ?? [],
        suppressions: toWebLintSuppressions(options),
        allowImplicitChapterContentVerse: false,
    };
}

function toWebLintOptions(options?: LintOptions | null) {
    if (!options) return null;
    return {
        includeParseRecoveries: options.includeParseRecoveries ?? false,
        tokenView: toWebTokenViewOptions(options.tokenView),
        tokenRules: toWebTokenLintOptions(options.tokenRules),
    };
}

function toWebProjectOptions(options?: ProjectUsfmOptions | null) {
    if (!options) return null;
    return {
        tokenOptions: toWebIntoTokensOptions(options.tokenOptions),
        lintOptions: toWebLintOptions(options.lintOptions),
    };
}

function fromWebLintIssue(issue: {
    code: string;
    severity?: string;
    marker?: string | null;
    message: string;
    messageParams?: Record<string, string>;
    span: { start: number; end: number };
    relatedSpan: { start: number; end: number } | null;
    tokenId: string | null;
    relatedTokenId: string | null;
    sid: string | null;
    fix: {
        type: string;
        code?: string;
        label: string;
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
        tokenId: issue.tokenId,
        relatedTokenId: issue.relatedTokenId,
        sid: issue.sid,
        fix: issue.fix ? fromWebTokenFix(issue.fix) : null,
    };
}

type WebLintBatchResult = {
    issues: Array<{
        code: string;
        severity?: string;
        marker?: string | null;
        message: string;
        messageParams?: Record<string, string>;
        span: { start: number; end: number };
        relatedSpan: { start: number; end: number } | null;
        tokenId: string | null;
        relatedTokenId: string | null;
        sid: string | null;
        fix: {
            type: string;
            code?: string;
            label: string;
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
    }>;
};

type WebProjectedDocumentRow = {
    error?: string | null;
    value?: {
        tokens: FlatToken[];
        lintIssues: Array<{
            code: string;
            severity?: string;
            marker?: string | null;
            message: string;
            messageParams?: Record<string, string>;
            span: { start: number; end: number };
            relatedSpan: { start: number; end: number } | null;
            tokenId: string | null;
            relatedTokenId: string | null;
            sid: string | null;
            fix: {
                type: string;
                code?: string;
                label: string;
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
        }> | null;
    } | null;
};

function fromWebTransformResult(result: {
    tokens: Array<{
        id: string;
        kind: string;
        span: { start: number; end: number };
        sid: string | null;
        marker: string | null;
        text: string;
    }>;
    appliedChanges: TokenTransformResult["appliedChanges"];
    skippedChanges: TokenTransformResult["skippedChanges"];
}): TokenTransformResult {
    return {
        tokens: result.tokens,
        appliedChanges: result.appliedChanges,
        skippedChanges: result.skippedChanges,
    };
}

function normalizeDiffTokenChange(
    value: string,
): Diff["originalAlignment"][number]["change"] {
    if (
        value === "added" ||
        value === "deleted" ||
        value === "modified" ||
        value === "unchanged"
    ) {
        return value;
    }
    return "unchanged";
}

function normalizeDiff(diff: Diff): Diff {
    return {
        ...diff,
        originalAlignment: (diff.originalAlignment ?? []).map((entry) => ({
            change: normalizeDiffTokenChange(entry.change),
            counterpartIndex: entry.counterpartIndex ?? null,
        })),
        currentAlignment: (diff.currentAlignment ?? []).map((entry) => ({
            change: normalizeDiffTokenChange(entry.change),
            counterpartIndex: entry.counterpartIndex ?? null,
        })),
        undoSide:
            diff.undoSide === "original" || diff.undoSide === "current"
                ? diff.undoSide
                : "current",
    };
}

function fromWebDiff(diff: {
    blockId: string;
    semanticSid: string;
    status: string;
    originalText: string;
    currentText: string;
    originalTextOnly: string;
    currentTextOnly: string;
    isWhitespaceChange: boolean;
    isUsfmStructureChange: boolean;
    originalTokens: Array<{
        id: string;
        kind: string;
        span: { start: number; end: number };
        sid: string | null;
        marker: string | null;
        text: string;
    }>;
    currentTokens: Array<{
        id: string;
        kind: string;
        span: { start: number; end: number };
        sid: string | null;
        marker: string | null;
        text: string;
    }>;
    originalAlignment?: Array<{
        change: string;
        counterpartIndex: number | null;
    }>;
    currentAlignment?: Array<{
        change: string;
        counterpartIndex: number | null;
    }>;
    undoSide?: string;
}): Diff {
    return normalizeDiff({
        blockId: diff.blockId,
        semanticSid: diff.semanticSid,
        status: diff.status,
        originalText: diff.originalText,
        currentText: diff.currentText,
        originalTextOnly: diff.originalTextOnly,
        currentTextOnly: diff.currentTextOnly,
        isWhitespaceChange: diff.isWhitespaceChange,
        isUsfmStructureChange: diff.isUsfmStructureChange,
        originalTokens: diff.originalTokens,
        currentTokens: diff.currentTokens,
        originalAlignment: (diff.originalAlignment ?? []).map((entry) => ({
            change: normalizeDiffTokenChange(entry.change),
            counterpartIndex: entry.counterpartIndex ?? null,
        })),
        currentAlignment: (diff.currentAlignment ?? []).map((entry) => ({
            change: normalizeDiffTokenChange(entry.change),
            counterpartIndex: entry.counterpartIndex ?? null,
        })),
        undoSide: diff.undoSide === "original" ? "original" : "current",
    });
}

export class WebUsfmOnionService implements IUsfmOnionService {
    readonly supportsPathIo = false;

    async getMarkerCatalog(): Promise<UsfmMarkerCatalog> {
        const allMarkers = onion.allMarkers();
        return {
            allMarkers,
            paragraphMarkers: onion.paragraphMarkers(),
            noteMarkers: onion.noteMarkers(),
            noteSubmarkers: onion.noteSubmarkers(),
            regularCharacterMarkers: allMarkers.filter((marker) =>
                onion.isRegularCharacterMarker(marker),
            ),
            documentMarkers: allMarkers.filter((marker) =>
                onion.isDocumentMarker(marker),
            ),
            chapterVerseMarkers: allMarkers.filter((marker) => {
                const category = onion.markerInfo(marker).category;
                return category === "chapter" || category === "verse";
            }),
        };
    }

    private async lintTokenBatches(
        tokenBatches: Array<Array<LintableToken | FlatToken>>,
        options: TokenLintOptions = defaultTokenLintOptions(),
        batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<LintIssue[][]> {
        return timeInDevAsync(async () => {
            const wasm = onion;
            return wasm
                .lintTokenBatches({
                    tokenBatches: tokenBatches.map((tokens) =>
                        toOnionFlatTokens(tokens),
                    ),
                    options: toWebTokenLintOptions(options),
                    batchOptions: toWebBatchOptions(batchOptions),
                })
                .map((batch: WebLintBatchResult) =>
                    batch.issues
                        .filter(
                            (issue) =>
                                issue.code !== "unknown-marker" &&
                                issue?.marker !== "s5",
                        )
                        .map(fromWebLintIssue),
                );
        }, "web:lintTokenBatches");
    }

    private async formatTokenBatches(
        tokenBatches: FlatToken[][],
        options: FormatOptions = {},
        batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<TokenTransformResult[]> {
        return timeInDevAsync(async () => {
            const wasm = onion;
            return wasm
                .formatTokenBatches({
                    tokenBatches: tokenBatches.map((tokens) =>
                        toOnionFlatTokens(tokens),
                    ),
                    formatOptions: options,
                    batchOptions: toWebBatchOptions(batchOptions),
                })
                .map(fromWebTransformResult);
        }, "web:formatTokenBatches");
    }

    async projectUsfm(
        source: string,
        options: ProjectUsfmOptions = defaultProjectUsfmOptions(),
    ): Promise<ProjectedUsfmDocument> {
        return timeInDevAsync(async () => {
            const wasm = onion;
            const projection = wasm.projectContent({
                source,
                format: "usfm",
                options: toWebProjectOptions(options),
            });
            return {
                tokens: projection.tokens,
                lintIssues:
                    projection.lintIssues?.map(fromWebLintIssue) ?? null,
            };
        }, "web:projectUsfm");
    }

    async projectUsfmBatchFromPaths(
        _paths: string[],
        _options: ProjectUsfmOptions = defaultProjectUsfmOptions(),
        _batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<ProjectedUsfmDocument[]> {
        return throwPathIoUnsupported();
    }

    async projectUsfmBatchFromContents(
        sources: string[],
        options: ProjectUsfmOptions = defaultProjectUsfmOptions(),
        batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<ProjectedUsfmDocument[]> {
        return timeInDevAsync(async () => {
            const wasm = onion;
            return wasm
                .projectContents({
                    sources,
                    format: "usfm",
                    options: toWebProjectOptions(options),
                    batchOptions: toWebBatchOptions(batchOptions),
                })
                .map((row: WebProjectedDocumentRow) => {
                    if (row.error) {
                        throw new Error(row.error);
                    }
                    if (!row.value) {
                        throw new Error("projectContents returned no value");
                    }
                    return {
                        tokens: row.value.tokens,
                        lintIssues:
                            row.value.lintIssues
                                ?.filter(
                                    (issue) =>
                                        issue.code !== "unknown-marker" &&
                                        issue?.marker !== "s5",
                                )
                                ?.map(fromWebLintIssue) ?? null,
                    };
                });
        }, "web:projectUsfmBatchFromContents");
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
            const wasm = onion;
            const toks = toOnionFlatTokens(tokens);
            return wasm
                .lintFlatTokens({
                    tokens: toks,
                    options: toWebTokenLintOptions(options),
                })
                .filter(
                    (issue: { code: string; marker?: string | null }) =>
                        issue.code !== "unknown-marker" &&
                        issue?.marker !== "s5",
                )
                .map(fromWebLintIssue);
        }, "web:lintExisting");
    }

    async lintScope(
        scope: TokenScopeItem[],
        options: LintScopeOptions = {},
    ): Promise<LintIssue[][]> {
        if (!scope.length) return [];
        if (scope.some((item) => item.tokens === undefined)) {
            return throwPathIoUnsupported();
        }
        return this.lintTokenBatches(
            scope.map((item) => item.tokens ?? []),
            options.tokenOptions ?? defaultTokenLintOptions(),
            options.batchOptions,
        );
    }

    async formatScope(
        scope: TokenScopeItem[],
        options: FormatScopeOptions = {},
    ): Promise<TokenTransformResult[]> {
        if (!scope.length) return [];
        if (scope.some((item) => item.tokens === undefined)) {
            return throwPathIoUnsupported();
        }
        return this.formatTokenBatches(
            scope.map((item) => item.tokens ?? []),
            options.formatOptions ?? {},
            options.batchOptions,
        );
    }

    async applyTokenFixes(
        tokens: FlatToken[],
        fixes: TokenFix[],
    ): Promise<TokenTransformResult> {
        return timeInDevAsync(async () => {
            const wasm = onion;
            return fromWebTransformResult(
                wasm.applyTokenFixes({
                    tokens: toOnionFlatTokens(tokens),
                    fixes: fixes.map(toWebTokenFix),
                }),
            );
        }, "web:applyTokenFixes");
    }

    async diffScope(
        scope: DiffScopeItem[],
        options: DiffScopeOptions = {},
    ): Promise<Diff[][]> {
        if (!scope.length) return [];
        if (scope.some((item) => !item.baselineTokens || !item.currentTokens)) {
            return throwPathIoUnsupported();
        }
        return Promise.all(
            scope.map((item) =>
                this.diffTokens(
                    item.baselineTokens ?? [],
                    item.currentTokens ?? [],
                    options.buildOptions ?? defaultBuildSidBlocksOptions(),
                ),
            ),
        );
    }

    async diffTokens(
        baselineTokens: FlatToken[],
        currentTokens: FlatToken[],
        buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
    ): Promise<Diff[]> {
        return timeInDevAsync(async () => {
            const wasm = onion;
            return wasm
                .diffTokens({
                    baselineTokens: toOnionFlatTokens(baselineTokens),
                    currentTokens: toOnionFlatTokens(currentTokens),
                    buildOptions,
                })
                .map(fromWebDiff);
        }, "web:diffTokens");
    }

    async revertDiffBlock(
        baselineTokens: FlatToken[],
        currentTokens: FlatToken[],
        blockId: string,
        buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
    ): Promise<FlatToken[]> {
        return timeInDevAsync(async () => {
            const wasm = onion;
            return wasm.revertDiffBlock({
                blockId,
                baselineTokens: toOnionFlatTokens(baselineTokens),
                currentTokens: toOnionFlatTokens(currentTokens),
                buildOptions,
            });
        }, "web:revertDiffBlock");
    }
}

export const webUsfmOnionService = new WebUsfmOnionService();
