import type { LintableToken } from "@/core/data/usfm/lint.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import { applyRevertByBlockId } from "@/core/domain/usfm/sidBlockRevert.ts";
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

let wasmModulePromise: Promise<typeof import("usfm-onion-web")> | null = null;

async function loadWasmModule() {
    wasmModulePromise ??= (async () => {
        const mod = await import("usfm-onion-web");
        await mod.default();
        return mod;
    })();

    return wasmModulePromise;
}

class UnsupportedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "UnsupportedError";
    }
}

function throwPathIoUnsupported(): never {
    throw new UnsupportedError("Path I/O is desktop-only");
}

function toWebFlatToken(token: FlatToken) {
    return {
        id: token.id,
        kind: token.kind,
        span: {
            start: token.spanStart,
            end: token.spanEnd,
        },
        sid: token.sid,
        marker: token.marker,
        text: token.text,
    };
}

function fromWebFlatToken(token: {
    id: string;
    kind: string;
    span: { start: number; end: number };
    sid: string | null;
    marker: string | null;
    text: string;
}): FlatToken {
    return {
        id: token.id,
        kind: token.kind,
        spanStart: token.span.start,
        spanEnd: token.span.end,
        sid: token.sid,
        marker: token.marker,
        text: token.text,
    };
}

function toWebFlatTokens(tokens: FlatToken[]) {
    return tokens.map(toWebFlatToken);
}

function toWebTokenViewOptions(options?: IntoTokensOptions | null) {
    if (!options) return null;
    return {
        whitespacePolicy: options.mergeHorizontalWhitespace
            ? "mergeToVisible"
            : "preserve",
    } as const;
}

function toWebLintSuppressions(options?: TokenLintOptions) {
    return (options?.suppressions ?? []).map((suppression) => ({
        code: suppression.code,
        spanStart: suppression.span.start,
        spanEnd: suppression.span.end,
    }));
}

function toWebTokenLintOptions(options?: TokenLintOptions) {
    return {
        disabledRules: options?.disabledRules ?? [],
        suppressions: toWebLintSuppressions(options),
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
        tokenOptions: options.tokenOptions ?? null,
        lintOptions: toWebLintOptions(options.lintOptions),
    };
}

function normalizeUsjDocument(document: Record<string, unknown>): UsjDocument {
    const lossless = document._lossless_roundtrip;
    if (!lossless) return document as unknown as UsjDocument;
    return {
        ...(document as unknown as UsjDocument),
        _dovetail_roundtrip: lossless as UsjDocument["_dovetail_roundtrip"],
    };
}

function denormalizeUsjDocument(
    document: UsjDocument,
): Record<string, unknown> {
    const { _dovetail_roundtrip, ...rest } = document as UsjDocument &
        Record<string, unknown>;
    if (!_dovetail_roundtrip) return rest;
    return {
        ...rest,
        _lossless_roundtrip: _dovetail_roundtrip,
    };
}

function fromWebLintIssue(issue: {
    code: string;
    message: string;
    span: { start: number; end: number };
    relatedSpan: { start: number; end: number } | null;
    tokenId: string | null;
    relatedTokenId: string | null;
    sid: string | null;
}): LintIssue {
    return {
        code: issue.code,
        message: issue.message,
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
        fix: null,
    };
}

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
        tokens: result.tokens.map(fromWebFlatToken),
        appliedChanges: result.appliedChanges,
        skippedChanges: result.skippedChanges,
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
    originalAlignment?: Diff["originalAlignment"];
    currentAlignment?: Diff["currentAlignment"];
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
        originalTokens: diff.originalTokens.map(fromWebFlatToken),
        currentTokens: diff.currentTokens.map(fromWebFlatToken),
        originalAlignment: diff.originalAlignment ?? [],
        currentAlignment: diff.currentAlignment ?? [],
        undoSide: diff.undoSide === "original" ? "original" : "current",
    });
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

export class WebUsfmOnionService implements IUsfmOnionService {
    readonly supportsPathIo = false;

    async projectUsfm(
        source: string,
        options: ProjectUsfmOptions = defaultProjectUsfmOptions(),
    ): Promise<ProjectedUsfmDocument> {
        const wasm = await loadWasmModule();
        const projection = wasm.projectContent({
            source,
            format: "usfm",
            options: toWebProjectOptions(options),
        });
        return {
            tokens: projection.tokens.map(fromWebFlatToken),
            editorTree: projection.editorTree,
            lintIssues: projection.lintIssues?.map(fromWebLintIssue) ?? null,
        };
    }

    async projectUsfmFromPath(
        _path: string,
        _options: ProjectUsfmOptions = defaultProjectUsfmOptions(),
    ): Promise<ProjectedUsfmDocument> {
        return throwPathIoUnsupported();
    }

    async projectUsfmBatchFromPaths(
        _paths: string[],
        _options: ProjectUsfmOptions = defaultProjectUsfmOptions(),
        _batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<ProjectedUsfmDocument[]> {
        return throwPathIoUnsupported();
    }

    async tokensFromUsfm(
        source: string,
        options: IntoTokensOptions = defaultIntoTokensOptions(),
    ): Promise<FlatToken[]> {
        const wasm = await loadWasmModule();
        return wasm
            .intoTokensFromContent({
                source,
                format: "usfm",
                tokenOptions: options,
            })
            .map(fromWebFlatToken);
    }

    async tokensFromPath(
        _path: string,
        _options: IntoTokensOptions = defaultIntoTokensOptions(),
    ): Promise<FlatToken[]> {
        return throwPathIoUnsupported();
    }

    async tokensFromExisting<T extends LintableToken>(
        tokens: T[],
    ): Promise<FlatToken[]> {
        return flatTokensFromLintableTokens(tokens);
    }

    async parseUsfm(source: string): Promise<ParsedUsfmDocument> {
        return usjDocumentToParsedUsfmDocument(await this.toUsj(source));
    }

    async parseUsfmChapter(
        chapterUsfm: string,
        bookCode: string,
    ): Promise<ParsedUsfmDocument> {
        const synthetic = `\\id ${bookCode}\n${chapterUsfm}`;
        return parseChapterDocumentFromUsj(await this.toUsj(synthetic));
    }

    async lintUsfm(
        source: string,
        options: LintOptions = {},
    ): Promise<LintIssue[]> {
        const wasm = await loadWasmModule();
        return wasm
            .lintContent({
                source,
                format: "usfm",
                options: toWebLintOptions(options),
            })
            .map(fromWebLintIssue);
    }

    async lintPath(
        _path: string,
        _options: LintOptions = {},
    ): Promise<LintIssue[]> {
        return throwPathIoUnsupported();
    }

    async lintBatchFromPaths(
        _paths: string[],
        _options: LintOptions = {},
        _batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<LintIssue[][]> {
        return throwPathIoUnsupported();
    }

    async lintExisting<T extends LintableToken | FlatToken>(
        tokens: T[],
        options: TokenLintOptions = defaultTokenLintOptions(),
    ): Promise<LintIssue[]> {
        const wasm = await loadWasmModule();
        return wasm
            .lintFlatTokens({
                tokens: toWebFlatTokens(toOnionFlatTokens(tokens)),
                options: toWebTokenLintOptions(options),
            })
            .map(fromWebLintIssue);
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

    async lintTokenBatches<T extends LintableToken | FlatToken>(
        tokenBatches: T[][],
        options: TokenLintOptions = defaultTokenLintOptions(),
        _batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<LintIssue[][]> {
        const wasm = await loadWasmModule();
        return wasm
            .lintFlatTokenBatches({
                tokenBatches: tokenBatches.map((tokens) =>
                    toWebFlatTokens(toOnionFlatTokens(tokens)),
                ),
                options: toWebTokenLintOptions(options),
                batchOptions: {},
            })
            .map((batch) => batch.issues.map(fromWebLintIssue));
    }

    async formatTokens(
        tokens: FlatToken[],
        options: FormatOptions = {},
    ): Promise<TokenTransformResult> {
        const wasm = await loadWasmModule();
        return fromWebTransformResult(
            wasm.formatFlatTokens({
                tokens: toWebFlatTokens(tokens),
                formatOptions: options,
            }),
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

    async formatTokenBatches(
        tokenBatches: FlatToken[][],
        options: FormatOptions = {},
        _batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<TokenTransformResult[]> {
        const wasm = await loadWasmModule();
        return wasm
            .formatFlatTokenBatches({
                tokenBatches: tokenBatches.map(toWebFlatTokens),
                formatOptions: options,
                batchOptions: {},
            })
            .map(fromWebTransformResult);
    }

    async formatBatchFromPaths(
        _paths: string[],
        _tokenOptions: IntoTokensOptions = defaultIntoTokensOptions(),
        _formatOptions: FormatOptions = {},
        _batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<TokenTransformResult[]> {
        return throwPathIoUnsupported();
    }

    async applyTokenFixes(
        tokens: FlatToken[],
        fixes: TokenFix[],
    ): Promise<TokenTransformResult> {
        const wasm = await loadWasmModule();
        return fromWebTransformResult(
            wasm.applyTokenFixes({
                tokens: toWebFlatTokens(tokens),
                fixes,
            }),
        );
    }

    async diffUsfm(
        baselineUsfm: string,
        currentUsfm: string,
        tokenOptions: IntoTokensOptions = defaultIntoTokensOptions(),
        buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
    ): Promise<Diff[]> {
        const wasm = await loadWasmModule();
        return wasm
            .diffUsfm({
                baselineUsfm,
                currentUsfm,
                tokenView: toWebTokenViewOptions(tokenOptions),
                buildOptions,
            })
            .map(fromWebDiff);
    }

    async diffPaths(
        _baselinePath: string,
        _currentPath: string,
        _tokenOptions: IntoTokensOptions = defaultIntoTokensOptions(),
        _buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
    ): Promise<Diff[]> {
        return throwPathIoUnsupported();
    }

    async diffUsfmByChapter(
        baselineUsfm: string,
        currentUsfm: string,
        tokenOptions: IntoTokensOptions = defaultIntoTokensOptions(),
        buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
    ): Promise<ChapterDiffEntry[]> {
        const wasm = await loadWasmModule();
        return wasm
            .diffUsfmByChapter({
                baselineUsfm,
                currentUsfm,
                tokenView: toWebTokenViewOptions(tokenOptions),
                buildOptions,
            })
            .map((entry) => ({
                bookCode: entry.book,
                chapterNum: entry.chapter,
                diffs: entry.diffs.map(fromWebDiff),
            }));
    }

    async diffPathsByChapter(
        _baselinePath: string,
        _currentPath: string,
        _tokenOptions: IntoTokensOptions = defaultIntoTokensOptions(),
        _buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
    ): Promise<ChapterDiffEntry[]> {
        return throwPathIoUnsupported();
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

    async diffBatchFromPathPairs(
        _pathPairs: DiffPathPair[],
        _tokenOptions: IntoTokensOptions = defaultIntoTokensOptions(),
        _buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
        _batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<Diff[][]> {
        return throwPathIoUnsupported();
    }

    async diffTokens(
        baselineTokens: FlatToken[],
        currentTokens: FlatToken[],
        buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
    ): Promise<Diff[]> {
        const wasm = await loadWasmModule();
        return wasm
            .diffTokens({
                baselineTokens: toWebFlatTokens(baselineTokens),
                currentTokens: toWebFlatTokens(currentTokens),
                buildOptions,
            })
            .map(fromWebDiff);
    }

    async revertDiffBlock(
        baselineTokens: FlatToken[],
        currentTokens: FlatToken[],
        blockId: string,
        buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
    ): Promise<FlatToken[]> {
        return applyRevertByBlockId({
            baselineTokens,
            currentTokens,
            diffBlockId: blockId,
            buildOptions,
        });
    }

    async toUsj(source: string): Promise<UsjDocument> {
        const wasm = await loadWasmModule();
        const parsed = wasm.parseContent({
            source,
            format: "usfm",
        });
        return normalizeUsjDocument(
            wasm.intoUsjLossless(parsed) as unknown as Record<string, unknown>,
        );
    }

    async toUsjFromPath(_path: string): Promise<UsjDocument> {
        return throwPathIoUnsupported();
    }

    async toUsjBatchFromPaths(
        _paths: string[],
        _batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<UsjDocument[]> {
        return throwPathIoUnsupported();
    }

    async fromUsj(document: UsjDocument): Promise<string> {
        const wasm = await loadWasmModule();
        return wasm.fromUsj(
            denormalizeUsjDocument(document) as unknown as Parameters<
                typeof wasm.fromUsj
            >[0],
        );
    }

    async toUsx(source: string): Promise<string> {
        const wasm = await loadWasmModule();
        return wasm.usfmToUsx(source);
    }

    async toUsxFromPath(_path: string): Promise<string> {
        return throwPathIoUnsupported();
    }

    async toUsxBatchFromPaths(
        _paths: string[],
        _batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<string[]> {
        return throwPathIoUnsupported();
    }

    async fromUsx(value: string): Promise<string> {
        const wasm = await loadWasmModule();
        return wasm.fromUsx(value);
    }

    async toVref(source: string): Promise<VrefEntry[]> {
        const wasm = await loadWasmModule();
        const parsed = wasm.parseContent({
            source,
            format: "usfm",
        });
        return wasm.intoVref(parsed);
    }

    async toVrefFromPath(_path: string): Promise<VrefEntry[]> {
        return throwPathIoUnsupported();
    }

    async toVrefBatchFromPaths(
        _paths: string[],
        _batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<VrefEntry[][]> {
        return throwPathIoUnsupported();
    }

    async diffPaths(
        _baselinePath: string,
        _currentPath: string,
        _tokenOptions: IntoTokensOptions = defaultIntoTokensOptions(),
        _buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
    ): Promise<Diff[]> {
        return throwPathIoUnsupported();
    }

    async diffPathsByChapter(
        _baselinePath: string,
        _currentPath: string,
        _tokenOptions: IntoTokensOptions = defaultIntoTokensOptions(),
        _buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
    ): Promise<ChapterDiffEntry[]> {
        return throwPathIoUnsupported();
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

    async diffBatchFromPathPairs(
        _pathPairs: DiffPathPair[],
        _tokenOptions: IntoTokensOptions = defaultIntoTokensOptions(),
        _buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
        _batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<Diff[][]> {
        return throwPathIoUnsupported();
    }

    async toUsj(source: string): Promise<UsjDocument> {
        const wasm = await loadWasmModule();
        return wasm.toUsj(source);
    }

    async toUsjFromPath(_path: string): Promise<UsjDocument> {
        return throwPathIoUnsupported();
    }

    async toUsjBatchFromPaths(
        _paths: string[],
        _batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<UsjDocument[]> {
        return throwPathIoUnsupported();
    }

    async fromUsj(document: UsjDocument): Promise<string> {
        const wasm = await loadWasmModule();
        return wasm.fromUsj(document);
    }

    async toUsx(source: string): Promise<string> {
        const wasm = await loadWasmModule();
        return wasm.toUsx(source);
    }

    async toUsxFromPath(_path: string): Promise<string> {
        return throwPathIoUnsupported();
    }

    async toUsxBatchFromPaths(
        _paths: string[],
        _batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<string[]> {
        return throwPathIoUnsupported();
    }

    async fromUsx(value: string): Promise<string> {
        const wasm = await loadWasmModule();
        return wasm.fromUsx(value);
    }

    async toVref(source: string): Promise<VrefEntry[]> {
        const wasm = await loadWasmModule();
        return wasm.toVref(source);
    }

    async toVrefFromPath(_path: string): Promise<VrefEntry[]> {
        return throwPathIoUnsupported();
    }

    async toVrefBatchFromPaths(
        _paths: string[],
        _batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<VrefEntry[][]> {
        return throwPathIoUnsupported();
    }
}

export const webUsfmOnionService = new WebUsfmOnionService();
