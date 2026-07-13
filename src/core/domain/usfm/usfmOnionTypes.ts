import type {
  AttributeItem as OnionAttributeItem,
  BuildSidBlocksOptions as OnionBuildSidBlocksOptions,
  ChapterTokenDiff as OnionChapterTokenDiff,
  ClosingBehavior as OnionClosingBehavior,
  DiffUndoSide as OnionDiffUndoSide,
  LintCode as OnionLintCode,
  LintIssue as OnionLintIssue,
  LintOptions as OnionLintOptions,
  LintScope as OnionLintScope,
  MarkerInfo as OnionMarkerInfo,
  MarkerPayload as OnionMarkerPayload,
  ParagraphCategory as OnionParagraphCategory,
  ParsedUsfm as OnionParsedUsfm,
  Token as OnionToken,
  TokenAlignment as OnionTokenAlignment,
  UsfmMarkerCatalog as OnionUsfmMarkerCatalog,
  TokenFix,
} from "usfm-onion-web";

/**
 * Shared USFM Onion type surface re-exported into Zephyr's core domain.
 *
 * Keeping these aliases here prevents the rest of the codebase from depending
 * directly on package-specific names at every call site.
 */
/**
 * `span` is omitted from the app's Token. Onion emits it in book-relative
 * coordinates that don't line up with the app's chapter-scoped token streams,
 * nothing in the app needs it, and onion's own diff/revert functions ignore
 * incoming span — so tokens round-trip without it. Omitting it (rather than
 * leaving it unread) makes a stray `.span` read a compile error; `span` is
 * optional on the onion type, so tokens stay assignable back into onion APIs
 * that still produce it.
 */
export type Token = Omit<OnionToken, "span">;
/** USFM 3.1 character-marker attribute (`|key="value"` after `\w` etc.). */
export type AttributeItem = OnionAttributeItem;
export type BuildSidBlocksOptions = OnionBuildSidBlocksOptions;
export type ParsedUsfm = OnionParsedUsfm;
export type MarkerInfo = OnionMarkerInfo;
/**
 * Semantic/presentation class of a paragraph-kind marker, straight from
 * usfm-onion (v0.0.5+). This is the axis the app's form-mode taxonomy derives
 * from — `"poetry"` distinguishes poetic lines (which `family` does not).
 */
export type ParagraphCategory = OnionParagraphCategory;
/**
 * What argument token a marker's tag consumes, straight from usfm-onion
 * (v0.0.6+): `"numberRange"` for the chapter/verse-number family
 * (c, cp, ca, v, vp, va), `"bookCode"` for `\id`. Single-sourced upstream
 * with the lexer's pending-payload table, so tokenization and catalog cannot
 * disagree. This is the axis numbered-marker node membership derives from —
 * never marker-name lists.
 */
export type MarkerPayload = OnionMarkerPayload;
/**
 * Whether/how a marker closes (v0.0.6+): `"none"` (never closes — c, v, cp,
 * paragraphs) · `"requiredExplicit"` (\\nd…\\nd*, ca/va/vp) ·
 * `"optionalExplicitUntilNoteEnd"` (note submarkers) ·
 * `"selfClosingMilestone"`. Close *expectation* answers from this; close
 * *bytes* are whatever the lexer actually saw.
 */
export type ClosingBehavior = OnionClosingBehavior;
export type RawUsfmMarkerCatalog = OnionUsfmMarkerCatalog;
export type DiffUndoSide = OnionDiffUndoSide;
export type DiffTokenAlignment = OnionTokenAlignment;
export type LintIssue = OnionLintIssue;
export type { TokenFix };

export type IntoTokensOptions = {
  mergeHorizontalWhitespace?: boolean;
};

export type TokenScopeItem = {
  path?: string;
  tokens?: Token[];
};

export type LintScopeOptions = {
  lintOptions?: LintOptions;
  tokenOptions?: TokenLintOptions;
};

export type FormatScopeOptions = {
  tokenOptions?: IntoTokensOptions;
};

export type DiffPathPair = {
  baselinePath: string;
  currentPath: string;
};

export type DiffScopeItem = {
  baselinePath?: string;
  currentPath?: string;
  baselineTokens?: Token[];
  currentTokens?: Token[];
};

export type DiffScopeOptions = {
  tokenOptions?: IntoTokensOptions;
  buildOptions?: BuildSidBlocksOptions;
};

export type TokenScopeLintSuppression = {
  code: OnionLintCode | string;
  sid: string;
};

export type TokenLintOptions = {
  disabledRules?: string[];
  suppressions?: TokenScopeLintSuppression[];
};

/**
 * What slice of a book is being linted. The library requires it to gate the
 * document-level rules (missing/duplicate `\id`, content-before-first-chapter):
 * those run only for `"front"` and `"book"`, never a bare `{ chapter }` slice.
 */
export type LintScope = OnionLintScope;

export type LintOptions = Omit<OnionLintOptions, "scope"> & {
  /**
   * Optional at the editor boundary, required by the library. The editor does
   * not yet thread chapter-grain scope, so the service layer defaults this to
   * whole-book (`"book"`) — preserving today's lint behavior. Chapter-level
   * keying/caching is the eventual upgrade path.
   *
   * TODO(lint-scope): thread chapter-grain scope (deferred; see agent-tmp/ideas).
   */
  scope?: LintScope;
  includeParseRecoveries?: boolean;
  tokenView?: IntoTokensOptions;
  tokenRules?: TokenLintOptions;
};

export type ProjectUsfmOptions = {
  tokenOptions?: IntoTokensOptions;
  lintOptions?: LintOptions | null;
  /**
   * When true, each parse result carries `sourceMd5` — the md5 of the source
   * bytes the parser read. Computed where the bytes already are (Rust for path
   * IO, JS for content IO), so crash-recovery can baseline a book without a
   * second read or an extra IPC round-trip. Off by default; only the editable
   * workspace load requests it.
   */
  includeSourceMd5?: boolean;
};

export type ProjectedUsfmDocument = {
  tokens: Token[];
  lintIssues: LintIssue[] | null;
  /** md5 of the parsed source bytes; present only when `includeSourceMd5` was set. */
  sourceMd5?: string;
};

export type UsfmMarkerCatalog = {
  raw?: RawUsfmMarkerCatalog;
  allMarkers: string[];
  paragraphMarkers: string[];
  noteMarkers: string[];
  noteSubmarkers: string[];
  regularCharacterMarkers: string[];
  documentMarkers: string[];
  chapterVerseMarkers: string[];
  infoByMarker: Record<string, MarkerInfo>;
};

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
  tokens: Token[];
  appliedChanges: TokenTransformChange[];
  skippedChanges: SkippedTokenTransform[];
};

export type Diff = {
  blockId: string;
  semanticSid: string;
  status: OnionChapterTokenDiff["status"];
  original?: OnionChapterTokenDiff["original"];
  current?: OnionChapterTokenDiff["current"];
  originalText: string;
  currentText: string;
  originalTextOnly: string;
  currentTextOnly: string;
  isWhitespaceChange: boolean;
  isUsfmStructureChange: boolean;
  originalTokens: Token[];
  currentTokens: Token[];
  originalAlignment: DiffTokenAlignment[];
  currentAlignment: DiffTokenAlignment[];
  undoSide: DiffUndoSide;
};
