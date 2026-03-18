import * as onion from "usfm-onion-web";
import { timeInDevAsync } from "@/app/ui/hooks/utils/domUtils.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import { defaultBuildSidBlocksOptions } from "@/core/domain/usfm/usfmOnionAdapters.ts";
import type {
    BatchExecutionOptions,
    BuildSidBlocksOptions,
    Diff,
    DiffScopeItem,
    DiffScopeOptions,
    FormatScopeOptions,
    LintIssue,
    LintOptions,
    LintScopeOptions,
    MarkerInfo,
    ParsedUsfm,
    ProjectedUsfmDocument,
    ProjectUsfmOptions,
    Token,
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

function shouldKeepLintIssue(issue: { code: string; marker?: string | null }) {
    return issue.code !== "unknown-marker" || issue.marker !== "s5";
}

function toWebTokenLintOptions(
    options?: TokenLintOptions | null,
): onion.LintOptions | undefined {
    if (!options) return undefined;
    return {
        disabledCodes: (options.disabledRules ?? []) as onion.LintCode[],
        suppressed: (options.suppressions ?? []).map((suppression) => ({
            code: suppression.code as onion.LintCode,
            sid: suppression.sid,
        })),
        allowImplicitChapterContentVerse: false,
    };
}

function toWebProjectLintOptions(
    options?: LintOptions | null,
): onion.LintOptions | undefined {
    if (!options) return undefined;
    return {
        enabledCodes: options.enabledCodes,
        disabledCodes: options.disabledCodes ?? [],
        suppressed: options.suppressed ?? [],
        allowImplicitChapterContentVerse:
            options.allowImplicitChapterContentVerse ?? false,
    };
}

function fromWebLintIssue(issue: onion.LintIssue): LintIssue {
    return {
        code: issue.code,
        severity: issue.severity,
        marker: issue.marker ?? null,
        message: issue.message,
        messageParams: {},
        span: issue.span ?? null,
        relatedSpan: issue.relatedSpan ?? null,
        tokenId: issue.tokenId ?? null,
        relatedTokenId: issue.relatedTokenId ?? null,
        sid: issue.sid ?? null,
        fix: (issue as onion.LintIssue & { fix?: TokenFix | null }).fix ?? null,
    };
}

function buildMarkerCatalog(raw: onion.UsfmMarkerCatalog): UsfmMarkerCatalog {
    const allInfo = raw.all();
    const infoByMarker = Object.fromEntries(
        allInfo.map(
            (info) => [info.marker, info] satisfies [string, MarkerInfo],
        ),
    );
    const allMarkers = allInfo.map((info) => info.marker);
    const paragraphMarkers = allInfo
        .filter((info) => info.category === "paragraph")
        .map((info) => info.marker);
    const noteMarkers = allInfo
        .filter((info) => info.category === "noteContainer")
        .map((info) => info.marker);
    const noteSubmarkers = allInfo
        .filter((info) => info.category === "noteSubmarker")
        .map((info) => info.marker);
    const regularCharacterMarkers = allInfo
        .filter((info) => info.category === "character")
        .map((info) => info.marker);
    const documentMarkers = allInfo
        .filter((info) => info.category === "document")
        .map((info) => info.marker);
    const chapterVerseMarkers = allInfo
        .filter(
            (info) => info.category === "chapter" || info.category === "verse",
        )
        .map((info) => info.marker);

    return {
        raw,
        allMarkers,
        paragraphMarkers,
        noteMarkers,
        noteSubmarkers,
        regularCharacterMarkers,
        documentMarkers,
        chapterVerseMarkers,
        infoByMarker,
    };
}

function parsedToProjectedDocument(
    parsed: ParsedUsfm,
    options: ProjectUsfmOptions,
): ProjectedUsfmDocument {
    const lintIssues = options.lintOptions
        ? parsed
              .lint(toWebProjectLintOptions(options.lintOptions))
              .issues.filter(shouldKeepLintIssue)
              .map(fromWebLintIssue)
        : null;
    return {
        tokens: parsed.tokens(),
        lintIssues,
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

function formatTokensToTransformResult(
    originalTokens: Token[],
    result: onion.FormatResult,
): TokenTransformResult {
    const nextTokens = result.tokens;
    return {
        tokens: nextTokens,
        appliedChanges: tokensEqual(originalTokens, nextTokens)
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
        skippedChanges: [],
    };
}

function fromRawDiff(diff: onion.ChapterTokenDiff): Diff {
    return {
        blockId: diff.blockId,
        semanticSid: diff.semanticSid,
        status: diff.status,
        original: diff.original,
        current: diff.current,
        originalText: diff.originalText,
        currentText: diff.currentText,
        originalTextOnly: diff.originalTextOnly,
        currentTextOnly: diff.currentTextOnly,
        isWhitespaceChange: diff.isWhitespaceChange,
        isUsfmStructureChange: diff.isUsfmStructureChange,
        originalTokens: diff.originalTokens,
        currentTokens: diff.currentTokens,
        originalAlignment: (diff.originalAlignment ?? []).map((entry) => ({
            change: entry.change,
            counterpartIndex: entry.counterpartIndex ?? null,
        })),
        currentAlignment: (diff.currentAlignment ?? []).map((entry) => ({
            change: entry.change,
            counterpartIndex: entry.counterpartIndex ?? null,
        })),
        undoSide: diff.undoSide,
    };
}

export class WebUsfmOnionService implements IUsfmOnionService {
    readonly supportsPathIo = false;

    async getMarkerCatalog(): Promise<UsfmMarkerCatalog> {
        return buildMarkerCatalog(onion.markerCatalog());
    }

    async projectUsfm(
        source: string,
        options: ProjectUsfmOptions = {
            tokenOptions: { mergeHorizontalWhitespace: false },
            lintOptions: null,
        },
    ): Promise<ProjectedUsfmDocument> {
        return timeInDevAsync(async () => {
            const parsed = onion.parse(source);
            return parsedToProjectedDocument(parsed, options);
        }, "web:projectUsfm");
    }

    async projectUsfmBatchFromPaths(
        _paths: string[],
        _options: ProjectUsfmOptions = {
            tokenOptions: { mergeHorizontalWhitespace: false },
            lintOptions: null,
        },
        _batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<ProjectedUsfmDocument[]> {
        return throwPathIoUnsupported();
    }

    async projectUsfmBatchFromContents(
        sources: string[],
        options: ProjectUsfmOptions = {
            tokenOptions: { mergeHorizontalWhitespace: false },
            lintOptions: null,
        },
        _batchOptions: BatchExecutionOptions = { parallel: true },
    ): Promise<ProjectedUsfmDocument[]> {
        return timeInDevAsync(async () => {
            const parsedBatch = onion.parseBatch(sources);
            return parsedBatch
                .items()
                .map((parsed) => parsedToProjectedDocument(parsed, options));
        }, "web:projectUsfmBatchFromContents");
    }

    async lintExisting(
        tokens: Token[],
        options: TokenLintOptions = {},
    ): Promise<LintIssue[]> {
        return timeInDevAsync(async () => {
            const [result] = onion.lintTokenBatch(
                [tokens],
                toWebTokenLintOptions(options),
            );
            return (result?.issues ?? [])
                .filter(shouldKeepLintIssue)
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
        return timeInDevAsync(async () => {
            const tokenBatches = scope.map((item) => item.tokens ?? []);
            const lintOptions =
                options.lintOptions?.tokenRules ?? options.tokenOptions ?? {};
            return onion
                .lintTokenBatch(
                    tokenBatches,
                    toWebTokenLintOptions(lintOptions),
                )
                .map((result) =>
                    result.issues
                        .filter(shouldKeepLintIssue)
                        .map(fromWebLintIssue),
                );
        }, "web:lintScope");
    }

    async formatScope(
        scope: TokenScopeItem[],
        options: FormatScopeOptions = {},
    ): Promise<TokenTransformResult[]> {
        if (!scope.length) return [];
        if (scope.some((item) => item.tokens === undefined)) {
            return throwPathIoUnsupported();
        }
        return timeInDevAsync(async () => {
            const inputTokenBatches = scope.map((item) => item.tokens ?? []);
            return onion
                .formatTokenBatch(inputTokenBatches, options.formatOptions)
                .map((result, index) =>
                    formatTokensToTransformResult(
                        inputTokenBatches[index] ?? [],
                        result,
                    ),
                );
        }, "web:formatScope");
    }

    async applyTokenFixes(
        tokens: Token[],
        fixes: TokenFix[],
    ): Promise<TokenTransformResult> {
        return timeInDevAsync(async () => {
            if (!fixes.length) {
                return {
                    tokens,
                    appliedChanges: [],
                    skippedChanges: [],
                };
            }
            const wasm = onion as typeof onion & {
                applyTokenFix: (
                    tokens: onion.Token[],
                    fix: TokenFix,
                ) => onion.Token[];
            };
            let nextTokens = tokens;
            const appliedChanges: TokenTransformResult["appliedChanges"] = [];
            for (const fix of fixes) {
                nextTokens = wasm.applyTokenFix(nextTokens, fix);
                appliedChanges.push({
                    kind: "applyTokenFix",
                    code: fix.code,
                    label: fix.label,
                    labelParams: fix.labelParams,
                    targetTokenId: fix.targetTokenId ?? null,
                });
            }
            return {
                tokens: nextTokens,
                appliedChanges,
                skippedChanges: [],
            };
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
        baselineTokens: Token[],
        currentTokens: Token[],
        buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
    ): Promise<Diff[]> {
        return timeInDevAsync(async () => {
            return onion
                .diffTokens(baselineTokens, currentTokens, buildOptions)
                .map(fromRawDiff);
        }, "web:diffTokens");
    }

    async revertDiffBlock(
        baselineTokens: Token[],
        currentTokens: Token[],
        blockId: string,
        buildOptions: BuildSidBlocksOptions = defaultBuildSidBlocksOptions(),
    ): Promise<Token[]> {
        return timeInDevAsync(async () => {
            return onion.revertDiffBlock(
                baselineTokens,
                currentTokens,
                blockId,
                buildOptions,
            );
        }, "web:revertDiffBlock");
    }
}

export const webUsfmOnionService = new WebUsfmOnionService();
