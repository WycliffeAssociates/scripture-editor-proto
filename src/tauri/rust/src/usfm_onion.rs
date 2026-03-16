use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::ops::Range;
use std::path::Path;
use usfm_onion as onion;
use onion::diff::{
    apply_revert_by_block_id, diff_tokens, diff_usfm, BuildSidBlocksOptions, ChapterTokenDiff,
    DiffStatus, DiffTokenChange, DiffUndoSide, TokenAlignment,
};
use onion::format::{
    apply_token_fixes, format_flat_token_batches_with_options, format_usfm_sources_with_options,
    FormatOptions, SkippedTokenTransform, TokenFix, TokenTemplate, TokenTransformChange,
    TokenTransformKind, TokenTransformResult, TokenTransformSkipReason,
};
use onion::lint::{
    lint_flat_token_batches, lint_flat_tokens, lint_usfm_sources, LintCode, LintIssue,
    LintOptions, LintSuppression, TokenLintOptions,
};
use onion::model::{
    BatchExecutionOptions, Token, TokenKind, TokenViewOptions, WhitespacePolicy,
};
use onion::parse::{
    project_usfm, project_usfm_batch, IntoTokensOptions, ProjectUsfmOptions,
};
use onion::markers;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntoTokensOptionsDto {
    #[serde(default)]
    pub merge_horizontal_whitespace: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildSidBlocksOptionsDto {
    #[serde(default = "default_true")]
    pub allow_empty_sid: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchExecutionOptionsDto {
    #[serde(default = "default_true")]
    pub parallel: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffPathPairDto {
    pub baseline_path: String,
    pub current_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlatTokenDto {
    pub id: String,
    pub kind: String,
    pub span: SpanDto,
    pub sid: Option<String>,
    pub marker: Option<String>,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpanDto {
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenTemplateDto {
    pub kind: String,
    pub text: String,
    pub marker: Option<String>,
    pub sid: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TokenFixDto {
    ReplaceToken {
        code: String,
        label: String,
        label_params: std::collections::BTreeMap<String, String>,
        target_token_id: String,
        replacements: Vec<TokenTemplateDto>,
    },
    DeleteToken {
        code: String,
        label: String,
        label_params: std::collections::BTreeMap<String, String>,
        target_token_id: String,
    },
    InsertAfter {
        code: String,
        label: String,
        label_params: std::collections::BTreeMap<String, String>,
        target_token_id: String,
        insert: Vec<TokenTemplateDto>,
    },
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenLintOptionsDto {
    #[serde(default)]
    pub disabled_rules: Vec<String>,
    #[serde(default)]
    pub suppressions: Vec<LintSuppressionDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LintSuppressionDto {
    pub code: String,
    pub sid: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LintOptionsDto {
    #[serde(default = "default_true")]
    pub include_parse_recoveries: bool,
    #[serde(default)]
    pub token_view: IntoTokensOptionsDto,
    #[serde(default)]
    pub token_rules: TokenLintOptionsDto,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectUsfmOptionsDto {
    #[serde(default)]
    pub token_options: IntoTokensOptionsDto,
    #[serde(default)]
    pub lint_options: Option<LintOptionsDto>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatOptionsDto {
    pub recover_malformed_markers: Option<bool>,
    pub collapse_whitespace_in_text: Option<bool>,
    pub ensure_inline_separators: Option<bool>,
    pub remove_duplicate_verse_numbers: Option<bool>,
    pub normalize_spacing_after_paragraph_markers: Option<bool>,
    pub remove_unwanted_linebreaks: Option<bool>,
    pub bridge_consecutive_verse_markers: Option<bool>,
    pub remove_orphan_empty_verse_before_contentful_verse: Option<bool>,
    pub remove_bridge_verse_enumerators: Option<bool>,
    pub move_chapter_label_after_chapter_marker: Option<bool>,
    pub insert_default_paragraph_after_chapter_intro: Option<bool>,
    pub remove_empty_paragraphs: Option<bool>,
    pub insert_structural_linebreaks: Option<bool>,
    pub collapse_consecutive_linebreaks: Option<bool>,
    pub normalize_marker_whitespace_at_line_start: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LintIssueDto {
    pub code: String,
    pub severity: String,
    pub marker: Option<String>,
    pub message: String,
    pub message_params: std::collections::BTreeMap<String, String>,
    pub span: SpanDto,
    pub related_span: Option<SpanDto>,
    pub token_id: Option<String>,
    pub related_token_id: Option<String>,
    pub sid: Option<String>,
    pub fix: Option<TokenFixDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectedUsfmDocumentDto {
    pub tokens: Vec<FlatTokenDto>,
    pub lint_issues: Option<Vec<LintIssueDto>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkerCatalogDto {
    pub all_markers: Vec<String>,
    pub paragraph_markers: Vec<String>,
    pub note_markers: Vec<String>,
    pub note_submarkers: Vec<String>,
    pub regular_character_markers: Vec<String>,
    pub document_markers: Vec<String>,
    pub chapter_verse_markers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffDto {
    pub block_id: String,
    pub semantic_sid: String,
    pub status: String,
    pub original_text: String,
    pub current_text: String,
    pub original_text_only: String,
    pub current_text_only: String,
    pub is_whitespace_change: bool,
    pub is_usfm_structure_change: bool,
    pub original_tokens: Vec<FlatTokenDto>,
    pub current_tokens: Vec<FlatTokenDto>,
    pub original_alignment: Vec<TokenAlignmentDto>,
    pub current_alignment: Vec<TokenAlignmentDto>,
    pub undo_side: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenAlignmentDto {
    pub change: String,
    pub counterpart_index: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenTransformChangeDto {
    pub kind: String,
    pub code: String,
    pub label: String,
    pub label_params: std::collections::BTreeMap<String, String>,
    pub target_token_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedTokenTransformDto {
    pub kind: String,
    pub code: String,
    pub label: String,
    pub label_params: std::collections::BTreeMap<String, String>,
    pub target_token_id: Option<String>,
    pub reason_code: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenTransformResultDto {
    pub tokens: Vec<FlatTokenDto>,
    pub applied_changes: Vec<TokenTransformChangeDto>,
    pub skipped_changes: Vec<SkippedTokenTransformDto>,
}

fn default_true() -> bool {
    true
}

fn read_usfm_source_from_path(path: &str) -> Result<String, String> {
    let candidate = Path::new(path);
    if !candidate.is_absolute() {
        return Err("path must be absolute".to_string());
    }
    if !candidate.exists() {
        return Err("file not found".to_string());
    }
    if !candidate.is_file() {
        return Err("path is not a file".to_string());
    }

    let canonical = candidate
        .canonicalize()
        .map_err(|_| "failed to read file".to_string())?;
    let bytes = fs::read(&canonical).map_err(|_| "failed to read file".to_string())?;
    String::from_utf8(bytes).map_err(|_| "failed to decode utf-8".to_string())
}

fn should_parallelize(options: Option<BatchExecutionOptionsDto>) -> bool {
    options.map(|o| o.parallel).unwrap_or(true)
}

fn map_batch_options(options: Option<BatchExecutionOptionsDto>) -> BatchExecutionOptions {
    BatchExecutionOptions {
        parallel: should_parallelize(options),
    }
}

fn read_sources_from_paths(
    paths: Vec<String>,
    batch_options: Option<BatchExecutionOptionsDto>,
) -> Result<Vec<String>, String> {
    let parallel = should_parallelize(batch_options);
    if parallel {
        paths
            .into_par_iter()
            .map(|path| read_usfm_source_from_path(&path))
            .collect()
    } else {
        paths
            .into_iter()
            .map(|path| read_usfm_source_from_path(&path))
            .collect()
    }
}

fn map_whitespace_policy(options: IntoTokensOptionsDto) -> IntoTokensOptions {
    IntoTokensOptions {
        merge_horizontal_whitespace: options.merge_horizontal_whitespace,
    }
}

fn map_token_view_options(options: Option<IntoTokensOptionsDto>) -> TokenViewOptions {
    TokenViewOptions {
        whitespace_policy: if options
            .map(|o| o.merge_horizontal_whitespace)
            .unwrap_or(false)
        {
            WhitespacePolicy::MergeToVisible
        } else {
            // Core usfm_onion does not currently expose a preserve token-view policy.
            WhitespacePolicy::MergeToVisible
        },
    }
}

fn map_format_options(options: Option<FormatOptionsDto>) -> FormatOptions {
    let defaults = FormatOptions::default();
    let Some(options) = options else {
        return defaults;
    };

    FormatOptions {
        recover_malformed_markers: options
            .recover_malformed_markers
            .unwrap_or(defaults.recover_malformed_markers),
        collapse_whitespace_in_text: options
            .collapse_whitespace_in_text
            .unwrap_or(defaults.collapse_whitespace_in_text),
        ensure_inline_separators: options
            .ensure_inline_separators
            .unwrap_or(defaults.ensure_inline_separators),
        remove_duplicate_verse_numbers: options
            .remove_duplicate_verse_numbers
            .unwrap_or(defaults.remove_duplicate_verse_numbers),
        normalize_spacing_after_paragraph_markers: options
            .normalize_spacing_after_paragraph_markers
            .unwrap_or(defaults.normalize_spacing_after_paragraph_markers),
        remove_unwanted_linebreaks: options
            .remove_unwanted_linebreaks
            .unwrap_or(defaults.remove_unwanted_linebreaks),
        bridge_consecutive_verse_markers: options
            .bridge_consecutive_verse_markers
            .unwrap_or(defaults.bridge_consecutive_verse_markers),
        remove_orphan_empty_verse_before_contentful_verse: options
            .remove_orphan_empty_verse_before_contentful_verse
            .unwrap_or(defaults.remove_orphan_empty_verse_before_contentful_verse),
        remove_bridge_verse_enumerators: options
            .remove_bridge_verse_enumerators
            .unwrap_or(defaults.remove_bridge_verse_enumerators),
        move_chapter_label_after_chapter_marker: options
            .move_chapter_label_after_chapter_marker
            .unwrap_or(defaults.move_chapter_label_after_chapter_marker),
        insert_default_paragraph_after_chapter_intro: options
            .insert_default_paragraph_after_chapter_intro
            .unwrap_or(defaults.insert_default_paragraph_after_chapter_intro),
        remove_empty_paragraphs: options
            .remove_empty_paragraphs
            .unwrap_or(defaults.remove_empty_paragraphs),
        insert_structural_linebreaks: options
            .insert_structural_linebreaks
            .unwrap_or(defaults.insert_structural_linebreaks),
        collapse_consecutive_linebreaks: options
            .collapse_consecutive_linebreaks
            .unwrap_or(defaults.collapse_consecutive_linebreaks),
        normalize_marker_whitespace_at_line_start: options
            .normalize_marker_whitespace_at_line_start
            .unwrap_or(defaults.normalize_marker_whitespace_at_line_start),
    }
}

fn map_fix_dto(fix: TokenFixDto) -> TokenFix {
    match fix {
        TokenFixDto::ReplaceToken {
            code,
            label,
            label_params,
            target_token_id,
            replacements,
        } => TokenFix::ReplaceToken {
            code,
            label,
            label_params,
            target_token_id,
            replacements: replacements.into_iter().map(map_template_dto).collect(),
        },
        TokenFixDto::DeleteToken {
            code,
            label,
            label_params,
            target_token_id,
        } => TokenFix::DeleteToken {
            code,
            label,
            label_params,
            target_token_id,
        },
        TokenFixDto::InsertAfter {
            code,
            label,
            label_params,
            target_token_id,
            insert,
        } => TokenFix::InsertAfter {
            code,
            label,
            label_params,
            target_token_id,
            insert: insert.into_iter().map(map_template_dto).collect(),
        },
    }
}

fn map_template_dto(template: TokenTemplateDto) -> TokenTemplate {
    TokenTemplate {
        kind: map_token_kind(&template.kind),
        text: template.text,
        marker: template.marker,
        sid: template.sid,
    }
}

fn lint_code_from_str(code: &str) -> Option<LintCode> {
    Some(match code {
        "missing-separator-after-marker" => LintCode::MissingSeparatorAfterMarker,
        "empty-paragraph" => LintCode::EmptyParagraph,
        "number-range-after-chapter-marker" => LintCode::NumberRangeAfterChapterMarker,
        "verse-range-expected-after-verse-marker" => {
            LintCode::VerseRangeExpectedAfterVerseMarker
        }
        "verse-content-not-empty" => LintCode::VerseContentNotEmpty,
        "unknown-token" => LintCode::UnknownToken,
        "char-not-closed" => LintCode::CharNotClosed,
        "note-not-closed" => LintCode::NoteNotClosed,
        "paragraph-before-first-chapter" => LintCode::ParagraphBeforeFirstChapter,
        "verse-before-first-chapter" => LintCode::VerseBeforeFirstChapter,
        "note-submarker-outside-note" => LintCode::NoteSubmarkerOutsideNote,
        "duplicate-id-marker" => LintCode::DuplicateIdMarker,
        "id-marker-not-at-file-start" => LintCode::IdMarkerNotAtFileStart,
        "chapter-metadata-outside-chapter" => LintCode::ChapterMetadataOutsideChapter,
        "verse-metadata-outside-verse" => LintCode::VerseMetadataOutsideVerse,
        "missing-chapter-number" => LintCode::MissingChapterNumber,
        "missing-verse-number" => LintCode::MissingVerseNumber,
        "missing-milestone-self-close" => LintCode::MissingMilestoneSelfClose,
        "implicitly-closed-marker" => LintCode::ImplicitlyClosedMarker,
        "stray-close-marker" => LintCode::StrayCloseMarker,
        "misnested-close-marker" => LintCode::MisnestedCloseMarker,
        "unclosed-note" => LintCode::UnclosedNote,
        "unclosed-marker-at-eof" => LintCode::UnclosedMarkerAtEof,
        "duplicate-chapter-number" => LintCode::DuplicateChapterNumber,
        "chapter-expected-increase-by-one" => LintCode::ChapterExpectedIncreaseByOne,
        "duplicate-verse-number" => LintCode::DuplicateVerseNumber,
        "verse-expected-increase-by-one" => LintCode::VerseExpectedIncreaseByOne,
        "invalid-number-range" => LintCode::InvalidNumberRange,
        "number-range-not-preceded-by-marker-expecting-number" => {
            LintCode::NumberRangeNotPrecededByMarkerExpectingNumber
        }
        "verse-text-follows-verse-range" => LintCode::VerseTextFollowsVerseRange,
        "unknown-marker" => LintCode::UnknownMarker,
        "unknown-close-marker" => LintCode::UnknownCloseMarker,
        "inconsistent-chapter-label" => LintCode::InconsistentChapterLabel,
        "marker-not-valid-in-context" => LintCode::MarkerNotValidInContext,
        "verse-outside-explicit-paragraph" => LintCode::VerseOutsideExplicitParagraph,
        _ => return None,
    })
}

fn token_kind_to_string(kind: &TokenKind) -> String {
    match kind {
        TokenKind::Newline => "verticalWhitespace".to_string(),
        TokenKind::OptBreak => "optbreak".to_string(),
        TokenKind::Marker => "marker".to_string(),
        TokenKind::EndMarker => "endMarker".to_string(),
        TokenKind::Milestone => "milestone".to_string(),
        TokenKind::MilestoneEnd => "milestoneEnd".to_string(),
        TokenKind::Attributes => "attributes".to_string(),
        TokenKind::BookCode => "bookCode".to_string(),
        TokenKind::Number => "number".to_string(),
        TokenKind::Text => "text".to_string(),
    }
}

fn map_token_kind(kind: &str) -> TokenKind {
    match kind {
        "marker" => TokenKind::Marker,
        "endMarker" => TokenKind::EndMarker,
        "milestone" => TokenKind::Milestone,
        "milestoneEnd" => TokenKind::MilestoneEnd,
        "attributes" | "attrPair" => TokenKind::Attributes,
        "bookCode" => TokenKind::BookCode,
        "number" | "numberRange" => TokenKind::Number,
        "nl" | "newline" | "verticalWhitespace" => TokenKind::Newline,
        "ws" | "whitespace" | "horizontalWhitespace" => TokenKind::Text,
        "optbreak" => TokenKind::OptBreak,
        _ => TokenKind::Text,
    }
}

fn map_span(span: Range<usize>) -> SpanDto {
    SpanDto {
        start: span.start,
        end: span.end,
    }
}

fn map_core_token(token: Token) -> FlatTokenDto {
    FlatTokenDto {
        id: token.id,
        kind: token_kind_to_string(&token.kind),
        span: map_span(token.span),
        sid: token.sid,
        marker: token.marker,
        text: token.text,
    }
}

fn map_template(template: TokenTemplate) -> TokenTemplateDto {
    TokenTemplateDto {
        kind: token_kind_to_string(&template.kind),
        text: template.text,
        marker: template.marker,
        sid: template.sid,
    }
}

fn map_fix(fix: TokenFix) -> TokenFixDto {
    match fix {
        TokenFix::ReplaceToken {
            code,
            label,
            label_params,
            target_token_id,
            replacements,
        } => TokenFixDto::ReplaceToken {
            code,
            label,
            label_params,
            target_token_id,
            replacements: replacements.into_iter().map(map_template).collect(),
        },
        TokenFix::DeleteToken {
            code,
            label,
            label_params,
            target_token_id,
        } => TokenFixDto::DeleteToken {
            code,
            label,
            label_params,
            target_token_id,
        },
        TokenFix::InsertAfter {
            code,
            label,
            label_params,
            target_token_id,
            insert,
        } => TokenFixDto::InsertAfter {
            code,
            label,
            label_params,
            target_token_id,
            insert: insert.into_iter().map(map_template).collect(),
        },
    }
}

fn map_issue(issue: LintIssue) -> LintIssueDto {
    LintIssueDto {
        code: issue.code.as_str().to_string(),
        severity: issue.severity.as_str().to_string(),
        marker: issue.marker,
        message: issue.message,
        message_params: issue.message_params,
        span: map_span(issue.span),
        related_span: issue.related_span.map(map_span),
        token_id: issue.token_id,
        related_token_id: issue.related_token_id,
        sid: issue.sid,
        fix: issue.fix.map(map_fix),
    }
}

fn map_diff(diff: ChapterTokenDiff<Token>) -> DiffDto {
    DiffDto {
        block_id: diff.block_id,
        semantic_sid: diff.semantic_sid,
        status: match diff.status {
            DiffStatus::Added => "added".to_string(),
            DiffStatus::Deleted => "deleted".to_string(),
            DiffStatus::Modified => "modified".to_string(),
            DiffStatus::Unchanged => "unchanged".to_string(),
        },
        original_text: diff.original_text,
        current_text: diff.current_text,
        original_text_only: diff.original_text_only,
        current_text_only: diff.current_text_only,
        is_whitespace_change: diff.is_whitespace_change,
        is_usfm_structure_change: diff.is_usfm_structure_change,
        original_tokens: diff
            .original_tokens
            .into_iter()
            .map(map_core_token)
            .collect(),
        current_tokens: diff
            .current_tokens
            .into_iter()
            .map(map_core_token)
            .collect(),
        original_alignment: diff
            .original_alignment
            .into_iter()
            .map(map_token_alignment)
            .collect(),
        current_alignment: diff
            .current_alignment
            .into_iter()
            .map(map_token_alignment)
            .collect(),
        undo_side: map_undo_side(diff.undo_side).to_string(),
    }
}

fn map_token_alignment(alignment: TokenAlignment) -> TokenAlignmentDto {
    TokenAlignmentDto {
        change: match alignment.change {
            DiffTokenChange::Unchanged => "unchanged",
            DiffTokenChange::Added => "added",
            DiffTokenChange::Deleted => "deleted",
            DiffTokenChange::Modified => "modified",
        }
        .to_string(),
        counterpart_index: alignment.counterpart_index,
    }
}

fn map_undo_side(side: DiffUndoSide) -> &'static str {
    match side {
        DiffUndoSide::Original => "original",
        DiffUndoSide::Current => "current",
    }
}

fn map_transform_change(change: TokenTransformChange) -> TokenTransformChangeDto {
    TokenTransformChangeDto {
        kind: match change.kind {
            TokenTransformKind::Fix => "fix".to_string(),
            TokenTransformKind::Format => "format".to_string(),
            TokenTransformKind::CustomFormatPass => "custom-format-pass".to_string(),
        },
        code: change.code,
        label: change.label,
        label_params: change.label_params,
        target_token_id: change.target_token_id,
    }
}

fn map_skipped_transform(skipped: SkippedTokenTransform) -> SkippedTokenTransformDto {
    SkippedTokenTransformDto {
        kind: match skipped.kind {
            TokenTransformKind::Fix => "fix".to_string(),
            TokenTransformKind::Format => "format".to_string(),
            TokenTransformKind::CustomFormatPass => "custom-format-pass".to_string(),
        },
        code: skipped.code,
        label: skipped.label,
        label_params: skipped.label_params,
        target_token_id: skipped.target_token_id,
        reason_code: skipped.reason.as_str().to_string(),
        reason: match skipped.reason {
            TokenTransformSkipReason::TokenNotFound => "tokenNotFound".to_string(),
            TokenTransformSkipReason::EmptyReplacement => "emptyReplacement".to_string(),
        },
    }
}

fn map_transform_result(
    result: TokenTransformResult<Token>,
) -> TokenTransformResultDto {
    TokenTransformResultDto {
        tokens: result.tokens.into_iter().map(map_core_token).collect(),
        applied_changes: result
            .applied_changes
            .into_iter()
            .map(map_transform_change)
            .collect(),
        skipped_changes: result
            .skipped_changes
            .into_iter()
            .map(map_skipped_transform)
            .collect(),
    }
}

fn parse_flat_tokens(tokens: Vec<FlatTokenDto>) -> Vec<Token> {
    tokens
        .into_iter()
        .map(|token| Token {
            id: token.id,
            kind: map_token_kind(&token.kind),
            span: token.span.start..token.span.end,
            sid: token.sid,
            marker: token.marker,
            text: token.text,
        })
        .collect()
}

fn parse_core_flat_tokens(tokens: Vec<FlatTokenDto>) -> Vec<Token> {
    parse_flat_tokens(tokens)
}

fn map_token_lint_options(options: Option<TokenLintOptionsDto>) -> TokenLintOptions {
    TokenLintOptions {
        disabled_rules: options
            .as_ref()
            .map(|o| {
                o.disabled_rules
                    .iter()
                    .filter_map(|code| lint_code_from_str(code))
                    .collect()
            })
            .unwrap_or_default(),
        suppressions: options
            .as_ref()
            .map(|o| {
                o.suppressions
                    .iter()
                    .filter_map(|suppression| {
                        lint_code_from_str(&suppression.code).map(|code| LintSuppression {
                            code,
                            sid: suppression.sid.clone(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default(),
        allow_implicit_chapter_content_verse: false,
    }
}

fn map_lint_options(options: Option<LintOptionsDto>) -> LintOptions {
    LintOptions {
        include_parse_recoveries: options
            .as_ref()
            .map(|o| o.include_parse_recoveries)
            .unwrap_or(true),
        token_view: options
            .as_ref()
            .map(|o| TokenViewOptions {
                whitespace_policy: if o.token_view.merge_horizontal_whitespace {
                    WhitespacePolicy::MergeToVisible
                } else {
                    // Core usfm_onion does not currently expose a preserve token-view policy.
                    WhitespacePolicy::MergeToVisible
                },
            })
            .unwrap_or_default(),
        token_rules: map_token_lint_options(options.map(|o| o.token_rules)),
    }
}

#[tauri::command]
pub fn usfm_onion_marker_catalog() -> MarkerCatalogDto {
    let all_markers = markers::all_markers();
    MarkerCatalogDto {
        paragraph_markers: markers::paragraph_markers(),
        note_markers: markers::note_markers(),
        note_submarkers: markers::note_submarkers(),
        regular_character_markers: all_markers
            .iter()
            .filter(|marker| markers::is_regular_character_marker(marker))
            .cloned()
            .collect(),
        document_markers: all_markers
            .iter()
            .filter(|marker| markers::is_document_marker(marker))
            .cloned()
            .collect(),
        chapter_verse_markers: all_markers
            .iter()
            .filter(|marker| {
                matches!(
                    markers::marker_info(marker).category,
                    markers::MarkerCategory::Chapter | markers::MarkerCategory::Verse
                )
            })
            .cloned()
            .collect(),
        all_markers,
    }
}

#[tauri::command]
pub fn usfm_onion_project_usfm(
    source: String,
    options: Option<ProjectUsfmOptionsDto>,
) -> Result<ProjectedUsfmDocumentDto, String> {
    let projection = project_usfm(
        &source,
        ProjectUsfmOptions {
            token_options: options
                .as_ref()
                .map(|o| map_whitespace_policy(o.token_options.clone()))
                .unwrap_or_default(),
            lint_options: options
                .and_then(|o| o.lint_options)
                .map(|lint| map_lint_options(Some(lint))),
        },
    );

    Ok(ProjectedUsfmDocumentDto {
        tokens: projection.tokens.into_iter().map(map_core_token).collect(),
        lint_issues: projection
            .lint_issues
            .map(|issues| issues.into_iter().map(map_issue).collect()),
    })
}

#[tauri::command]
pub fn usfm_onion_project_paths(
    paths: Vec<String>,
    options: Option<ProjectUsfmOptionsDto>,
    batch_options: Option<BatchExecutionOptionsDto>,
) -> Result<Vec<ProjectedUsfmDocumentDto>, String> {
    let options = options.unwrap_or_default();
    let sources = read_sources_from_paths(paths, batch_options.clone())?;
    let projections = project_usfm_batch(
        &sources,
        ProjectUsfmOptions {
            token_options: map_whitespace_policy(options.token_options),
            lint_options: options
                .lint_options
                .map(|lint| map_lint_options(Some(lint))),
        },
        map_batch_options(batch_options),
    );
    Ok(projections
        .into_iter()
        .map(|projection| ProjectedUsfmDocumentDto {
            tokens: projection.tokens.into_iter().map(map_core_token).collect(),
            lint_issues: projection
                .lint_issues
                .map(|issues| issues.into_iter().map(map_issue).collect()),
        })
        .collect())
}

#[tauri::command]
pub fn usfm_onion_lint_paths(
    paths: Vec<String>,
    options: Option<LintOptionsDto>,
    batch_options: Option<BatchExecutionOptionsDto>,
) -> Result<Vec<Vec<LintIssueDto>>, String> {
    let sources = read_sources_from_paths(paths, batch_options.clone())?;
    let issues = lint_usfm_sources(
        &sources,
        map_lint_options(options),
        map_batch_options(batch_options),
    );
    Ok(issues
        .into_iter()
        .map(|result| result.into_iter().map(map_issue).collect())
        .collect())
}

#[tauri::command]
pub fn usfm_onion_lint_tokens(
    tokens: Vec<FlatTokenDto>,
    options: Option<TokenLintOptionsDto>,
) -> Result<Vec<LintIssueDto>, String> {
    let issues =
        lint_flat_tokens(&parse_flat_tokens(tokens), map_token_lint_options(options));
    Ok(issues.into_iter().map(map_issue).collect())
}

#[tauri::command]
pub fn usfm_onion_lint_token_batches(
    token_batches: Vec<Vec<FlatTokenDto>>,
    options: Option<TokenLintOptionsDto>,
    batch_options: Option<BatchExecutionOptionsDto>,
) -> Result<Vec<Vec<LintIssueDto>>, String> {
    let batches = token_batches
        .into_iter()
        .map(parse_flat_tokens)
        .collect::<Vec<_>>();
    let issues = lint_flat_token_batches(
        &batches,
        map_token_lint_options(options),
        map_batch_options(batch_options),
    );
    Ok(issues
        .into_iter()
        .map(|result| result.into_iter().map(map_issue).collect())
        .collect())
}

#[tauri::command]
pub fn usfm_onion_format_token_batches(
    token_batches: Vec<Vec<FlatTokenDto>>,
    options: Option<FormatOptionsDto>,
    batch_options: Option<BatchExecutionOptionsDto>,
) -> Result<Vec<TokenTransformResultDto>, String> {
    let batches = token_batches
        .into_iter()
        .map(parse_core_flat_tokens)
        .collect::<Vec<_>>();
    let results = format_flat_token_batches_with_options(
        &batches,
        map_format_options(options),
        map_batch_options(batch_options),
    );
    Ok(results.into_iter().map(map_transform_result).collect())
}

#[tauri::command]
pub fn usfm_onion_format_paths(
    paths: Vec<String>,
    token_options: Option<IntoTokensOptionsDto>,
    format_options: Option<FormatOptionsDto>,
    batch_options: Option<BatchExecutionOptionsDto>,
) -> Result<Vec<TokenTransformResultDto>, String> {
    let sources = read_sources_from_paths(paths, batch_options.clone())?;
    let results = format_usfm_sources_with_options(
        &sources,
        token_options
            .map(map_whitespace_policy)
            .unwrap_or_else(|| IntoTokensOptions {
                merge_horizontal_whitespace: false,
            }),
        map_format_options(format_options),
        map_batch_options(batch_options),
    );
    Ok(results.into_iter().map(map_transform_result).collect())
}

#[tauri::command]
pub fn usfm_onion_apply_token_fixes(
    tokens: Vec<FlatTokenDto>,
    fixes: Vec<TokenFixDto>,
) -> Result<TokenTransformResultDto, String> {
    let tokens = parse_core_flat_tokens(tokens);
    let fixes = fixes.into_iter().map(map_fix_dto).collect::<Vec<_>>();
    Ok(map_transform_result(apply_token_fixes(
        &tokens, &fixes,
    )))
}

#[tauri::command]
pub fn usfm_onion_diff_path_pairs(
    path_pairs: Vec<DiffPathPairDto>,
    token_options: Option<IntoTokensOptionsDto>,
    build_options: Option<BuildSidBlocksOptionsDto>,
    batch_options: Option<BatchExecutionOptionsDto>,
) -> Result<Vec<Vec<DiffDto>>, String> {
    let token_options = map_token_view_options(token_options);
    let build_options = BuildSidBlocksOptions {
        allow_empty_sid: build_options.map(|o| o.allow_empty_sid).unwrap_or(true),
    };
    let map_diff_pair = |pair: DiffPathPairDto| -> Result<Vec<DiffDto>, String> {
        let baseline_usfm = read_usfm_source_from_path(&pair.baseline_path)?;
        let current_usfm = read_usfm_source_from_path(&pair.current_path)?;
        Ok(diff_usfm(
            &baseline_usfm,
            &current_usfm,
            &token_options,
            &build_options,
        )
        .into_iter()
        .map(map_diff)
        .collect())
    };
    if should_parallelize(batch_options) {
        path_pairs.into_par_iter().map(map_diff_pair).collect()
    } else {
        path_pairs.into_iter().map(map_diff_pair).collect()
    }
}

#[tauri::command]
pub fn usfm_onion_diff_tokens(
    baseline_tokens: Vec<FlatTokenDto>,
    current_tokens: Vec<FlatTokenDto>,
    build_options: Option<BuildSidBlocksOptionsDto>,
) -> Result<Vec<DiffDto>, String> {
    let baseline = parse_core_flat_tokens(baseline_tokens);
    let current = parse_core_flat_tokens(current_tokens);
    Ok(diff_tokens(
        &baseline,
        &current,
        &BuildSidBlocksOptions {
            allow_empty_sid: build_options.map(|o| o.allow_empty_sid).unwrap_or(true),
        },
    )
    .into_iter()
    .map(map_diff)
    .collect())
}

#[tauri::command]
pub fn usfm_onion_revert_diff_block(
    baseline_tokens: Vec<FlatTokenDto>,
    current_tokens: Vec<FlatTokenDto>,
    block_id: String,
    build_options: Option<BuildSidBlocksOptionsDto>,
) -> Result<Vec<FlatTokenDto>, String> {
    let baseline = parse_core_flat_tokens(baseline_tokens);
    let current = parse_core_flat_tokens(current_tokens);
    Ok(apply_revert_by_block_id(
        &block_id,
        &baseline,
        &current,
        &BuildSidBlocksOptions {
            allow_empty_sid: build_options.map(|o| o.allow_empty_sid).unwrap_or(true),
        },
    )
    .into_iter()
    .map(map_core_token)
    .collect())
}
