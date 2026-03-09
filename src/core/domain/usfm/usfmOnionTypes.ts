import type { LintError } from "@/core/data/usfm/lint.ts";
import type { ParsedToken } from "@/core/data/usfm/parse.ts";

export type Span = {
    start: number;
    end: number;
};

export type IntoTokensOptions = {
    mergeHorizontalWhitespace?: boolean;
};

export type BuildSidBlocksOptions = {
    allowEmptySid?: boolean;
};

export type BatchExecutionOptions = {
    parallel?: boolean;
};

export type TokenScopeItem = {
    path?: string;
    tokens?: FlatToken[];
};

export type LintScopeOptions = {
    lintOptions?: LintOptions;
    tokenOptions?: TokenLintOptions;
    batchOptions?: BatchExecutionOptions;
};

export type FormatScopeOptions = {
    tokenOptions?: IntoTokensOptions;
    formatOptions?: FormatOptions;
    batchOptions?: BatchExecutionOptions;
};

export type DiffPathPair = {
    baselinePath: string;
    currentPath: string;
};

export type DiffScopeItem = {
    baselinePath?: string;
    currentPath?: string;
    baselineTokens?: FlatToken[];
    currentTokens?: FlatToken[];
};

export type DiffScopeOptions = {
    tokenOptions?: IntoTokensOptions;
    buildOptions?: BuildSidBlocksOptions;
    batchOptions?: BatchExecutionOptions;
};

export type FlatToken = {
    id: string;
    kind: string;
    spanStart: number;
    spanEnd: number;
    sid: string | null;
    marker: string | null;
    text: string;
};

export type TokenTemplate = {
    kind: string;
    text: string;
    marker: string | null;
    sid: string | null;
};

export type TokenFix =
    | {
          kind: "replaceToken";
          label: string;
          targetTokenId: string;
          replacements: TokenTemplate[];
      }
    | {
          kind: "insertAfter";
          label: string;
          targetTokenId: string;
          insert: TokenTemplate[];
      };

export type LintSuppression = {
    code: string;
    span: Span;
};

export type TokenLintOptions = {
    disabledRules?: string[];
    suppressions?: LintSuppression[];
};

export type LintOptions = {
    includeParseRecoveries?: boolean;
    tokenView?: IntoTokensOptions;
    tokenRules?: TokenLintOptions;
};

export type ProjectUsfmOptions = {
    tokenOptions?: IntoTokensOptions;
    lintOptions?: LintOptions | null;
};

export type LintIssue = {
    code: string;
    message: string;
    span: Span;
    relatedSpan: Span | null;
    tokenId: string | null;
    relatedTokenId: string | null;
    sid: string | null;
    fix: TokenFix | null;
};

export type ProjectedUsfmDocument = {
    tokens: FlatToken[];
    editorTree: EditorTreeDocument;
    lintIssues: LintIssue[] | null;
};

export type FormatOptions = {
    recoverMalformedMarkers?: boolean;
    collapseWhitespaceInText?: boolean;
    ensureInlineSeparators?: boolean;
    removeDuplicateVerseNumbers?: boolean;
    normalizeSpacingAfterParagraphMarkers?: boolean;
    removeUnwantedLinebreaks?: boolean;
    bridgeConsecutiveVerseMarkers?: boolean;
    removeOrphanEmptyVerseBeforeContentfulVerse?: boolean;
    removeBridgeVerseEnumerators?: boolean;
    moveChapterLabelAfterChapterMarker?: boolean;
    insertDefaultParagraphAfterChapterIntro?: boolean;
    insertStructuralLinebreaks?: boolean;
    collapseConsecutiveLinebreaks?: boolean;
    normalizeMarkerWhitespaceAtLineStart?: boolean;
};

export type TokenTransformChange = {
    kind: string;
    label: string;
    targetTokenId: string | null;
};

export type SkippedTokenTransform = {
    kind: string;
    label: string;
    targetTokenId: string | null;
    reason: string;
};

export type TokenTransformResult = {
    tokens: FlatToken[];
    appliedChanges: TokenTransformChange[];
    skippedChanges: SkippedTokenTransform[];
};

export type Diff = {
    blockId: string;
    semanticSid: string;
    status: string;
    originalText: string;
    currentText: string;
    originalTextOnly: string;
    currentTextOnly: string;
    isWhitespaceChange: boolean;
    isUsfmStructureChange: boolean;
    originalTokens: FlatToken[];
    currentTokens: FlatToken[];
    originalAlignment: DiffTokenAlignment[];
    currentAlignment: DiffTokenAlignment[];
    undoSide: DiffUndoSide;
};

export type DiffTokenChange = "unchanged" | "added" | "deleted" | "modified";

export type DiffUndoSide = "original" | "current";

export type DiffTokenAlignment = {
    change: DiffTokenChange;
    counterpartIndex: number | null;
};

export type ChapterDiffEntry = {
    bookCode: string;
    chapterNum: number;
    diffs: Diff[];
};

export type UsjRoundtrip = {
    source: string;
    fingerprint: string;
};

export type UsjNode = string | UsjElement;

export type UsjElement =
    | ({
          type: "book";
          marker: string;
          code: string;
          content?: UsjNode[];
      } & Record<string, unknown>)
    | ({
          type: "chapter";
          marker: string;
          number: string;
      } & Record<string, unknown>)
    | ({
          type: "verse";
          marker: string;
          number: string;
      } & Record<string, unknown>)
    | ({
          type: "para";
          marker: string;
          content?: UsjNode[];
      } & Record<string, unknown>)
    | ({
          type: "char";
          marker: string;
          content?: UsjNode[];
      } & Record<string, unknown>)
    | ({
          type: "note";
          marker: string;
          caller: string;
          content?: UsjNode[];
      } & Record<string, unknown>)
    | ({
          type: "ms";
          marker: string;
      } & Record<string, unknown>)
    | ({
          type: "figure";
          marker: string;
          content?: UsjNode[];
      } & Record<string, unknown>)
    | ({
          type: "sidebar";
          marker: string;
          content?: UsjNode[];
      } & Record<string, unknown>)
    | ({
          type: "periph";
          content?: UsjNode[];
      } & Record<string, unknown>)
    | ({
          type: "table";
          content?: UsjNode[];
      } & Record<string, unknown>)
    | ({
          type: "table:row";
          marker: string;
          content?: UsjNode[];
      } & Record<string, unknown>)
    | ({
          type: "table:cell";
          marker: string;
          align: string;
          content?: UsjNode[];
      } & Record<string, unknown>)
    | ({
          type: "ref";
          content?: UsjNode[];
      } & Record<string, unknown>)
    | ({
          type: "unknown";
          marker: string;
          content?: UsjNode[];
      } & Record<string, unknown>)
    | ({
          type: "unmatched";
          marker: string;
          content?: UsjNode[];
      } & Record<string, unknown>)
    | {
          type: "optbreak";
      };

export type UsjDocument = {
    type: string;
    version: string;
    content: UsjNode[];
    _dovetail_roundtrip?: UsjRoundtrip;
};

export type EditorTreeNode = string | EditorTreeElement;

export type EditorTreeElement =
    | ({
          type: "book";
          marker: string;
          code: string;
          content?: EditorTreeNode[];
      } & Record<string, unknown>)
    | ({
          type: "chapter";
          marker: string;
          number: string;
      } & Record<string, unknown>)
    | ({
          type: "verse";
          marker: string;
          number: string;
      } & Record<string, unknown>)
    | ({
          type: "para";
          marker: string;
          content?: EditorTreeNode[];
      } & Record<string, unknown>)
    | ({
          type: "char";
          marker: string;
          content?: EditorTreeNode[];
      } & Record<string, unknown>)
    | ({
          type: "note";
          marker: string;
          caller: string;
          content?: EditorTreeNode[];
      } & Record<string, unknown>)
    | ({
          type: "ms";
          marker: string;
      } & Record<string, unknown>)
    | ({
          type: "figure";
          marker: string;
          content?: EditorTreeNode[];
      } & Record<string, unknown>)
    | ({
          type: "sidebar";
          marker: string;
          content?: EditorTreeNode[];
      } & Record<string, unknown>)
    | ({
          type: "periph";
          content?: EditorTreeNode[];
      } & Record<string, unknown>)
    | ({
          type: "table";
          content?: EditorTreeNode[];
      } & Record<string, unknown>)
    | ({
          type: "table:row";
          marker: string;
          content?: EditorTreeNode[];
      } & Record<string, unknown>)
    | ({
          type: "table:cell";
          marker: string;
          align: string;
          content?: EditorTreeNode[];
      } & Record<string, unknown>)
    | ({
          type: "ref";
          content?: EditorTreeNode[];
      } & Record<string, unknown>)
    | ({
          type: "unknown";
          marker: string;
          content?: EditorTreeNode[];
      } & Record<string, unknown>)
    | ({
          type: "unmatched";
          marker: string;
          content?: EditorTreeNode[];
      } & Record<string, unknown>)
    | {
          type: "optbreak";
      }
    | {
          type: "linebreak";
      };

export type EditorTreeDocument = {
    type: string;
    version: string;
    content: EditorTreeNode[];
};

export type VrefEntry = {
    reference: string;
    text: string;
};

export type ParsedUsfmChapters = Record<number, ParsedToken[]>;

export type ParsedUsfmDocument = {
    chapters: ParsedUsfmChapters;
    lintErrors: LintError[];
};
