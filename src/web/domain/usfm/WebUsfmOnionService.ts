import * as onion from "usfm-onion-web";

import { devTimer } from "@/app/ui/hooks/utils/domUtils.ts";
import { webMd5Service } from "@/core/domain/md5/webMd5.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type {
  DiffSkeleton,
  DiffScopeItem,
  FormatScopeOptions,
  LintIssue,
  LintOptions,
  LintScopeOptions,
  MarkerInfo,
  MergeRequest,
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

/**
 * Browser implementation of the shared USFM-onion seam.
 *
 * Web builds run the wasm parser in-process against token arrays or file
 * contents. Path-based IO is desktop-only and rejected with an
 * {@link UnsupportedError} here.
 */

// WYSIWYG (Reading) profile: same as the wasm default except structural
// linebreaks are omitted so paragraph blocks flow continuously the way the
// rendered editor surface displays them.
const WYSIWYG_FORMAT_OPTIONS: onion.FormatOptions = {
  insertStructuralLinebreaks: false,
};

class UnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedError";
  }
}

function throwPathIoUnsupported(): never {
  throw new UnsupportedError("Path I/O is desktop-only");
}

// scope is required by the library and gates the document-level rules. The
// editor doesn't thread chapter-grain scope yet, so we lint the whole book —
// preserving today's behavior.
const WHOLE_BOOK_SCOPE: onion.LintScope = "book";

// Best-effort book ref from a token stream's first sid ("GEN 1:1" → "GEN"),
// for dev-timer labels only — the call site already holds these tokens.
const bookOf = (tokens?: readonly Token[]): string =>
  tokens?.find((t) => t.sid)?.sid?.split(" ")[0] ?? "?";

function toWebTokenLintOptions(
  options?: TokenLintOptions | null,
): onion.LintOptions {
  return {
    scope: WHOLE_BOOK_SCOPE,
    disabledCodes: (options?.disabledRules ?? []) as onion.LintCode[],
    suppressed: (options?.suppressions ?? []).map((suppression) => ({
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
    scope: options.scope ?? WHOLE_BOOK_SCOPE,
    enabledCodes: options.enabledCodes,
    disabledCodes: options.disabledCodes ?? [],
    suppressed: options.suppressed ?? [],
    allowImplicitChapterContentVerse:
      options.allowImplicitChapterContentVerse ?? false,
  };
}

function buildMarkerCatalog(raw: onion.UsfmMarkerCatalog): UsfmMarkerCatalog {
  const allInfo = raw.all();
  const infoByMarker = Object.fromEntries(
    allInfo.map((info) => [info.marker, info] satisfies [string, MarkerInfo]),
  );
  const allMarkers: string[] = [];
  const paragraphMarkers: string[] = [];
  const noteMarkers: string[] = [];
  const noteSubmarkers: string[] = [];
  const regularCharacterMarkers: string[] = [];
  const documentMarkers: string[] = [];
  const chapterVerseMarkers: string[] = [];
  for (const info of allInfo) {
    allMarkers.push(info.marker);
    if (info.category === "paragraph") paragraphMarkers.push(info.marker);
    else if (info.category === "noteContainer") noteMarkers.push(info.marker);
    else if (info.category === "noteSubmarker")
      noteSubmarkers.push(info.marker);
    else if (info.category === "character")
      regularCharacterMarkers.push(info.marker);
    else if (info.category === "document") documentMarkers.push(info.marker);
    else if (info.category === "chapter" || info.category === "verse")
      chapterVerseMarkers.push(info.marker);
  }

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
    ? parsed.lint(
        toWebProjectLintOptions(options.lintOptions) ?? {
          scope: WHOLE_BOOK_SCOPE,
        },
      ).issues
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
    if (a.source !== b.source) return false;
    if ((a.sid ?? null) !== (b.sid ?? null)) return false;
    if ((a.marker ?? null) !== (b.marker ?? null)) return false;
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

export class WebUsfmOnionService implements IUsfmOnionService {
  readonly supportsPathIo = false;

  async getMarkerCatalog(): Promise<UsfmMarkerCatalog> {
    return buildMarkerCatalog(onion.markerCatalog());
  }

  async parseUsfm(
    source: string,
    options: ProjectUsfmOptions = {
      tokenOptions: { mergeHorizontalWhitespace: false },
      lintOptions: null,
    },
  ): Promise<ProjectedUsfmDocument> {
    const end = devTimer(`web:parseUsfm (${source.length} chars)`);
    const parsed = onion.parse(source);
    const result = parsedToProjectedDocument(parsed, options);
    end();
    return result;
  }

  async parseUsfmBatchFromPaths(
    _paths: string[],
    _options: ProjectUsfmOptions = {
      tokenOptions: { mergeHorizontalWhitespace: false },
      lintOptions: null,
    },
  ): Promise<ProjectedUsfmDocument[]> {
    return throwPathIoUnsupported();
  }

  async parseUsfmBatchFromContents(
    sources: string[],
    options: ProjectUsfmOptions = {
      tokenOptions: { mergeHorizontalWhitespace: false },
      lintOptions: null,
    },
  ): Promise<ProjectedUsfmDocument[]> {
    const end = devTimer(
      `web:parseUsfmBatchFromContents (${sources.length} files)`,
    );
    const result = Promise.all(
      sources.map(async (source) => {
        const doc = parsedToProjectedDocument(onion.parse(source), options);
        // Hash the source string we already hold in JS — the single
        // read happened upstream (loadForWeb), so no extra IO.
        if (options.includeSourceMd5) {
          doc.sourceMd5 = await webMd5Service.calculateMd5(source);
        }
        return doc;
      }),
    );
    end();
    return result;
  }

  async lintExisting(
    tokens: Token[],
    options: TokenLintOptions = {},
  ): Promise<LintIssue[]> {
    const end = devTimer(`web:lintExisting ${bookOf(tokens)}`);
    const result = onion.lintTokens(tokens, toWebTokenLintOptions(options));
    end();
    return result.issues;
  }

  async lintScope(
    scope: TokenScopeItem[],
    options: LintScopeOptions = {},
  ): Promise<LintIssue[][]> {
    if (!scope.length) return [];
    if (scope.some((item) => item.tokens === undefined)) {
      return throwPathIoUnsupported();
    }
    const end = devTimer(
      `web:lintScope ${bookOf(scope[0]?.tokens)} (${scope.length} ch)`,
    );
    const lintOptions =
      options.lintOptions?.tokenRules ?? options.tokenOptions ?? {};
    const webLintOptions = toWebTokenLintOptions(lintOptions);
    const result = Promise.all(
      scope.map(
        async (item) =>
          onion.lintTokens(item.tokens ?? [], webLintOptions).issues,
      ),
    );
    end();
    return result;
  }

  async formatScope(
    scope: TokenScopeItem[],
    _options: FormatScopeOptions = {},
  ): Promise<TokenTransformResult[]> {
    if (!scope.length) return [];
    if (scope.some((item) => item.tokens === undefined)) {
      return throwPathIoUnsupported();
    }
    const end = devTimer(
      `web:formatScope ${bookOf(scope[0]?.tokens)} (${scope.length} ch)`,
    );
    const result = Promise.all(
      scope.map(async (item) => {
        const tokens = item.tokens ?? [];
        return formatTokensToTransformResult(
          tokens,
          onion.formatTokens(tokens, WYSIWYG_FORMAT_OPTIONS),
        );
      }),
    );
    end();
    return result;
  }

  async applyTokenFixes(
    tokens: Token[],
    fixes: TokenFix[],
  ): Promise<TokenTransformResult> {
    const end = devTimer(
      `web:applyTokenFixes ${bookOf(tokens)} (${fixes.length} fix)`,
    );
    if (!fixes.length) {
      end();
      return {
        tokens,
        appliedChanges: [],
        skippedChanges: [],
      };
    }
    let nextTokens = tokens;
    const appliedChanges: TokenTransformResult["appliedChanges"] = [];
    for (const fix of fixes) {
      nextTokens = onion.applyTokenFix(nextTokens, fix);
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
      tokens: nextTokens,
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
    const end = devTimer(`web:diffTokens ${bookOf(currentTokens)}`);
    const result = onion.diffTokens([...baselineTokens], [...currentTokens]);
    end();
    return result;
  }

  async mergeDiffBlocks(
    baselineTokens: readonly Token[],
    currentTokens: readonly Token[],
    request: MergeRequest,
  ): Promise<Token[]> {
    const end = devTimer(`web:mergeDiffBlocks ${bookOf(currentTokens)}`);
    const result = onion.mergeDiffBlocks(
      [...baselineTokens],
      [...currentTokens],
      request,
    );
    end();
    return result;
  }
}

export const webUsfmOnionService = new WebUsfmOnionService();
