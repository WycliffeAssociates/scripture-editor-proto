use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use usfm_onion as onion;
use usfm_onion::token::Span;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntoTokensOptionsDto {
    #[serde(default)]
    pub merge_horizontal_whitespace: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
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
    // The app's `Token` (usfmOnionTypes.ts) omits `span` — it's onion book-relative
    // and nothing on the read surface needs it — so frontend-serialized tokens never
    // carry it. Default it here rather than requiring it: onion's diff/merge ignore
    // incoming span (its `FormatToken.span` is `Option`), matching the wasm path.
    #[serde(default)]
    pub span: SpanDto,
    pub sid: Option<String>,
    pub marker: Option<String>,
    #[serde(rename = "source")]
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
    #[serde(default)]
    pub include_source_md5: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LintIssueDto {
    pub code: String,
    pub category: String,
    pub severity: String,
    pub issue_type: String,
    pub template: String,
    pub message: String,
    #[serde(default)]
    pub message_params: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub marker: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub span: Option<SpanDto>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub related_span: Option<SpanDto>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub related_token_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sid: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
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
    // md5 of the parsed source bytes; only populated when
    // `include_source_md5` is set. `skip_serializing_if` keeps it off the wire
    // (and absent on the JS side) for the common case.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_md5: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SlotRoleDto {
    Shared,
    BaselineOnly,
    CurrentOnly,
    PairBaseline,
    PairCurrent,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DecisionUnitKindDto {
    Shared,
    Added,
    Deleted,
    Coalesced,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DecisionStatusDto {
    Unchanged,
    Modified,
    Added,
    Deleted,
    Moved,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CoveredSideDto {
    Baseline,
    Current,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MergeSideDto {
    Baseline,
    Current,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnchorDto {
    pub unit_id: String,
    pub sid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotDto {
    pub unit_id: String,
    pub role: SlotRoleDto,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub after: Option<AnchorDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DupContextDto {
    pub baseline_count: u32,
    pub current_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoveredByDto {
    pub unit_id: String,
    pub sid: String,
    pub side: CoveredSideDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionUnitDto {
    pub id: String,
    pub kind: DecisionUnitKindDto,
    pub status: DecisionStatusDto,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub baseline_sid: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_sid: Option<String>,
    pub baseline_tokens: Vec<FlatTokenDto>,
    pub current_tokens: Vec<FlatTokenDto>,
    pub displaced: bool,
    pub relabeled: bool,
    pub dup_context: DupContextDto,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub covered_by: Option<CoveredByDto>,
    pub is_whitespace_change: bool,
    pub is_usfm_structure_change: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffSkeletonDto {
    pub slots: Vec<SlotDto>,
    pub units: Vec<DecisionUnitDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeRequestDto {
    pub decisions: BTreeMap<String, MergeSideDto>,
    pub default_side: MergeSideDto,
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

fn read_sources_from_paths(paths: Vec<String>) -> Result<Vec<String>, String> {
    paths
        .into_par_iter()
        .map(|path| read_usfm_source_from_path(&path))
        .collect()
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
            .map(|sid| format!("{} {}:{}", sid.book, sid.chapter, sid.verse)),
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
        attribute_source: None,
        attributes: Vec::new(),
    }
}

fn map_lint_code(code: &str) -> Option<onion::LintCode> {
    serde_json::from_str::<onion::LintCode>(&format!("\"{code}\"")).ok()
}

pub fn map_lint_options(options: Option<LintOptionsDto>) -> onion::LintOptions {
    // The editor doesn't thread chapter-grain scope; lint the whole book to
    // preserve today's behavior, matching WebUsfmOnionService's WHOLE_BOOK_SCOPE.
    // TODO(lint-scope): thread chapter-grain scope (book-granular today).
    let Some(options) = options else {
        return onion::LintOptions::scoped(onion::LintScope::Book);
    };
    onion::LintOptions {
        scope: onion::LintScope::Book,
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
        declared_book: None,
    }
}

fn map_lint_category(category: onion::LintCategory) -> String {
    match category {
        onion::LintCategory::Document => "document",
        onion::LintCategory::Structure => "structure",
        onion::LintCategory::Context => "context",
        onion::LintCategory::Numbering => "numbering",
    }
    .to_string()
}

fn map_lint_issue(issue: &onion::LintIssue) -> LintIssueDto {
    LintIssueDto {
        code: issue.code.code().to_string(),
        category: map_lint_category(issue.category),
        severity: match issue.severity {
            onion::LintSeverity::Error => "error".to_string(),
            onion::LintSeverity::Warning => "warning".to_string(),
        },
        issue_type: match issue.issue_type {
            onion::LintIssueType::Usfm => "usfm".to_string(),
            onion::LintIssueType::Content => "content".to_string(),
        },
        template: issue.template.to_string(),
        marker: issue.marker.clone(),
        message: issue.message.clone(),
        message_params: issue.message_params.clone(),
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
        // TODO: move the \s5 unknown-marker suppression to a data-driven
        // LintSuppression rather than hard-coding it at every wire boundary.
        lint_issues: lint_issues.map(|issues| {
            issues
                .into_iter()
                .filter(|issue| {
                    issue.code != "unknown-marker" || issue.marker.as_deref() != Some("s5")
                })
                .collect()
        }),
        // Filled in by the commands that hold the raw source (they know the
        // bytes); the parsed `usfm` here intentionally doesn't carry them.
        source_md5: None,
    }
}

fn map_slot_role(role: onion::SlotRole) -> SlotRoleDto {
    match role {
        onion::SlotRole::Shared => SlotRoleDto::Shared,
        onion::SlotRole::BaselineOnly => SlotRoleDto::BaselineOnly,
        onion::SlotRole::CurrentOnly => SlotRoleDto::CurrentOnly,
        onion::SlotRole::PairBaseline => SlotRoleDto::PairBaseline,
        onion::SlotRole::PairCurrent => SlotRoleDto::PairCurrent,
    }
}

fn map_decision_unit_kind(kind: onion::DecisionUnitKind) -> DecisionUnitKindDto {
    match kind {
        onion::DecisionUnitKind::Shared => DecisionUnitKindDto::Shared,
        onion::DecisionUnitKind::Added => DecisionUnitKindDto::Added,
        onion::DecisionUnitKind::Deleted => DecisionUnitKindDto::Deleted,
        onion::DecisionUnitKind::Coalesced => DecisionUnitKindDto::Coalesced,
    }
}

fn map_decision_status(status: onion::DecisionStatus) -> DecisionStatusDto {
    match status {
        onion::DecisionStatus::Unchanged => DecisionStatusDto::Unchanged,
        onion::DecisionStatus::Modified => DecisionStatusDto::Modified,
        onion::DecisionStatus::Added => DecisionStatusDto::Added,
        onion::DecisionStatus::Deleted => DecisionStatusDto::Deleted,
        onion::DecisionStatus::Moved => DecisionStatusDto::Moved,
    }
}

fn map_covered_side(side: onion::CoveredSide) -> CoveredSideDto {
    match side {
        onion::CoveredSide::Baseline => CoveredSideDto::Baseline,
        onion::CoveredSide::Current => CoveredSideDto::Current,
    }
}

fn parse_merge_side(side: MergeSideDto) -> onion::MergeSide {
    match side {
        MergeSideDto::Baseline => onion::MergeSide::Baseline,
        MergeSideDto::Current => onion::MergeSide::Current,
    }
}

fn map_anchor(anchor: &onion::Anchor) -> AnchorDto {
    AnchorDto {
        unit_id: anchor.unit_id.to_string(),
        sid: anchor.sid.clone(),
    }
}

fn map_slot(slot: &onion::Slot) -> SlotDto {
    SlotDto {
        unit_id: slot.unit_id.to_string(),
        role: map_slot_role(slot.role),
        after: slot.after.as_ref().map(map_anchor),
    }
}

fn map_decision_unit(unit: &onion::DecisionUnit<onion::FormatToken>) -> DecisionUnitDto {
    DecisionUnitDto {
        id: unit.id.to_string(),
        kind: map_decision_unit_kind(unit.kind),
        status: map_decision_status(unit.status),
        baseline_sid: unit.baseline_sid.clone(),
        current_sid: unit.current_sid.clone(),
        baseline_tokens: map_format_tokens(&unit.baseline_tokens),
        current_tokens: map_format_tokens(&unit.current_tokens),
        displaced: unit.displaced,
        relabeled: unit.relabeled,
        dup_context: DupContextDto {
            baseline_count: unit.dup_context.baseline_count,
            current_count: unit.dup_context.current_count,
        },
        covered_by: unit.covered_by.as_ref().map(|covered_by| CoveredByDto {
            unit_id: covered_by.unit_id.to_string(),
            sid: covered_by.sid.clone(),
            side: map_covered_side(covered_by.side),
        }),
        is_whitespace_change: unit.is_whitespace_change,
        is_usfm_structure_change: unit.is_usfm_structure_change,
    }
}

fn map_diff_skeleton(skeleton: &onion::DiffSkeleton<onion::FormatToken>) -> DiffSkeletonDto {
    DiffSkeletonDto {
        slots: skeleton.slots.iter().map(map_slot).collect(),
        units: skeleton.units.iter().map(map_decision_unit).collect(),
    }
}

#[tauri::command]
pub fn usfm_onion_project_usfm(
    source: String,
    options: Option<ProjectUsfmOptionsDto>,
) -> Result<ProjectedUsfmDocumentDto, String> {
    let project_options = options.unwrap_or_default();
    let include_source_md5 = project_options.include_source_md5;
    let usfm = onion::Usfm::from_str(&source);
    let mut doc = map_projected_document(&usfm, project_options);
    if include_source_md5 {
        doc.source_md5 = Some(crate::md5::md5_hex(&source));
    }
    Ok(doc)
}

#[tauri::command]
pub fn usfm_onion_project_paths(
    paths: Vec<String>,
    options: Option<ProjectUsfmOptionsDto>,
) -> Result<Vec<ProjectedUsfmDocumentDto>, String> {
    let sources = read_sources_from_paths(paths)?;
    let project_options = options.unwrap_or_default();
    let include_source_md5 = project_options.include_source_md5;
    Ok(sources
        .into_par_iter()
        .map(|source| {
            let usfm = onion::Usfm::from_str(&source);
            let mut doc = map_projected_document(&usfm, project_options.clone());
            // Hash the bytes we already read here, on the desktop side — the
            // source never has to cross the IPC boundary just to be checksummed.
            if include_source_md5 {
                doc.source_md5 = Some(crate::md5::md5_hex(&source));
            }
            doc
        })
        .collect())
}

#[tauri::command]
pub fn usfm_onion_lint_paths(
    paths: Vec<String>,
    options: Option<LintOptionsDto>,
) -> Result<Vec<Vec<LintIssueDto>>, String> {
    let sources = read_sources_from_paths(paths)?;
    let lint_options = map_lint_options(options);
    Ok(sources
        .into_par_iter()
        .map(|source| {
            let usfm = onion::Usfm::from_str(&source);
            usfm.lint(lint_options.clone())
                .issues
                .iter()
                .map(map_lint_issue)
                .collect()
        })
        .collect())
}

/// Lint a single batch of flat tokens against already-resolved options. Shared
/// by the token-batch command and the resident-mirror lint command so both run
/// the exact same `TokenStream::from_tokens` → lint projection.
pub fn lint_flat_tokens(
    tokens: Vec<FlatTokenDto>,
    options: onion::LintOptions,
) -> Vec<LintIssueDto> {
    let stream =
        onion::TokenStream::from_tokens(tokens.into_iter().map(map_flat_token_dto).collect());
    stream
        .lint(options)
        .issues
        .iter()
        .map(map_lint_issue)
        .collect()
}

#[tauri::command]
pub fn usfm_onion_lint_tokens(
    tokens: Vec<FlatTokenDto>,
    options: Option<LintOptionsDto>,
) -> Result<Vec<LintIssueDto>, String> {
    Ok(lint_flat_tokens(tokens, map_lint_options(options)))
}

#[tauri::command]
pub fn usfm_onion_lint_token_batches(
    token_batches: Vec<Vec<FlatTokenDto>>,
    options: Option<LintOptionsDto>,
) -> Result<Vec<Vec<LintIssueDto>>, String> {
    let lint_options = map_lint_options(options);
    Ok(token_batches
        .into_par_iter()
        .map(|tokens| {
            let stream = onion::TokenStream::from_tokens(
                tokens.into_iter().map(map_flat_token_dto).collect(),
            );
            stream
                .lint(lint_options.clone())
                .issues
                .iter()
                .map(map_lint_issue)
                .collect()
        })
        .collect())
}

#[tauri::command]
pub fn usfm_onion_format_token_batches(
    token_batches: Vec<Vec<FlatTokenDto>>,
) -> Result<Vec<TokenTransformResultDto>, String> {
    let format_options = onion::FormatOptions::for_profile(onion::FormatProfile::Reading);
    Ok(token_batches
        .into_par_iter()
        .map(|tokens| {
            let stream = onion::TokenStream::from_tokens(
                tokens.into_iter().map(map_flat_token_dto).collect(),
            );
            let formatted = stream.format(format_options);
            TokenTransformResultDto {
                tokens: map_format_tokens(&formatted),
                applied_changes: Vec::new(),
                skipped_changes: Vec::new(),
            }
        })
        .collect())
}

#[tauri::command]
pub fn usfm_onion_format_paths(
    paths: Vec<String>,
    _token_options: Option<IntoTokensOptionsDto>,
) -> Result<Vec<TokenTransformResultDto>, String> {
    let sources = read_sources_from_paths(paths)?;
    let format_options = onion::FormatOptions::for_profile(onion::FormatProfile::Reading);
    Ok(sources
        .into_par_iter()
        .map(|source| {
            let parsed = onion::Usfm::from_str(&source).parse_owned();
            let formatted = parsed.format(format_options);
            TokenTransformResultDto {
                tokens: map_format_tokens(&formatted),
                applied_changes: Vec::new(),
                skipped_changes: Vec::new(),
            }
        })
        .collect())
}

#[tauri::command]
pub fn usfm_onion_diff_tokens(
    baseline_tokens: Vec<FlatTokenDto>,
    current_tokens: Vec<FlatTokenDto>,
) -> Result<DiffSkeletonDto, String> {
    let left = onion::TokenStream::from_tokens(
        baseline_tokens
            .into_iter()
            .map(map_flat_token_dto)
            .collect(),
    );
    let right = onion::TokenStream::from_tokens(
        current_tokens.into_iter().map(map_flat_token_dto).collect(),
    );
    Ok(map_diff_skeleton(&left.diff(&right).run()))
}

#[tauri::command]
pub fn usfm_onion_merge_diff_blocks(
    baseline_tokens: Vec<FlatTokenDto>,
    current_tokens: Vec<FlatTokenDto>,
    request: MergeRequestDto,
) -> Result<Vec<FlatTokenDto>, String> {
    let baseline = baseline_tokens
        .into_iter()
        .map(map_flat_token_dto)
        .collect::<Vec<_>>();
    let current = current_tokens
        .into_iter()
        .map(map_flat_token_dto)
        .collect::<Vec<_>>();
    let decisions = request
        .decisions
        .into_iter()
        .map(|(id, side)| (onion::UnitId::new(id), parse_merge_side(side)))
        .collect();
    let merged = onion::merge_diff_blocks(
        &baseline,
        &current,
        &decisions,
        parse_merge_side(request.default_side),
    )
    .map_err(|error| error.to_string())?;
    Ok(map_format_tokens(&merged))
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

#[cfg(test)]
mod tests {
    use super::*;

    fn text_token(id: &str, sid: &str, text: &str) -> FlatTokenDto {
        FlatTokenDto {
            id: id.to_string(),
            kind: "text".to_string(),
            span: SpanDto {
                start: 0,
                end: text.len(),
            },
            sid: Some(sid.to_string()),
            marker: None,
            text: text.to_string(),
        }
    }

    // Regression guard for a desktop-only break: the app's `Token`
    // (usfmOnionTypes.ts) omits `span`, so the frontend serializes diff/merge
    // command args WITHOUT it. `FlatTokenDto` must tolerate that shape —
    // requiring `span` collapsed the native diff with "missing field `span`"
    // in the prod build while the wasm/web path (span optional) stayed green.
    #[test]
    fn diff_tokens_accepts_frontend_tokens_without_span() {
        let json = r#"[{"id":"GEN 1:1-a","kind":"text","sid":"GEN 1:1","source":"hello"}]"#;
        let tokens: Vec<FlatTokenDto> =
            serde_json::from_str(json).expect("spanless frontend tokens deserialize");
        assert_eq!(tokens.len(), 1);
        usfm_onion_diff_tokens(tokens.clone(), tokens).expect("diff runs on spanless tokens");
    }

    #[test]
    fn diff_command_emits_skeleton_wire_shape_and_moved_status() {
        let baseline = vec![
            text_token("b1", "GEN 1:1", "one"),
            text_token("b2", "GEN 1:2", "two"),
        ];
        let current = vec![
            text_token("c2", "GEN 1:2", "two"),
            text_token("c1", "GEN 1:1", "one"),
        ];

        let skeleton = usfm_onion_diff_tokens(baseline, current).expect("diff succeeds");
        let json = serde_json::to_value(skeleton).expect("skeleton serializes");

        assert_eq!(json["slots"].as_array().map(Vec::len), Some(3));
        let moved = json["units"]
            .as_array()
            .expect("units array")
            .iter()
            .find(|unit| unit["status"] == "moved")
            .expect("move unit");
        assert_eq!(moved["kind"], "coalesced");
        assert_eq!(moved["displaced"], true);
        let moved_id = moved["id"].as_str().expect("unit id");
        assert_eq!(
            json["slots"]
                .as_array()
                .expect("slots array")
                .iter()
                .filter(|slot| slot["unitId"] == moved_id)
                .count(),
            2
        );
    }

    #[test]
    fn merge_command_projects_known_decisions_and_rejects_unknown_ids() {
        let baseline = vec![text_token("b1", "GEN 1:1", "before")];
        let current = vec![text_token("c1", "GEN 1:1", "after")];
        let skeleton =
            usfm_onion_diff_tokens(baseline.clone(), current.clone()).expect("diff succeeds");
        let unit_id = skeleton.units[0].id.clone();

        let merged = usfm_onion_merge_diff_blocks(
            baseline.clone(),
            current.clone(),
            MergeRequestDto {
                decisions: BTreeMap::from([(unit_id.clone(), MergeSideDto::Baseline)]),
                default_side: MergeSideDto::Current,
            },
        )
        .expect("known decision merges");
        assert_eq!(
            merged
                .iter()
                .map(|token| token.text.as_str())
                .collect::<String>(),
            "before"
        );

        let unknown_merge = usfm_onion_merge_diff_blocks(
            baseline.clone(),
            current.clone(),
            MergeRequestDto {
                decisions: BTreeMap::from([("unknown-unit".to_string(), MergeSideDto::Baseline)]),
                default_side: MergeSideDto::Current,
            },
        );
        assert_eq!(
            unknown_merge.expect_err("unknown decision must fail"),
            "unknown decision unit id: unknown-unit"
        );
    }
}
