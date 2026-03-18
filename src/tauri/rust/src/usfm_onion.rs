use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use usfm_onion as onion;
use usfm_onion::token::Span;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
// @ai -> avoid "dto" talk. Audit this file to be ensure we are recreating structs and types already in the crate itself. This whole file should be a really thin wrapper to go from web (invoke in interface) -> tauri lister -> crate -> back to web. I think it is, but just double check
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
pub struct SpanDto {
    pub start: usize,
    pub end: usize,
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

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LintSuppressionDto {
    pub code: String,
    pub sid: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LintOptionsDto {
    #[serde(default)]
    pub enabled_codes: Option<Vec<String>>,
    #[serde(default)]
    pub disabled_codes: Vec<String>,
    #[serde(default)]
    pub suppressed: Vec<LintSuppressionDto>,
    #[serde(default)]
    pub allow_implicit_chapter_content_verse: bool,
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
    pub message_params: BTreeMap<String, String>,
    pub span: Option<SpanDto>,
    pub related_span: Option<SpanDto>,
    pub token_id: Option<String>,
    pub related_token_id: Option<String>,
    pub sid: Option<String>,
    pub fix: Option<TokenFixDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum TokenFixDto {
    ReplaceToken {
        code: String,
        label: String,
        label_params: BTreeMap<String, String>,
        target_token_id: String,
        replacements: Vec<TokenTemplateDto>,
    },
    DeleteToken {
        code: String,
        label: String,
        label_params: BTreeMap<String, String>,
        target_token_id: String,
    },
    InsertAfter {
        code: String,
        label: String,
        label_params: BTreeMap<String, String>,
        target_token_id: String,
        insert: Vec<TokenTemplateDto>,
    },
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
#[serde(rename_all = "camelCase")]
pub struct ProjectedUsfmDocumentDto {
    pub tokens: Vec<FlatTokenDto>,
    pub lint_issues: Option<Vec<LintIssueDto>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkerInfoDto {
    pub marker: String,
    pub canonical: Option<String>,
    pub known: bool,
    pub deprecated: bool,
    pub category: String,
    pub kind: String,
    pub family: Option<String>,
    pub family_role: Option<String>,
    pub note_family: Option<String>,
    pub note_subkind: Option<String>,
    pub inline_context: Option<String>,
    pub default_attribute: Option<String>,
    pub contexts: Vec<String>,
    pub block_behavior: Option<String>,
    pub closing_behavior: Option<String>,
    pub source: Option<String>,
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
    pub info_by_marker: BTreeMap<String, MarkerInfoDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenAlignmentDto {
    pub change: String,
    pub counterpart_index: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidBlockDto {
    pub block_id: String,
    pub semantic_sid: String,
    pub start: usize,
    pub end_exclusive: usize,
    pub prev_block_id: Option<String>,
    pub text_full: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffDto {
    pub block_id: String,
    pub semantic_sid: String,
    pub status: String,
    pub original: Option<SidBlockDto>,
    pub current: Option<SidBlockDto>,
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
pub struct TokenTransformChangeDto {
    pub kind: String,
    pub code: String,
    pub label: String,
    pub label_params: BTreeMap<String, String>,
    pub target_token_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedTokenTransformDto {
    pub kind: String,
    pub code: String,
    pub label: String,
    pub label_params: BTreeMap<String, String>,
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

fn map_execution(options: Option<BatchExecutionOptionsDto>) -> onion::ExecutionMode {
    if should_parallelize(options) {
        onion::ExecutionMode::Parallel
    } else {
        onion::ExecutionMode::Serial
    }
}

fn read_sources_from_paths(
    paths: Vec<String>,
    batch_options: Option<BatchExecutionOptionsDto>,
) -> Result<Vec<String>, String> {
    if should_parallelize(batch_options) {
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

fn map_span(span: Span) -> SpanDto {
    SpanDto {
        start: span.start as usize,
        end: span.end as usize,
    }
}

fn map_token_kind(kind: onion::TokenKind) -> String {
    match kind {
        onion::TokenKind::Newline => "newline",
        onion::TokenKind::OptBreak => "optBreak",
        onion::TokenKind::Marker => "marker",
        onion::TokenKind::EndMarker => "endMarker",
        onion::TokenKind::Milestone => "milestone",
        onion::TokenKind::MilestoneEnd => "milestoneEnd",
        onion::TokenKind::BookCode => "bookCode",
        onion::TokenKind::Number => "number",
        onion::TokenKind::Text => "text",
        onion::TokenKind::AttributeList => "attributeList",
    }
    .to_string()
}

fn parse_token_kind(kind: &str) -> onion::TokenKind {
    match kind {
        "newline" | "verticalWhitespace" => onion::TokenKind::Newline,
        "optBreak" => onion::TokenKind::OptBreak,
        "marker" => onion::TokenKind::Marker,
        "endMarker" => onion::TokenKind::EndMarker,
        "milestone" => onion::TokenKind::Milestone,
        "milestoneEnd" => onion::TokenKind::MilestoneEnd,
        "bookCode" => onion::TokenKind::BookCode,
        "number" | "numberRange" => onion::TokenKind::Number,
        "attributeList" => onion::TokenKind::AttributeList,
        _ => onion::TokenKind::Text,
    }
}

fn map_flat_token(token: &onion::Token<'_>) -> FlatTokenDto {
    FlatTokenDto {
        id: format!("{}-{}", token.id.book_code, token.id.index),
        kind: map_token_kind(token.kind()),
        span: map_span(token.span),
        sid: token
            .sid
            .as_ref()
            .map(|sid| format!("{} {}:{}", sid.book_code, sid.chapter, sid.verse)),
        marker: token.marker_name().map(ToString::to_string),
        text: token.source.to_string(),
    }
}

fn map_format_token(token: &onion::FormatToken) -> FlatTokenDto {
    FlatTokenDto {
        id: token.id.clone().unwrap_or_default(),
        kind: map_token_kind(token.kind),
        span: token.span.map(map_span).unwrap_or(SpanDto {
            start: 0,
            end: token.text.len(),
        }),
        sid: token.sid.clone(),
        marker: token.marker.clone(),
        text: token.text.clone(),
    }
}

fn map_tokens(tokens: &[onion::Token<'_>]) -> Vec<FlatTokenDto> {
    tokens.iter().map(map_flat_token).collect()
}

fn map_format_tokens(tokens: &[onion::FormatToken]) -> Vec<FlatTokenDto> {
    tokens.iter().map(map_format_token).collect()
}

fn map_flat_token_dto(token: FlatTokenDto) -> onion::FormatToken {
    onion::FormatToken {
        kind: parse_token_kind(&token.kind),
        text: token.text,
        marker: token.marker,
        sid: token.sid,
        id: (!token.id.is_empty()).then_some(token.id),
        span: Some(Span {
            start: token.span.start as u32,
            end: token.span.end as u32,
        }),
        structural: None,
        number_info: None,
        marker_profile: None,
    }
}

fn map_lint_code(code: &str) -> Option<onion::LintCode> {
    serde_json::from_str::<onion::LintCode>(&format!("\"{code}\"")).ok()
}

fn map_lint_options(options: Option<LintOptionsDto>) -> onion::LintOptions {
    let Some(options) = options else {
        return onion::LintOptions::default();
    };
    onion::LintOptions {
        enabled_codes: options.enabled_codes.map(|codes| {
            codes
                .into_iter()
                .filter_map(|code| map_lint_code(&code))
                .collect()
        }),
        disabled_codes: options
            .disabled_codes
            .into_iter()
            .filter_map(|code| map_lint_code(&code))
            .collect(),
        suppressed: options
            .suppressed
            .into_iter()
            .filter_map(|suppression| {
                Some(onion::LintSuppression {
                    code: map_lint_code(&suppression.code)?,
                    sid: suppression.sid,
                })
            })
            .collect(),
        allow_implicit_chapter_content_verse: options.allow_implicit_chapter_content_verse,
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

fn map_lint_issue(issue: &onion::LintIssue) -> LintIssueDto {
    LintIssueDto {
        code: issue.code.code().to_string(),
        severity: match issue.severity {
            onion::LintSeverity::Error => "error".to_string(),
            onion::LintSeverity::Warning => "warning".to_string(),
        },
        marker: issue.marker.clone(),
        message: issue.message.clone(),
        message_params: BTreeMap::new(),
        span: issue.span.map(map_span),
        related_span: issue.related_span.map(map_span),
        token_id: issue.token_id.clone(),
        related_token_id: issue.related_token_id.clone(),
        sid: issue.sid.clone(),
        fix: issue.fix.clone().map(map_token_fix),
    }
}

fn map_token_fix(fix: onion::TokenFix) -> TokenFixDto {
    match fix {
        onion::TokenFix::ReplaceToken {
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
            replacements: replacements
                .into_iter()
                .map(|token| TokenTemplateDto {
                    kind: map_token_kind(token.kind).to_string(),
                    text: token.text,
                    marker: token.marker,
                    sid: token.sid,
                })
                .collect(),
        },
        onion::TokenFix::DeleteToken {
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
        onion::TokenFix::InsertAfter {
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
            insert: insert
                .into_iter()
                .map(|token| TokenTemplateDto {
                    kind: map_token_kind(token.kind).to_string(),
                    text: token.text,
                    marker: token.marker,
                    sid: token.sid,
                })
                .collect(),
        },
    }
}

fn map_token_template_dto(template: TokenTemplateDto) -> onion::TokenTemplate {
    onion::TokenTemplate {
        kind: parse_token_kind(&template.kind),
        text: template.text,
        marker: template.marker,
        sid: template.sid,
    }
}

fn parse_token_fix_dto(fix: TokenFixDto) -> Option<onion::TokenFix> {
    match fix {
        TokenFixDto::ReplaceToken {
            code,
            label,
            label_params,
            target_token_id,
            replacements,
        } => Some(onion::TokenFix::ReplaceToken {
            code,
            label,
            label_params,
            target_token_id,
            replacements: replacements
                .into_iter()
                .map(map_token_template_dto)
                .collect(),
        }),
        TokenFixDto::DeleteToken {
            code,
            label,
            label_params,
            target_token_id,
        } => Some(onion::TokenFix::DeleteToken {
            code,
            label,
            label_params,
            target_token_id,
        }),
        TokenFixDto::InsertAfter {
            code,
            label,
            label_params,
            target_token_id,
            insert,
        } => Some(onion::TokenFix::InsertAfter {
            code,
            label,
            label_params,
            target_token_id,
            insert: insert.into_iter().map(map_token_template_dto).collect(),
        }),
    }
}

fn map_projected_document(
    usfm: &onion::Usfm,
    options: ProjectUsfmOptionsDto,
) -> ProjectedUsfmDocumentDto {
    let lint_issues = options.lint_options.map(|lint_options| {
        usfm.lint(map_lint_options(Some(lint_options)))
            .issues
            .iter()
            .map(map_lint_issue)
            .collect::<Vec<_>>()
    });

    ProjectedUsfmDocumentDto {
        tokens: map_tokens(&usfm.tokens()),
        lint_issues: lint_issues.map(|issues| {
            issues
                .into_iter()
                .filter(|issue| {
                    issue.code != "unknown-marker" || issue.marker.as_deref() != Some("s5")
                })
                .collect()
        }),
    }
}

fn map_diff_status(status: onion::DiffStatus) -> String {
    match status {
        onion::DiffStatus::Added => "added",
        onion::DiffStatus::Deleted => "deleted",
        onion::DiffStatus::Modified => "modified",
        onion::DiffStatus::Unchanged => "unchanged",
    }
    .to_string()
}

fn map_token_change(change: onion::DiffTokenChange) -> String {
    match change {
        onion::DiffTokenChange::Unchanged => "unchanged",
        onion::DiffTokenChange::Added => "added",
        onion::DiffTokenChange::Deleted => "deleted",
        onion::DiffTokenChange::Modified => "modified",
    }
    .to_string()
}

fn map_undo_side(side: onion::DiffUndoSide) -> String {
    match side {
        onion::DiffUndoSide::Original => "original",
        onion::DiffUndoSide::Current => "current",
    }
    .to_string()
}

fn map_sid_block(block: &onion::SidBlock) -> SidBlockDto {
    SidBlockDto {
        block_id: block.block_id.clone(),
        semantic_sid: block.semantic_sid.clone(),
        start: block.start,
        end_exclusive: block.end_exclusive,
        prev_block_id: block.prev_block_id.clone(),
        text_full: block.text_full.clone(),
    }
}

fn map_diff(diff: &onion::ChapterTokenDiff<onion::FormatToken>) -> DiffDto {
    DiffDto {
        block_id: diff.block_id.clone(),
        semantic_sid: diff.semantic_sid.clone(),
        status: map_diff_status(diff.status),
        original: diff.original.as_ref().map(map_sid_block),
        current: diff.current.as_ref().map(map_sid_block),
        original_text: diff.original_text.clone(),
        current_text: diff.current_text.clone(),
        original_text_only: diff.original_text_only.clone(),
        current_text_only: diff.current_text_only.clone(),
        is_whitespace_change: diff.is_whitespace_change,
        is_usfm_structure_change: diff.is_usfm_structure_change,
        original_tokens: map_format_tokens(&diff.original_tokens),
        current_tokens: map_format_tokens(&diff.current_tokens),
        original_alignment: diff
            .original_alignment
            .iter()
            .map(|entry| TokenAlignmentDto {
                change: map_token_change(entry.change),
                counterpart_index: entry.counterpart_index,
            })
            .collect(),
        current_alignment: diff
            .current_alignment
            .iter()
            .map(|entry| TokenAlignmentDto {
                change: map_token_change(entry.change),
                counterpart_index: entry.counterpart_index,
            })
            .collect(),
        undo_side: map_undo_side(diff.undo_side),
    }
}

fn marker_category_string(category: onion::MarkerCategory) -> String {
    match category {
        onion::MarkerCategory::Document => "document",
        onion::MarkerCategory::Paragraph => "paragraph",
        onion::MarkerCategory::Character => "character",
        onion::MarkerCategory::NoteContainer => "noteContainer",
        onion::MarkerCategory::NoteSubmarker => "noteSubmarker",
        onion::MarkerCategory::Chapter => "chapter",
        onion::MarkerCategory::Verse => "verse",
        onion::MarkerCategory::MilestoneStart => "milestoneStart",
        onion::MarkerCategory::MilestoneEnd => "milestoneEnd",
        onion::MarkerCategory::Figure => "figure",
        onion::MarkerCategory::SidebarStart => "sidebarStart",
        onion::MarkerCategory::SidebarEnd => "sidebarEnd",
        onion::MarkerCategory::Periph => "periph",
        onion::MarkerCategory::Meta => "meta",
        onion::MarkerCategory::TableRow => "tableRow",
        onion::MarkerCategory::TableCell => "tableCell",
        onion::MarkerCategory::Header => "header",
        onion::MarkerCategory::Unknown => "unknown",
    }
    .to_string()
}

fn marker_kind_string(kind: onion::MarkerKind) -> String {
    match kind {
        onion::MarkerKind::Paragraph => "paragraph",
        onion::MarkerKind::Note => "note",
        onion::MarkerKind::Character => "character",
        onion::MarkerKind::Header => "header",
        onion::MarkerKind::Chapter => "chapter",
        onion::MarkerKind::Verse => "verse",
        onion::MarkerKind::MilestoneStart => "milestoneStart",
        onion::MarkerKind::MilestoneEnd => "milestoneEnd",
        onion::MarkerKind::SidebarStart => "sidebarStart",
        onion::MarkerKind::SidebarEnd => "sidebarEnd",
        onion::MarkerKind::Figure => "figure",
        onion::MarkerKind::Meta => "meta",
        onion::MarkerKind::Periph => "periph",
        onion::MarkerKind::TableRow => "tableRow",
        onion::MarkerKind::TableCell => "tableCell",
        onion::MarkerKind::Unknown => "unknown",
    }
    .to_string()
}

fn map_marker_info(info: &onion::UsfmMarkerInfo) -> MarkerInfoDto {
    MarkerInfoDto {
        marker: info.marker.clone(),
        canonical: info.canonical.clone(),
        known: info.known,
        deprecated: info.deprecated,
        category: marker_category_string(info.category),
        kind: marker_kind_string(info.kind),
        family: info.family.map(|value| format!("{value:?}")),
        family_role: info.family_role.map(|value| format!("{value:?}")),
        note_family: info.note_family.map(|value| format!("{value:?}")),
        note_subkind: info.note_subkind.map(|value| format!("{value:?}")),
        inline_context: info.inline_context.map(|value| format!("{value:?}")),
        default_attribute: info.default_attribute.clone(),
        contexts: info
            .contexts
            .iter()
            .map(|value| format!("{value:?}"))
            .collect(),
        block_behavior: info.block_behavior.map(|value| format!("{value:?}")),
        closing_behavior: info.closing_behavior.map(|value| format!("{value:?}")),
        source: info.source.clone(),
    }
}

#[tauri::command]
pub fn usfm_onion_marker_catalog() -> MarkerCatalogDto {
    let catalog = onion::marker_catalog();
    let all = catalog.all();
    let all_markers = all
        .iter()
        .map(|info| info.marker.clone())
        .collect::<Vec<_>>();
    let info_by_marker = all
        .iter()
        .map(|info| (info.marker.clone(), map_marker_info(info)))
        .collect::<BTreeMap<_, _>>();

    MarkerCatalogDto {
        all_markers: all_markers.clone(),
        paragraph_markers: all
            .iter()
            .filter(|info| info.category == onion::MarkerCategory::Paragraph)
            .map(|info| info.marker.clone())
            .collect(),
        note_markers: all
            .iter()
            .filter(|info| info.category == onion::MarkerCategory::NoteContainer)
            .map(|info| info.marker.clone())
            .collect(),
        note_submarkers: all
            .iter()
            .filter(|info| info.category == onion::MarkerCategory::NoteSubmarker)
            .map(|info| info.marker.clone())
            .collect(),
        regular_character_markers: all
            .iter()
            .filter(|info| info.category == onion::MarkerCategory::Character)
            .map(|info| info.marker.clone())
            .collect(),
        document_markers: all
            .iter()
            .filter(|info| info.category == onion::MarkerCategory::Document)
            .map(|info| info.marker.clone())
            .collect(),
        chapter_verse_markers: all
            .iter()
            .filter(|info| {
                info.category == onion::MarkerCategory::Chapter
                    || info.category == onion::MarkerCategory::Verse
            })
            .map(|info| info.marker.clone())
            .collect(),
        info_by_marker,
    }
}

#[tauri::command]
pub fn usfm_onion_project_usfm(
    source: String,
    options: Option<ProjectUsfmOptionsDto>,
) -> Result<ProjectedUsfmDocumentDto, String> {
    let usfm = onion::Usfm::from_str(&source);
    Ok(map_projected_document(&usfm, options.unwrap_or_default()))
}

#[tauri::command]
pub fn usfm_onion_project_paths(
    paths: Vec<String>,
    options: Option<ProjectUsfmOptionsDto>,
    batch_options: Option<BatchExecutionOptionsDto>,
) -> Result<Vec<ProjectedUsfmDocumentDto>, String> {
    let sources = read_sources_from_paths(paths, batch_options.clone())?;
    let exec = should_parallelize(batch_options);
    let project_options = options.unwrap_or_default();
    let iter = sources
        .into_iter()
        .map(|source| onion::Usfm::from_str(&source));
    let docs = if exec {
        let docs = iter.collect::<Vec<_>>();
        docs.into_par_iter()
            .map(|doc| map_projected_document(&doc, project_options.clone()))
            .collect()
    } else {
        iter.map(|doc| map_projected_document(&doc, project_options.clone()))
            .collect()
    };
    Ok(docs)
}

#[tauri::command]
pub fn usfm_onion_lint_paths(
    paths: Vec<String>,
    options: Option<LintOptionsDto>,
    batch_options: Option<BatchExecutionOptionsDto>,
) -> Result<Vec<Vec<LintIssueDto>>, String> {
    let batch = onion::UsfmBatch::from_paths(paths).map_err(|error| error.to_string())?;
    let results = batch
        .lint(map_lint_options(options))
        .with_execution(map_execution(batch_options))
        .run();
    Ok(results
        .into_iter()
        .map(|item| item.value.issues.iter().map(map_lint_issue).collect())
        .collect())
}

#[tauri::command]
pub fn usfm_onion_lint_tokens(
    tokens: Vec<FlatTokenDto>,
    options: Option<LintOptionsDto>,
) -> Result<Vec<LintIssueDto>, String> {
    let stream =
        onion::TokenStream::from_tokens(tokens.into_iter().map(map_flat_token_dto).collect());
    let result = stream.lint(map_lint_options(options));
    Ok(result.issues.iter().map(map_lint_issue).collect())
}

#[tauri::command]
pub fn usfm_onion_lint_token_batches(
    token_batches: Vec<Vec<FlatTokenDto>>,
    options: Option<LintOptionsDto>,
    batch_options: Option<BatchExecutionOptionsDto>,
) -> Result<Vec<Vec<LintIssueDto>>, String> {
    let batch = onion::TokenBatch::from_token_streams(
        token_batches
            .into_iter()
            .map(|tokens| {
                onion::TokenStream::from_tokens(
                    tokens.into_iter().map(map_flat_token_dto).collect(),
                )
            })
            .collect(),
    );
    let results = batch
        .lint(map_lint_options(options))
        .with_execution(map_execution(batch_options))
        .run();
    Ok(results
        .into_iter()
        .map(|item| item.value.issues.iter().map(map_lint_issue).collect())
        .collect())
}

#[tauri::command]
pub fn usfm_onion_format_token_batches(
    token_batches: Vec<Vec<FlatTokenDto>>,
    options: Option<FormatOptionsDto>,
    batch_options: Option<BatchExecutionOptionsDto>,
) -> Result<Vec<TokenTransformResultDto>, String> {
    let batch = onion::TokenBatch::from_token_streams(
        token_batches
            .into_iter()
            .map(|tokens| {
                onion::TokenStream::from_tokens(
                    tokens.into_iter().map(map_flat_token_dto).collect(),
                )
            })
            .collect(),
    );
    let results = batch
        .format(map_format_options(options))
        .with_execution(map_execution(batch_options))
        .run();
    Ok(results
        .into_iter()
        .map(|item| TokenTransformResultDto {
            tokens: map_format_tokens(&item.value),
            applied_changes: Vec::new(),
            skipped_changes: Vec::new(),
        })
        .collect())
}

#[tauri::command]
pub fn usfm_onion_format_paths(
    paths: Vec<String>,
    _token_options: Option<IntoTokensOptionsDto>,
    format_options: Option<FormatOptionsDto>,
    batch_options: Option<BatchExecutionOptionsDto>,
) -> Result<Vec<TokenTransformResultDto>, String> {
    let batch = onion::UsfmBatch::from_paths(paths).map_err(|error| error.to_string())?;
    let results = batch
        .format(map_format_options(format_options))
        .with_execution(map_execution(batch_options))
        .run();
    Ok(results
        .into_iter()
        .map(|item| {
            let parsed = onion::Usfm::from_str(&item.value);
            TokenTransformResultDto {
                tokens: map_tokens(&parsed.tokens()),
                applied_changes: Vec::new(),
                skipped_changes: Vec::new(),
            }
        })
        .collect())
}

#[tauri::command]
pub fn usfm_onion_diff_path_pairs(
    path_pairs: Vec<DiffPathPairDto>,
    _token_options: Option<IntoTokensOptionsDto>,
    build_options: Option<BuildSidBlocksOptionsDto>,
    batch_options: Option<BatchExecutionOptionsDto>,
) -> Result<Vec<Vec<DiffDto>>, String> {
    let left = onion::UsfmBatch::from_paths(path_pairs.iter().map(|pair| &pair.baseline_path))
        .map_err(|error| error.to_string())?;
    let right = onion::UsfmBatch::from_paths(path_pairs.iter().map(|pair| &pair.current_path))
        .map_err(|error| error.to_string())?;
    let results = left
        .diff(&right)
        .with_options(onion::BuildSidBlocksOptions {
            allow_empty_sid: build_options.map(|o| o.allow_empty_sid).unwrap_or(true),
        })
        .with_execution(map_execution(batch_options))
        .run();
    Ok(results
        .into_iter()
        .map(|item| item.value.iter().map(map_diff).collect())
        .collect())
}

#[tauri::command]
pub fn usfm_onion_diff_tokens(
    baseline_tokens: Vec<FlatTokenDto>,
    current_tokens: Vec<FlatTokenDto>,
    build_options: Option<BuildSidBlocksOptionsDto>,
) -> Result<Vec<DiffDto>, String> {
    let left = onion::TokenStream::from_tokens(
        baseline_tokens
            .into_iter()
            .map(map_flat_token_dto)
            .collect(),
    );
    let right = onion::TokenStream::from_tokens(
        current_tokens.into_iter().map(map_flat_token_dto).collect(),
    );
    Ok(left
        .diff(&right)
        .with_options(onion::BuildSidBlocksOptions {
            allow_empty_sid: build_options.map(|o| o.allow_empty_sid).unwrap_or(true),
        })
        .run()
        .iter()
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
    let baseline = baseline_tokens
        .into_iter()
        .map(map_flat_token_dto)
        .collect::<Vec<_>>();
    let current = current_tokens
        .into_iter()
        .map(map_flat_token_dto)
        .collect::<Vec<_>>();
    let next = onion::apply_revert_by_block_id(
        &block_id,
        &baseline,
        &current,
        &onion::BuildSidBlocksOptions {
            allow_empty_sid: build_options.map(|o| o.allow_empty_sid).unwrap_or(true),
        },
    );
    Ok(map_format_tokens(&next))
}

#[tauri::command]
pub fn usfm_onion_apply_token_fix(
    tokens: Vec<FlatTokenDto>,
    fix: TokenFixDto,
) -> Result<Vec<FlatTokenDto>, String> {
    let tokens = tokens
        .into_iter()
        .map(map_flat_token_dto)
        .collect::<Vec<_>>();
    let fix = parse_token_fix_dto(fix).ok_or_else(|| "invalid token fix".to_string())?;
    let next = onion::apply_token_fix(&tokens, &fix);
    Ok(map_format_tokens(&next))
}
