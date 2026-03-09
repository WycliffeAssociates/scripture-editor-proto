use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::ops::Range;
use std::path::Path;
use usfm3_v2 as onion;

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
    pub span_start: usize,
    pub span_end: usize,
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
        label: String,
        target_token_id: String,
        replacements: Vec<TokenTemplateDto>,
    },
    InsertAfter {
        label: String,
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
    pub span: SpanDto,
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
    pub insert_structural_linebreaks: Option<bool>,
    pub collapse_consecutive_linebreaks: Option<bool>,
    pub normalize_marker_whitespace_at_line_start: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LintIssueDto {
    pub code: String,
    pub message: String,
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
    pub editor_tree: onion::EditorTreeDocument,
    pub lint_issues: Option<Vec<LintIssueDto>>,
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
    pub label: String,
    pub target_token_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedTokenTransformDto {
    pub kind: String,
    pub label: String,
    pub target_token_id: Option<String>,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenTransformResultDto {
    pub tokens: Vec<FlatTokenDto>,
    pub applied_changes: Vec<TokenTransformChangeDto>,
    pub skipped_changes: Vec<SkippedTokenTransformDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterDiffEntryDto {
    pub book_code: String,
    pub chapter_num: u32,
    pub diffs: Vec<DiffDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VrefEntryDto {
    pub reference: String,
    pub text: String,
}

#[derive(Debug, Clone)]
struct FlatTokenInput {
    id: String,
    kind: onion::TokenKind,
    span: Range<usize>,
    sid: Option<String>,
    marker: Option<String>,
    text: String,
}

impl onion::LintableFlatToken for FlatTokenInput {
    fn kind(&self) -> &onion::TokenKind {
        &self.kind
    }

    fn span(&self) -> &Range<usize> {
        &self.span
    }

    fn text(&self) -> &str {
        &self.text
    }

    fn marker(&self) -> Option<&str> {
        self.marker.as_deref()
    }

    fn sid(&self) -> Option<&str> {
        self.sid.as_deref()
    }

    fn id(&self) -> Option<&str> {
        Some(&self.id)
    }
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

fn map_batch_options(options: Option<BatchExecutionOptionsDto>) -> onion::BatchExecutionOptions {
    onion::BatchExecutionOptions {
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

fn map_whitespace_policy(options: IntoTokensOptionsDto) -> onion::IntoTokensOptions {
    onion::IntoTokensOptions {
        merge_horizontal_whitespace: options.merge_horizontal_whitespace,
    }
}

fn map_token_view_options(options: Option<IntoTokensOptionsDto>) -> onion::TokenViewOptions {
    onion::TokenViewOptions {
        whitespace_policy: if options
            .map(|o| o.merge_horizontal_whitespace)
            .unwrap_or(false)
        {
            onion::WhitespacePolicy::MergeToVisible
        } else {
            onion::WhitespacePolicy::Preserve
        },
    }
}

fn map_format_options(options: Option<FormatOptionsDto>) -> onion::FormatOptions {
    let defaults = onion::FormatOptions::default();
    let Some(options) = options else {
        return defaults;
    };

    onion::FormatOptions {
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

fn map_fix_dto(fix: TokenFixDto) -> onion::TokenFix {
    match fix {
        TokenFixDto::ReplaceToken {
            label,
            target_token_id,
            replacements,
        } => onion::TokenFix::ReplaceToken {
            label,
            target_token_id,
            replacements: replacements.into_iter().map(map_template_dto).collect(),
        },
        TokenFixDto::InsertAfter {
            label,
            target_token_id,
            insert,
        } => onion::TokenFix::InsertAfter {
            label,
            target_token_id,
            insert: insert.into_iter().map(map_template_dto).collect(),
        },
    }
}

fn map_template_dto(template: TokenTemplateDto) -> onion::TokenTemplate {
    onion::TokenTemplate {
        kind: map_token_kind(&template.kind),
        text: template.text,
        marker: template.marker,
        sid: template.sid,
    }
}

fn lint_code_from_str(code: &str) -> Option<onion::LintCode> {
    Some(match code {
        "missing-separator-after-marker" => onion::LintCode::MissingSeparatorAfterMarker,
        "number-range-after-chapter-marker" => onion::LintCode::NumberRangeAfterChapterMarker,
        "verse-range-expected-after-verse-marker" => {
            onion::LintCode::VerseRangeExpectedAfterVerseMarker
        }
        "verse-content-not-empty" => onion::LintCode::VerseContentNotEmpty,
        "unknown-token" => onion::LintCode::UnknownToken,
        "char-not-closed" => onion::LintCode::CharNotClosed,
        "note-not-closed" => onion::LintCode::NoteNotClosed,
        "paragraph-before-first-chapter" => onion::LintCode::ParagraphBeforeFirstChapter,
        "verse-before-first-chapter" => onion::LintCode::VerseBeforeFirstChapter,
        "note-submarker-outside-note" => onion::LintCode::NoteSubmarkerOutsideNote,
        "duplicate-id-marker" => onion::LintCode::DuplicateIdMarker,
        "id-marker-not-at-file-start" => onion::LintCode::IdMarkerNotAtFileStart,
        "chapter-metadata-outside-chapter" => onion::LintCode::ChapterMetadataOutsideChapter,
        "verse-metadata-outside-verse" => onion::LintCode::VerseMetadataOutsideVerse,
        "missing-chapter-number" => onion::LintCode::MissingChapterNumber,
        "missing-verse-number" => onion::LintCode::MissingVerseNumber,
        "missing-milestone-self-close" => onion::LintCode::MissingMilestoneSelfClose,
        "implicitly-closed-marker" => onion::LintCode::ImplicitlyClosedMarker,
        "stray-close-marker" => onion::LintCode::StrayCloseMarker,
        "misnested-close-marker" => onion::LintCode::MisnestedCloseMarker,
        "unclosed-note" => onion::LintCode::UnclosedNote,
        "unclosed-marker-at-eof" => onion::LintCode::UnclosedMarkerAtEof,
        "duplicate-chapter-number" => onion::LintCode::DuplicateChapterNumber,
        "chapter-expected-increase-by-one" => onion::LintCode::ChapterExpectedIncreaseByOne,
        "duplicate-verse-number" => onion::LintCode::DuplicateVerseNumber,
        "verse-expected-increase-by-one" => onion::LintCode::VerseExpectedIncreaseByOne,
        "invalid-number-range" => onion::LintCode::InvalidNumberRange,
        "number-range-not-preceded-by-marker-expecting-number" => {
            onion::LintCode::NumberRangeNotPrecededByMarkerExpectingNumber
        }
        "verse-text-follows-verse-range" => onion::LintCode::VerseTextFollowsVerseRange,
        "unknown-marker" => onion::LintCode::UnknownMarker,
        "unknown-close-marker" => onion::LintCode::UnknownCloseMarker,
        "inconsistent-chapter-label" => onion::LintCode::InconsistentChapterLabel,
        _ => return None,
    })
}

fn token_kind_to_string(kind: &onion::TokenKind) -> String {
    match kind {
        onion::TokenKind::HorizontalWhitespace => "horizontalWhitespace".to_string(),
        onion::TokenKind::VerticalWhitespace => "verticalWhitespace".to_string(),
        onion::TokenKind::Marker => "marker".to_string(),
        onion::TokenKind::EndMarker => "endMarker".to_string(),
        onion::TokenKind::Milestone => "milestone".to_string(),
        onion::TokenKind::MilestoneEnd => "milestoneEnd".to_string(),
        onion::TokenKind::Attributes => "attributes".to_string(),
        onion::TokenKind::BookCode => "bookCode".to_string(),
        onion::TokenKind::Number => "number".to_string(),
        onion::TokenKind::Text => "text".to_string(),
    }
}

fn map_token_kind(kind: &str) -> onion::TokenKind {
    match kind {
        "marker" => onion::TokenKind::Marker,
        "endMarker" => onion::TokenKind::EndMarker,
        "milestone" => onion::TokenKind::Milestone,
        "milestoneEnd" => onion::TokenKind::MilestoneEnd,
        "attributes" | "attrPair" => onion::TokenKind::Attributes,
        "bookCode" => onion::TokenKind::BookCode,
        "number" | "numberRange" => onion::TokenKind::Number,
        "nl" | "verticalWhitespace" => onion::TokenKind::VerticalWhitespace,
        "ws" | "horizontalWhitespace" => onion::TokenKind::HorizontalWhitespace,
        _ => onion::TokenKind::Text,
    }
}

fn map_span(span: Range<usize>) -> SpanDto {
    SpanDto {
        start: span.start,
        end: span.end,
    }
}

fn map_core_token(token: onion::FlatToken) -> FlatTokenDto {
    FlatTokenDto {
        id: token.id,
        kind: token_kind_to_string(&token.kind),
        span_start: token.span.start,
        span_end: token.span.end,
        sid: token.sid,
        marker: token.marker,
        text: token.text,
    }
}

fn map_template(template: onion::TokenTemplate) -> TokenTemplateDto {
    TokenTemplateDto {
        kind: token_kind_to_string(&template.kind),
        text: template.text,
        marker: template.marker,
        sid: template.sid,
    }
}

fn map_fix(fix: onion::TokenFix) -> TokenFixDto {
    match fix {
        onion::TokenFix::ReplaceToken {
            label,
            target_token_id,
            replacements,
        } => TokenFixDto::ReplaceToken {
            label,
            target_token_id,
            replacements: replacements.into_iter().map(map_template).collect(),
        },
        onion::TokenFix::InsertAfter {
            label,
            target_token_id,
            insert,
        } => TokenFixDto::InsertAfter {
            label,
            target_token_id,
            insert: insert.into_iter().map(map_template).collect(),
        },
    }
}

fn map_issue(issue: onion::LintIssue) -> LintIssueDto {
    LintIssueDto {
        code: issue.code.as_str().to_string(),
        message: issue.message,
        span: map_span(issue.span),
        related_span: issue.related_span.map(map_span),
        token_id: issue.token_id,
        related_token_id: issue.related_token_id,
        sid: issue.sid,
        fix: issue.fix.map(map_fix),
    }
}

fn map_diff(diff: onion::ChapterTokenDiff<onion::FlatToken>) -> DiffDto {
    DiffDto {
        block_id: diff.block_id,
        semantic_sid: diff.semantic_sid,
        status: match diff.status {
            onion::DiffStatus::Added => "added".to_string(),
            onion::DiffStatus::Deleted => "deleted".to_string(),
            onion::DiffStatus::Modified => "modified".to_string(),
            onion::DiffStatus::Unchanged => "unchanged".to_string(),
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

fn map_token_alignment(alignment: onion::TokenAlignment) -> TokenAlignmentDto {
    TokenAlignmentDto {
        change: match alignment.change {
            onion::DiffTokenChange::Unchanged => "unchanged",
            onion::DiffTokenChange::Added => "added",
            onion::DiffTokenChange::Deleted => "deleted",
            onion::DiffTokenChange::Modified => "modified",
        }
        .to_string(),
        counterpart_index: alignment.counterpart_index,
    }
}

fn map_undo_side(side: onion::DiffUndoSide) -> &'static str {
    match side {
        onion::DiffUndoSide::Original => "original",
        onion::DiffUndoSide::Current => "current",
    }
}

fn map_transform_change(change: onion::TokenTransformChange) -> TokenTransformChangeDto {
    TokenTransformChangeDto {
        kind: match change.kind {
            onion::TokenTransformKind::Fix => "fix".to_string(),
            onion::TokenTransformKind::Format => "format".to_string(),
        },
        label: change.label,
        target_token_id: change.target_token_id,
    }
}

fn map_skipped_transform(skipped: onion::SkippedTokenTransform) -> SkippedTokenTransformDto {
    SkippedTokenTransformDto {
        kind: match skipped.kind {
            onion::TokenTransformKind::Fix => "fix".to_string(),
            onion::TokenTransformKind::Format => "format".to_string(),
        },
        label: skipped.label,
        target_token_id: skipped.target_token_id,
        reason: match skipped.reason {
            onion::TokenTransformSkipReason::TokenNotFound => "tokenNotFound".to_string(),
            onion::TokenTransformSkipReason::EmptyReplacement => "emptyReplacement".to_string(),
        },
    }
}

fn map_transform_result(
    result: onion::TokenTransformResult<onion::FlatToken>,
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

fn parse_flat_tokens(tokens: Vec<FlatTokenDto>) -> Vec<FlatTokenInput> {
    tokens
        .into_iter()
        .map(|token| FlatTokenInput {
            id: token.id,
            kind: map_token_kind(&token.kind),
            span: token.span_start..token.span_end,
            sid: token.sid,
            marker: token.marker,
            text: token.text,
        })
        .collect()
}

fn parse_core_flat_tokens(tokens: Vec<FlatTokenDto>) -> Vec<onion::FlatToken> {
    parse_flat_tokens(tokens)
        .into_iter()
        .map(|token| onion::FlatToken {
            id: token.id,
            kind: token.kind,
            span: token.span,
            sid: token.sid,
            marker: token.marker,
            text: token.text,
        })
        .collect()
}

fn map_token_lint_options(options: Option<TokenLintOptionsDto>) -> onion::TokenLintOptions {
    onion::TokenLintOptions {
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
                        lint_code_from_str(&suppression.code).map(|code| onion::LintSuppression {
                            code,
                            span: suppression.span.start..suppression.span.end,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default(),
    }
}

fn map_lint_options(options: Option<LintOptionsDto>) -> onion::LintOptions {
    onion::LintOptions {
        include_parse_recoveries: options
            .as_ref()
            .map(|o| o.include_parse_recoveries)
            .unwrap_or(true),
        token_view: options
            .as_ref()
            .map(|o| onion::TokenViewOptions {
                whitespace_policy: if o.token_view.merge_horizontal_whitespace {
                    onion::WhitespacePolicy::MergeToVisible
                } else {
                    onion::WhitespacePolicy::Preserve
                },
            })
            .unwrap_or_default(),
        token_rules: map_token_lint_options(options.map(|o| o.token_rules)),
    }
}

#[tauri::command]
pub fn usfm_onion_tokens_from_usfm(
    source: String,
    options: Option<IntoTokensOptionsDto>,
) -> Result<Vec<FlatTokenDto>, String> {
    let document = onion::parse(&source);
    let tokens = onion::into_tokens(
        &document,
        options
            .map(map_whitespace_policy)
            .unwrap_or_else(|| onion::IntoTokensOptions {
                merge_horizontal_whitespace: false,
            }),
    );
    Ok(tokens.into_iter().map(map_core_token).collect())
}

#[tauri::command]
pub fn usfm_onion_tokens_from_path(
    path: String,
    options: Option<IntoTokensOptionsDto>,
) -> Result<Vec<FlatTokenDto>, String> {
    let source = read_usfm_source_from_path(&path)?;
    usfm_onion_tokens_from_usfm(source, options)
}

#[tauri::command]
pub fn usfm_onion_project_usfm(
    source: String,
    options: Option<ProjectUsfmOptionsDto>,
) -> Result<ProjectedUsfmDocumentDto, String> {
    let projection = onion::project_usfm(
        &source,
        onion::ProjectUsfmOptions {
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
        editor_tree: projection.editor_tree,
        lint_issues: projection
            .lint_issues
            .map(|issues| issues.into_iter().map(map_issue).collect()),
    })
}

#[tauri::command]
pub fn usfm_onion_project_path(
    path: String,
    options: Option<ProjectUsfmOptionsDto>,
) -> Result<ProjectedUsfmDocumentDto, String> {
    let source = read_usfm_source_from_path(&path)?;
    usfm_onion_project_usfm(source, options)
}

#[tauri::command]
pub fn usfm_onion_project_paths(
    paths: Vec<String>,
    options: Option<ProjectUsfmOptionsDto>,
    batch_options: Option<BatchExecutionOptionsDto>,
) -> Result<Vec<ProjectedUsfmDocumentDto>, String> {
    let options = options.unwrap_or_default();
    let sources = read_sources_from_paths(paths, batch_options.clone())?;
    let projections = onion::project_usfm_batch(
        &sources,
        onion::ProjectUsfmOptions {
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
            editor_tree: projection.editor_tree,
            lint_issues: projection
                .lint_issues
                .map(|issues| issues.into_iter().map(map_issue).collect()),
        })
        .collect())
}

#[tauri::command]
pub fn usfm_onion_lint_usfm(
    source: String,
    options: Option<LintOptionsDto>,
) -> Result<Vec<LintIssueDto>, String> {
    let issues = onion::lint_document(&onion::parse(&source), map_lint_options(options));
    Ok(issues.into_iter().map(map_issue).collect())
}

#[tauri::command]
pub fn usfm_onion_lint_path(
    path: String,
    options: Option<LintOptionsDto>,
) -> Result<Vec<LintIssueDto>, String> {
    let source = read_usfm_source_from_path(&path)?;
    usfm_onion_lint_usfm(source, options)
}

#[tauri::command]
pub fn usfm_onion_lint_paths(
    paths: Vec<String>,
    options: Option<LintOptionsDto>,
    batch_options: Option<BatchExecutionOptionsDto>,
) -> Result<Vec<Vec<LintIssueDto>>, String> {
    let sources = read_sources_from_paths(paths, batch_options.clone())?;
    let issues = onion::lint_usfm_sources(
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
        onion::lint_flat_tokens(&parse_flat_tokens(tokens), map_token_lint_options(options));
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
    let issues = onion::lint_flat_token_batches(
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
pub fn usfm_onion_format_tokens(
    tokens: Vec<FlatTokenDto>,
    options: Option<FormatOptionsDto>,
) -> Result<TokenTransformResultDto, String> {
    let tokens = parse_core_flat_tokens(tokens);
    Ok(map_transform_result(onion::format_flat_tokens(
        &tokens,
        map_format_options(options),
    )))
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
    let results = onion::format_flat_token_batches(
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
    let results = onion::format_usfm_sources(
        &sources,
        token_options
            .map(map_whitespace_policy)
            .unwrap_or_else(|| onion::IntoTokensOptions {
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
    Ok(map_transform_result(onion::apply_token_fixes(
        &tokens, &fixes,
    )))
}

#[tauri::command]
pub fn usfm_onion_diff_usfm(
    baseline_usfm: String,
    current_usfm: String,
    token_options: Option<IntoTokensOptionsDto>,
    build_options: Option<BuildSidBlocksOptionsDto>,
) -> Result<Vec<DiffDto>, String> {
    let diffs = onion::diff_usfm(
        &baseline_usfm,
        &current_usfm,
        &map_token_view_options(token_options),
        &onion::BuildSidBlocksOptions {
            allow_empty_sid: build_options.map(|o| o.allow_empty_sid).unwrap_or(true),
        },
    );
    Ok(diffs.into_iter().map(map_diff).collect())
}

#[tauri::command]
pub fn usfm_onion_diff_paths(
    baseline_path: String,
    current_path: String,
    token_options: Option<IntoTokensOptionsDto>,
    build_options: Option<BuildSidBlocksOptionsDto>,
) -> Result<Vec<DiffDto>, String> {
    let baseline_usfm = read_usfm_source_from_path(&baseline_path)?;
    let current_usfm = read_usfm_source_from_path(&current_path)?;
    usfm_onion_diff_usfm(baseline_usfm, current_usfm, token_options, build_options)
}

#[tauri::command]
pub fn usfm_onion_diff_usfm_by_chapter(
    baseline_usfm: String,
    current_usfm: String,
    token_options: Option<IntoTokensOptionsDto>,
    build_options: Option<BuildSidBlocksOptionsDto>,
) -> Result<Vec<ChapterDiffEntryDto>, String> {
    let map = onion::diff_usfm_by_chapter(
        &baseline_usfm,
        &current_usfm,
        &map_token_view_options(token_options),
        &onion::BuildSidBlocksOptions {
            allow_empty_sid: build_options.map(|o| o.allow_empty_sid).unwrap_or(true),
        },
    );

    let mut entries = Vec::new();
    for (book_code, chapters) in map {
        for (chapter_num, diffs) in chapters {
            entries.push(ChapterDiffEntryDto {
                book_code: book_code.clone(),
                chapter_num,
                diffs: diffs.into_iter().map(map_diff).collect(),
            });
        }
    }
    Ok(entries)
}

#[tauri::command]
pub fn usfm_onion_diff_paths_by_chapter(
    baseline_path: String,
    current_path: String,
    token_options: Option<IntoTokensOptionsDto>,
    build_options: Option<BuildSidBlocksOptionsDto>,
) -> Result<Vec<ChapterDiffEntryDto>, String> {
    let baseline_usfm = read_usfm_source_from_path(&baseline_path)?;
    let current_usfm = read_usfm_source_from_path(&current_path)?;
    usfm_onion_diff_usfm_by_chapter(baseline_usfm, current_usfm, token_options, build_options)
}

#[tauri::command]
pub fn usfm_onion_diff_path_pairs(
    path_pairs: Vec<DiffPathPairDto>,
    token_options: Option<IntoTokensOptionsDto>,
    build_options: Option<BuildSidBlocksOptionsDto>,
    batch_options: Option<BatchExecutionOptionsDto>,
) -> Result<Vec<Vec<DiffDto>>, String> {
    let token_options = map_token_view_options(token_options);
    let build_options = onion::BuildSidBlocksOptions {
        allow_empty_sid: build_options.map(|o| o.allow_empty_sid).unwrap_or(true),
    };
    let map_diff_pair = |pair: DiffPathPairDto| -> Result<Vec<DiffDto>, String> {
        let baseline_usfm = read_usfm_source_from_path(&pair.baseline_path)?;
        let current_usfm = read_usfm_source_from_path(&pair.current_path)?;
        Ok(onion::diff_usfm(
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
    Ok(onion::diff_tokens(
        &baseline,
        &current,
        &onion::BuildSidBlocksOptions {
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
    Ok(onion::apply_revert_by_block_id(
        &block_id,
        &baseline,
        &current,
        &onion::BuildSidBlocksOptions {
            allow_empty_sid: build_options.map(|o| o.allow_empty_sid).unwrap_or(true),
        },
    )
    .into_iter()
    .map(map_core_token)
    .collect())
}

#[tauri::command]
pub fn usfm_onion_to_usj(source: String) -> Result<onion::UsjDocument, String> {
    let document = onion::parse(&source);
    Ok(onion::into_usj(&document))
}

#[tauri::command]
pub fn usfm_onion_to_usj_path(path: String) -> Result<onion::UsjDocument, String> {
    let source = read_usfm_source_from_path(&path)?;
    usfm_onion_to_usj(source)
}

#[tauri::command]
pub fn usfm_onion_to_usj_paths(
    paths: Vec<String>,
    batch_options: Option<BatchExecutionOptionsDto>,
) -> Result<Vec<onion::UsjDocument>, String> {
    let map_usj = |path: String| -> Result<onion::UsjDocument, String> {
        let source = read_usfm_source_from_path(&path)?;
        usfm_onion_to_usj(source)
    };
    if should_parallelize(batch_options) {
        paths.into_par_iter().map(map_usj).collect()
    } else {
        paths.into_iter().map(map_usj).collect()
    }
}

#[tauri::command]
pub fn usfm_onion_from_usj(document: onion::UsjDocument) -> Result<String, String> {
    onion::from_usj(&document).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn usfm_onion_to_usx(source: String) -> Result<String, String> {
    let document = onion::parse(&source);
    onion::into_usx(&document).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn usfm_onion_to_usx_path(path: String) -> Result<String, String> {
    let source = read_usfm_source_from_path(&path)?;
    usfm_onion_to_usx(source)
}

#[tauri::command]
pub fn usfm_onion_to_usx_paths(
    paths: Vec<String>,
    batch_options: Option<BatchExecutionOptionsDto>,
) -> Result<Vec<String>, String> {
    let map_usx = |path: String| -> Result<String, String> {
        let source = read_usfm_source_from_path(&path)?;
        usfm_onion_to_usx(source)
    };
    if should_parallelize(batch_options) {
        paths.into_par_iter().map(map_usx).collect()
    } else {
        paths.into_iter().map(map_usx).collect()
    }
}

#[tauri::command]
pub fn usfm_onion_from_usx(value: String) -> Result<String, String> {
    onion::from_usx(&value).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn usfm_onion_to_vref(source: String) -> Result<Vec<VrefEntryDto>, String> {
    let document = onion::parse(&source);
    Ok(onion::into_vref(&document)
        .into_iter()
        .map(|(reference, text)| VrefEntryDto { reference, text })
        .collect())
}

#[tauri::command]
pub fn usfm_onion_to_vref_path(path: String) -> Result<Vec<VrefEntryDto>, String> {
    let source = read_usfm_source_from_path(&path)?;
    usfm_onion_to_vref(source)
}

#[tauri::command]
pub fn usfm_onion_to_vref_paths(
    paths: Vec<String>,
    batch_options: Option<BatchExecutionOptionsDto>,
) -> Result<Vec<Vec<VrefEntryDto>>, String> {
    let map_vref = |path: String| -> Result<Vec<VrefEntryDto>, String> {
        let source = read_usfm_source_from_path(&path)?;
        usfm_onion_to_vref(source)
    };
    if should_parallelize(batch_options) {
        paths.into_par_iter().map(map_vref).collect()
    } else {
        paths.into_iter().map(map_vref).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_file_path(suffix: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("usfm_onion_{nanos}_{suffix}"))
    }

    fn write_temp_utf8(contents: &str) -> PathBuf {
        let path = temp_file_path("fixture.usfm");
        fs::write(&path, contents.as_bytes()).expect("should write fixture file");
        path
    }

    #[test]
    fn read_path_accepts_absolute_file() {
        let path = write_temp_utf8("\\id TST Test\n");
        let result = read_usfm_source_from_path(path.to_string_lossy().as_ref());
        assert_eq!(
            result.expect("should read absolute path"),
            "\\id TST Test\n"
        );
        let _ = fs::remove_file(path);
    }

    #[test]
    fn read_path_rejects_relative_path() {
        let result = read_usfm_source_from_path("relative/path.usfm");
        assert_eq!(result, Err("path must be absolute".to_string()));
    }

    #[test]
    fn read_path_rejects_missing_file() {
        let missing_path = temp_file_path("missing.usfm");
        let result = read_usfm_source_from_path(missing_path.to_string_lossy().as_ref());
        assert_eq!(result, Err("file not found".to_string()));
    }

    #[test]
    fn read_path_rejects_directory() {
        let dir = std::env::temp_dir();
        let result = read_usfm_source_from_path(dir.to_string_lossy().as_ref());
        assert_eq!(result, Err("path is not a file".to_string()));
    }

    #[test]
    fn read_path_rejects_non_utf8_file() {
        let path = temp_file_path("non_utf8.usfm");
        fs::write(&path, [0xff, 0xfe]).expect("should write non-utf8 bytes");
        let result = read_usfm_source_from_path(path.to_string_lossy().as_ref());
        assert_eq!(result, Err("failed to decode utf-8".to_string()));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn path_commands_match_source_commands() {
        let baseline = "\\id GEN Baseline\n\\c 1\n\\p\n\\v 1 In the beginning.\n";
        let current = "\\id GEN Baseline\n\\c 1\n\\p\n\\v 1 In the very beginning.\n";
        let baseline_path = write_temp_utf8(baseline);
        let current_path = write_temp_utf8(current);
        let baseline_path_str = baseline_path.to_string_lossy().to_string();
        let current_path_str = current_path.to_string_lossy().to_string();

        let project_from_source =
            usfm_onion_project_usfm(baseline.to_string(), None).expect("project from source");
        let project_from_path =
            usfm_onion_project_path(baseline_path_str.clone(), None).expect("project from path");
        let project_batch_from_path = usfm_onion_project_paths(
            vec![baseline_path_str.clone()],
            None,
            Some(BatchExecutionOptionsDto { parallel: false }),
        )
        .expect("batch project from path");
        assert_eq!(
            serde_json::to_value(&project_from_path).expect("path projection json"),
            serde_json::to_value(&project_from_source).expect("source projection json")
        );
        assert_eq!(
            serde_json::to_value(project_batch_from_path).expect("batch path projection json"),
            serde_json::to_value(vec![project_from_source]).expect("single source projection json")
        );

        let tokens_from_source =
            usfm_onion_tokens_from_usfm(baseline.to_string(), None).expect("tokens from source");
        let tokens_from_path =
            usfm_onion_tokens_from_path(baseline_path_str.clone(), None).expect("tokens from path");
        assert_eq!(
            serde_json::to_value(tokens_from_path).expect("path tokens json"),
            serde_json::to_value(tokens_from_source).expect("source tokens json")
        );

        let lint_from_source =
            usfm_onion_lint_usfm(baseline.to_string(), None).expect("lint from source");
        let lint_from_path =
            usfm_onion_lint_path(baseline_path_str.clone(), None).expect("lint from path");
        let lint_batch_from_path = usfm_onion_lint_paths(
            vec![baseline_path_str.clone()],
            None,
            Some(BatchExecutionOptionsDto { parallel: false }),
        )
        .expect("lint batch from path");
        assert_eq!(
            serde_json::to_value(lint_from_path).expect("path lint json"),
            serde_json::to_value(lint_from_source).expect("source lint json")
        );
        assert_eq!(
            serde_json::to_value(lint_batch_from_path).expect("path lint batch json"),
            serde_json::to_value(vec![
                usfm_onion_lint_usfm(baseline.to_string(), None).expect("lint source expected")
            ])
            .expect("source lint batch json")
        );

        let format_batch_from_path = usfm_onion_format_paths(
            vec![baseline_path_str.clone()],
            Some(IntoTokensOptionsDto {
                merge_horizontal_whitespace: true,
            }),
            Some(FormatOptionsDto::default()),
            Some(BatchExecutionOptionsDto { parallel: false }),
        )
        .expect("format batch from path");
        let format_expected = usfm_onion_format_tokens(
            usfm_onion_tokens_from_usfm(
                baseline.to_string(),
                Some(IntoTokensOptionsDto {
                    merge_horizontal_whitespace: true,
                }),
            )
            .expect("tokens source for format expected"),
            Some(FormatOptionsDto::default()),
        )
        .expect("format source expected");
        assert_eq!(
            serde_json::to_value(format_batch_from_path).expect("path format batch json"),
            serde_json::to_value(vec![format_expected]).expect("source format batch json")
        );

        let usj_from_source = usfm_onion_to_usj(baseline.to_string()).expect("usj from source");
        let usj_from_path =
            usfm_onion_to_usj_path(baseline_path_str.clone()).expect("usj from path");
        let usj_batch_from_path = usfm_onion_to_usj_paths(
            vec![baseline_path_str.clone()],
            Some(BatchExecutionOptionsDto { parallel: false }),
        )
        .expect("usj batch from path");
        assert_eq!(
            serde_json::to_value(usj_from_path).expect("path usj json"),
            serde_json::to_value(usj_from_source).expect("source usj json")
        );
        assert_eq!(
            serde_json::to_value(usj_batch_from_path).expect("path usj batch json"),
            serde_json::to_value(vec![
                usfm_onion_to_usj(baseline.to_string()).expect("usj source expected")
            ])
            .expect("source usj batch json")
        );

        let usx_from_source = usfm_onion_to_usx(baseline.to_string()).expect("usx from source");
        let usx_from_path =
            usfm_onion_to_usx_path(baseline_path_str.clone()).expect("usx from path");
        let usx_batch_from_path = usfm_onion_to_usx_paths(
            vec![baseline_path_str.clone()],
            Some(BatchExecutionOptionsDto { parallel: false }),
        )
        .expect("usx batch from path");
        assert_eq!(usx_from_path, usx_from_source);
        assert_eq!(
            serde_json::to_value(usx_batch_from_path).expect("path usx batch json"),
            serde_json::to_value(vec![
                usfm_onion_to_usx(baseline.to_string()).expect("usx source expected")
            ])
            .expect("source usx batch json")
        );

        let vref_from_source = usfm_onion_to_vref(baseline.to_string()).expect("vref from source");
        let vref_from_path =
            usfm_onion_to_vref_path(baseline_path_str.clone()).expect("vref from path");
        let vref_batch_from_path = usfm_onion_to_vref_paths(
            vec![baseline_path_str.clone()],
            Some(BatchExecutionOptionsDto { parallel: false }),
        )
        .expect("vref batch from path");
        assert_eq!(
            serde_json::to_value(vref_from_path).expect("path vref json"),
            serde_json::to_value(vref_from_source).expect("source vref json")
        );
        assert_eq!(
            serde_json::to_value(vref_batch_from_path).expect("path vref batch json"),
            serde_json::to_value(vec![
                usfm_onion_to_vref(baseline.to_string()).expect("vref source expected")
            ])
            .expect("source vref batch json")
        );

        let diff_from_source =
            usfm_onion_diff_usfm(baseline.to_string(), current.to_string(), None, None)
                .expect("diff from source");
        let diff_from_path = usfm_onion_diff_paths(
            baseline_path_str.clone(),
            current_path_str.clone(),
            None,
            None,
        )
        .expect("diff from path");
        assert_eq!(
            serde_json::to_value(diff_from_path).expect("path diff json"),
            serde_json::to_value(diff_from_source).expect("source diff json")
        );

        let diff_batch_from_path_pairs = usfm_onion_diff_path_pairs(
            vec![DiffPathPairDto {
                baseline_path: baseline_path_str.clone(),
                current_path: current_path_str.clone(),
            }],
            None,
            None,
            Some(BatchExecutionOptionsDto { parallel: false }),
        )
        .expect("diff path pairs");
        assert_eq!(
            serde_json::to_value(diff_batch_from_path_pairs).expect("path diff pair json"),
            serde_json::to_value(vec![usfm_onion_diff_usfm(
                baseline.to_string(),
                current.to_string(),
                None,
                None,
            )
            .expect("source diff pair expected")])
            .expect("source diff pair json")
        );

        let diff_by_chapter_from_source =
            usfm_onion_diff_usfm_by_chapter(baseline.to_string(), current.to_string(), None, None)
                .expect("diff by chapter from source");
        let diff_by_chapter_from_path =
            usfm_onion_diff_paths_by_chapter(baseline_path_str, current_path_str, None, None)
                .expect("diff by chapter from path");
        assert_eq!(
            serde_json::to_value(diff_by_chapter_from_path).expect("path chapter diff json"),
            serde_json::to_value(diff_by_chapter_from_source).expect("source chapter diff json")
        );

        let _ = fs::remove_file(baseline_path);
        let _ = fs::remove_file(current_path);
    }

    #[test]
    fn token_batch_commands_match_single_token_commands() {
        let source_a = "\\id GEN Test\n\\c 1\n\\p\n\\v 1 In the beginning.\n";
        let source_b = "\\id GEN Test\n\\c 1\n\\p\n\\v 1 In the very beginning.\n";
        let tokens_a =
            usfm_onion_tokens_from_usfm(source_a.to_string(), None).expect("tokens A from source");
        let tokens_b =
            usfm_onion_tokens_from_usfm(source_b.to_string(), None).expect("tokens B from source");

        let lint_batch = usfm_onion_lint_token_batches(
            vec![tokens_a.clone(), tokens_b.clone()],
            None,
            Some(BatchExecutionOptionsDto { parallel: false }),
        )
        .expect("lint token batches");
        let lint_a = usfm_onion_lint_tokens(tokens_a.clone(), None).expect("lint tokens A");
        let lint_b = usfm_onion_lint_tokens(tokens_b.clone(), None).expect("lint tokens B");
        assert_eq!(
            serde_json::to_value(lint_batch).expect("lint batch json"),
            serde_json::to_value(vec![lint_a, lint_b]).expect("lint single json")
        );

        let format_options = Some(FormatOptionsDto::default());
        let format_batch = usfm_onion_format_token_batches(
            vec![tokens_a.clone(), tokens_b.clone()],
            format_options.clone(),
            Some(BatchExecutionOptionsDto { parallel: false }),
        )
        .expect("format token batches");
        let format_a =
            usfm_onion_format_tokens(tokens_a, format_options.clone()).expect("format tokens A");
        let format_b = usfm_onion_format_tokens(tokens_b, format_options).expect("format tokens B");
        assert_eq!(
            serde_json::to_value(format_batch).expect("format batch json"),
            serde_json::to_value(vec![format_a, format_b]).expect("format single json")
        );
    }
}
