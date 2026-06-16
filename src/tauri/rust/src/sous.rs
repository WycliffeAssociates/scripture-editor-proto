// sous.rs
//
// scripture-sous-chef content analysis over onion's vref_index.
//
// Takes the editor's flat tokens, builds the per-verse vref projection (onion's
// `vref` module), runs sous over each verse's projected text, and returns the
// segment map + UTF-16 findings the editor zips into the annotation popover.
// Sibling of the lint command, NOT a tee on it. The web/wasm twin is
// `WebSousService`, which composes the same two libraries in the browser.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use usfm_onion::lint::LintableToken;
use usfm_onion::walker::WalkableToken;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SousFlatTokenDto {
    pub id: String,
    pub kind: String,
    pub source: String,
    #[serde(default)]
    pub sid: Option<String>,
    #[serde(default)]
    pub marker: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Utf16SpanDto {
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SegmentDto {
    pub token_id: String,
    pub text_span: Utf16SpanDto,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SousFindingDto {
    pub sid: String,
    pub code: String,
    pub severity: String,
    /// UTF-16 offsets into the verse projection (byte→UTF-16 at this boundary).
    pub start: usize,
    pub end: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<f32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SousResultDto {
    pub segments: BTreeMap<String, Vec<SegmentDto>>,
    pub findings: Vec<SousFindingDto>,
}

/// A minimal `LintableToken` built from the editor's flat tokens — enough for
/// the vref walk (kind/marker/text/id/sid, plus `next_is_number` so `\c`/`\v`
/// open their scopes). `span()` is `None`: the editor resolves ranges via
/// `text_span` + `token_id` (the DOM `data-id`), never the source byte span.
struct EditorVrefToken {
    kind: usfm_onion::TokenKind,
    marker: Option<String>,
    text: String,
    id: Option<String>,
    sid: Option<String>,
    next_is_number: bool,
}

impl WalkableToken for EditorVrefToken {
    fn kind(&self) -> usfm_onion::TokenKind {
        self.kind
    }
    fn marker(&self) -> Option<&str> {
        self.marker.as_deref()
    }
    fn structural(&self) -> Option<usfm_onion::marker_defs::StructuralMarkerInfo> {
        None
    }
    fn text(&self) -> &str {
        &self.text
    }
    fn next_is_number(&self) -> bool {
        self.next_is_number
    }
}

impl LintableToken for EditorVrefToken {
    fn span(&self) -> Option<usfm_onion::token::Span> {
        None
    }
    fn sid(&self) -> Option<String> {
        self.sid.clone()
    }
    fn id(&self) -> Option<String> {
        self.id.clone()
    }
}

fn kind_from_str(kind: &str) -> usfm_onion::TokenKind {
    use usfm_onion::TokenKind::*;
    match kind {
        "newline" => Newline,
        "optBreak" => OptBreak,
        "marker" => Marker,
        "endMarker" => EndMarker,
        "milestone" => Milestone,
        "milestoneEnd" => MilestoneEnd,
        "bookCode" => BookCode,
        "number" => Number,
        _ => Text,
    }
}

fn build_editor_tokens(dtos: Vec<SousFlatTokenDto>) -> Vec<EditorVrefToken> {
    let kinds: Vec<usfm_onion::TokenKind> =
        dtos.iter().map(|d| kind_from_str(&d.kind)).collect();
    dtos.into_iter()
        .enumerate()
        .map(|(i, d)| EditorVrefToken {
            kind: kinds[i],
            marker: d.marker,
            text: d.source,
            id: Some(d.id),
            sid: d.sid,
            next_is_number: matches!(
                kinds.get(i + 1),
                Some(usfm_onion::TokenKind::Number)
            ),
        })
        .collect()
}

fn severity_str(severity: ssc_core::Severity) -> String {
    match severity {
        ssc_core::Severity::Error => "error",
        ssc_core::Severity::Warning => "warning",
        ssc_core::Severity::Info => "info",
    }
    .to_string()
}

#[tauri::command]
pub fn sous_analyze(tokens: Vec<SousFlatTokenDto>) -> SousResultDto {
    analyze_tokens(tokens)
}

/// The sous analysis over flat editor tokens: build the vref projection, run
/// sous per verse, return the segment map + UTF-16 findings. Shared by the
/// stateless `sous_analyze` command and the resident-mirror analyze command.
pub fn analyze_tokens(tokens: Vec<SousFlatTokenDto>) -> SousResultDto {
    let editor_tokens = build_editor_tokens(tokens);
    let index = usfm_onion::vref::tokens_to_vref_index(&editor_tokens);

    let mut segments: BTreeMap<String, Vec<SegmentDto>> = BTreeMap::new();
    let mut verse_map: ssc_core::VerseMap = BTreeMap::new();
    for (sid, projection) in &index {
        segments.insert(
            sid.clone(),
            projection
                .segments
                .iter()
                .map(|s| SegmentDto {
                    token_id: s.token_id.clone(),
                    text_span: Utf16SpanDto {
                        // onion's vref Utf16Span is u32; the DTO/JS uses usize.
                        start: s.text_span.start as usize,
                        end: s.text_span.end as usize,
                    },
                })
                .collect(),
        );
        // onion vref keys are String sids ("GEN 1:1"); sous wants its packed
        // Sid. Skip any that don't parse rather than failing the whole pass.
        if let Some(parsed) = ssc_core::Sid::parse(sid) {
            verse_map.insert(parsed, projection.text.clone());
        }
    }

    let findings = ssc_core::analyze(&verse_map, None)
        .into_iter()
        .filter_map(|finding| {
            let text = verse_map.get(&finding.sid)?;
            let utf16 = finding.range.to_utf16(text);
            Some(SousFindingDto {
                sid: finding.sid.to_string(),
                code: finding.code.0.to_string(),
                severity: severity_str(finding.severity),
                start: utf16.start,
                end: utf16.end,
                score: finding.score,
            })
        })
        .collect();

    SousResultDto { segments, findings }
}
