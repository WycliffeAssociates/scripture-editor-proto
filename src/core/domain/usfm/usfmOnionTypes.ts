import type {
    BatchExecutionOptions as OnionBatchExecutionOptions,
    BuildSidBlocksOptions as OnionBuildSidBlocksOptions,
    FormatOptions as OnionFormatOptions,
    IntoTokensOptions as OnionIntoTokensOptions,
    Span as OnionSpan,
    TokenFix as OnionTokenFix,
} from "usfm-onion-web";
import type { ParsedToken } from "@/core/data/usfm/parse.ts";
import type { LegacyLintError as LintError } from "@/core/domain/usfm/legacyTokenTypes.ts";

export type Span = OnionSpan;

export type IntoTokensOptions = OnionIntoTokensOptions;

export type BuildSidBlocksOptions = OnionBuildSidBlocksOptions;

export type BatchExecutionOptions = OnionBatchExecutionOptions;

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
    span: Span;
    sid: string | null;
    marker: string | null;
    text: string;
};

export type TokenFix = OnionTokenFix;

export type TokenLintOptions = {
    disabledRules?: string[];
    suppressions?: Array<{
        code: string;
        sid: string;
    }>;
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
    severity: string;
    marker: string | null;
    message: string;
    messageParams: Record<string, string>;
    span: Span;
    relatedSpan: Span | null;
    tokenId: string | null;
    relatedTokenId: string | null;
    sid: string | null;
    fix: TokenFix | null;
};

export type ProjectedUsfmDocument = {
    tokens: FlatToken[];
    documentTree: DocumentTreeDocument;
    lintIssues: LintIssue[] | null;
};

export type FormatOptions = OnionFormatOptions;

export type TokenTransformChange = {
    kind: string;
    code: string;
    label: string;
    labelParams: Record<string, string>;
    targetTokenId: string | null;
};

export type SkippedTokenTransform = {
    kind: string;
    code: string;
    label: string;
    labelParams: Record<string, string>;
    reasonCode: string;
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

export type UsjNode = string | UsjElement;
// todo: get types from .d.ts
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
};

export type DocumentTreeNode = string | DocumentTreeElement;

export type DocumentTreeElement =
    | ({
          type: "text";
          value: string;
      } & Record<string, unknown>)
    | ({
          type: "book";
          marker: string;
          code: string;
          content?: DocumentTreeNode[];
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
          content?: DocumentTreeNode[];
      } & Record<string, unknown>)
    | ({
          type: "char";
          marker: string;
          content?: DocumentTreeNode[];
      } & Record<string, unknown>)
    | ({
          type: "note";
          marker: string;
          caller: string;
          content?: DocumentTreeNode[];
      } & Record<string, unknown>)
    | ({
          type: "ms";
          marker: string;
      } & Record<string, unknown>)
    | ({
          type: "figure";
          marker: string;
          content?: DocumentTreeNode[];
      } & Record<string, unknown>)
    | ({
          type: "sidebar";
          marker: string;
          content?: DocumentTreeNode[];
      } & Record<string, unknown>)
    | ({
          type: "periph";
          content?: DocumentTreeNode[];
      } & Record<string, unknown>)
    | ({
          type: "table";
          content?: DocumentTreeNode[];
      } & Record<string, unknown>)
    | ({
          type: "table:row";
          marker: string;
          content?: DocumentTreeNode[];
      } & Record<string, unknown>)
    | ({
          type: "table:cell";
          marker: string;
          align: string;
          content?: DocumentTreeNode[];
      } & Record<string, unknown>)
    | ({
          type: "ref";
          content?: DocumentTreeNode[];
      } & Record<string, unknown>)
    | ({
          type: "unknown";
          marker: string;
          content?: DocumentTreeNode[];
      } & Record<string, unknown>)
    | ({
          type: "unmatched";
          marker: string;
          content?: DocumentTreeNode[];
      } & Record<string, unknown>)
    | {
          type: "optbreak";
      }
    | {
          type: "linebreak";
          value?: string;
      };

export type DocumentTreeDocument = {
    type: string;
    version: string;
    content: DocumentTreeNode[];
};

export type ParsedUsfmChapters = Record<number, ParsedToken[]>;

export type ParsedUsfmDocument = {
    chapters: ParsedUsfmChapters;
    lintErrors: LintError[];
};
