// mirror.rs
//
// The desktop resident token mirror: a passive replica of the editor's
// per-chapter token state, held in Tauri managed `State<T>`, mirroring the TS
// `WorkspaceMirror` (src/app/domain/mirror/WorkspaceMirror.ts). The main thread
// is the sole writer: it tokenizes the chapters a commit changed exactly once
// and pushes the delta via `mirror_push_patch`; lint/sous read the mirror's OWN
// resident tokens via `mirror_lint`/`mirror_sous_analyze`, so a desktop analyze
// pass ships only a scope + generation, never re-serialized book tokens.
//
// Ordering: desktop has none (concurrent invokes are unordered), so every patch
// and command carries a `generation`. Patches apply idempotently under a
// per-entry generation guard (an older patch for an entry is a no-op); the
// mirror tracks a high-water mark, and a command whose requested generation is
// AHEAD of the mirror returns a typed "behind" result the TS side treats as a
// stale-drop (and a resync trigger). Findings return tagged with the generation
// they ran against.
//
// Token DTO fidelity: `MirrorTokenDto` round-trips the TS `Token` shape exactly
// (id, kind, span, sid, marker, nested, source, attributes) — serde field names
// and string values mirror src/core/domain/usfm/usfmOnionTypes.ts so the wire
// contract can't drift (the marker-DTO-drift failure mode). Lint/sous consume
// only the subset their engines need, exactly as the existing token-carrying
// commands do (`nested`/`attributes` are not engine inputs today); they are held
// for fidelity and future use.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::Mutex;

use crate::sous::{self, SousFlatTokenDto, SousResultDto};
use crate::usfm_onion::{
    map_lint_options, FlatTokenDto, LintIssueDto, LintOptionsDto, SpanDto,
};

// --- Token DTO (mirrors the TS `Token`) ------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttributeItemDto {
    pub span: SpanDto,
    pub text: String,
    pub key: String,
    pub value: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_default: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorTokenDto {
    pub id: String,
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub span: Option<SpanDto>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sid: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub marker: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub nested: Option<bool>,
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attributes: Option<Vec<AttributeItemDto>>,
}

impl MirrorTokenDto {
    /// The lint engine input is the existing `FlatTokenDto` (→ `FormatToken`),
    /// the same lossy projection the desktop `usfm_onion_lint_token_batches`
    /// path uses today. `nested`/`attributes` are not engine inputs.
    fn to_flat_token(&self) -> FlatTokenDto {
        FlatTokenDto {
            id: self.id.clone(),
            kind: self.kind.clone(),
            span: self.span.clone().unwrap_or(SpanDto {
                start: 0,
                end: self.source.len(),
            }),
            sid: self.sid.clone(),
            marker: self.marker.clone(),
            text: self.source.clone(),
        }
    }

    fn to_sous_token(&self) -> SousFlatTokenDto {
        SousFlatTokenDto {
            id: self.id.clone(),
            kind: self.kind.clone(),
            source: self.source.clone(),
            sid: self.sid.clone(),
            marker: self.marker.clone(),
        }
    }
}

// --- Disk baseline (mirrors the TS `DiskBaseline` tagged union) ------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DiskBaselineDto {
    Absent,
    Present { md5: String },
}

impl Default for DiskBaselineDto {
    fn default() -> Self {
        DiskBaselineDto::Absent
    }
}

// --- Patches (main → mirror) -----------------------------------------------

#[derive(Debug, Clone, Deserialize)]
// `deny_unknown_fields`: this envelope is an EXACT 1:1 mirror of the TS
// `MirrorChapter` (unlike `MirrorTokenDto`, which is a deliberate subset of the
// rich `Token`). Rejecting unknown fields turns a TS-side field add/rename into
// a loud deserialize error here instead of a silent drop.
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MirrorChapterDto {
    pub tokens: Vec<MirrorTokenDto>,
    // Part of the wire DTO (per-chapter line ending). The desktop mirror doesn't
    // serialize backups today — the backup worker does — so `eol` is held for
    // fidelity / a future Rust-side serializer rather than read here.
    #[allow(dead_code)]
    pub eol: String,
    pub dirty: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FullSyncChapterDto {
    pub chapter_num: i64,
    pub chapter: MirrorChapterDto,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FullSyncBookDto {
    pub book_code: String,
    pub disk_baseline: DiskBaselineDto,
    pub chapters: Vec<FullSyncChapterDto>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SyncMetaChapterDto {
    pub chapter_num: i64,
    pub dirty: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SyncMetaBookDto {
    pub book_code: String,
    pub disk_baseline: DiskBaselineDto,
    pub chapter_dirty: Vec<SyncMetaChapterDto>,
}

/// The patch vocabulary, matching the TS `MirrorPatch` union by `kind`. Backup
/// patches (`pushBaseline`) carry no tokens but keep the mirror's baseline
/// generation current; the desktop mirror doesn't serialize backups (the backup
/// worker does), but it tracks baselines so a future Rust-side serializer is a
/// drop-in.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum MirrorPatchDto {
    PushChapter {
        #[serde(rename = "ref")]
        ref_: ChapterRefForPatch,
        chapter: MirrorChapterDto,
        generation: i64,
    },
    DeleteChapter {
        #[serde(rename = "ref")]
        ref_: ChapterRefForPatch,
        generation: i64,
    },
    PushBaseline {
        book_code: String,
        disk_baseline: DiskBaselineDto,
        generation: i64,
    },
    FullSync {
        books: Vec<FullSyncBookDto>,
        generation: i64,
    },
    SyncMeta {
        books: Vec<SyncMetaBookDto>,
        generation: i64,
    },
}

// `ref` is a Rust keyword; serde renames the field so the wire stays `ref`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChapterRefForPatch {
    pub book_code: String,
    pub chapter_num: i64,
}

// --- Resident state --------------------------------------------------------

struct ResidentChapter {
    tokens: Vec<MirrorTokenDto>,
    dirty: bool,
    generation: i64,
}

struct ResidentBook {
    #[allow(dead_code)]
    disk_baseline: DiskBaselineDto,
    baseline_generation: i64,
    // BTreeMap so chapters iterate in ascending chapter-number (disk) order,
    // matching the TS mirror's `chaptersInOrder` (invariant I1).
    chapters: BTreeMap<i64, ResidentChapter>,
}

#[derive(Default)]
pub struct WorkspaceTokenMirror {
    books: BTreeMap<String, ResidentBook>,
    // High-water mark across all applied patches — a command requesting a
    // generation strictly greater than this is "behind" (the mirror hasn't seen
    // the patch yet on this unordered transport).
    high_water: i64,
}

impl WorkspaceTokenMirror {
    fn book_mut(&mut self, book_code: &str) -> &mut ResidentBook {
        self.books
            .entry(book_code.to_string())
            .or_insert_with(|| ResidentBook {
                disk_baseline: DiskBaselineDto::Absent,
                baseline_generation: -1,
                chapters: BTreeMap::new(),
            })
    }

    fn bump_high_water(&mut self, generation: i64) {
        if generation > self.high_water {
            self.high_water = generation;
        }
    }

    fn apply_patch(&mut self, patch: MirrorPatchDto) {
        match patch {
            MirrorPatchDto::FullSync { books, generation } => {
                self.books.clear();
                for book in books {
                    let mut chapters = BTreeMap::new();
                    for entry in book.chapters {
                        chapters.insert(
                            entry.chapter_num,
                            ResidentChapter {
                                tokens: entry.chapter.tokens,
                                dirty: entry.chapter.dirty,
                                generation,
                            },
                        );
                    }
                    self.books.insert(
                        book.book_code,
                        ResidentBook {
                            disk_baseline: book.disk_baseline,
                            baseline_generation: generation,
                            chapters,
                        },
                    );
                }
                self.bump_high_water(generation);
            }
            MirrorPatchDto::SyncMeta { books, generation } => {
                for meta in books {
                    let Some(book) = self.books.get_mut(&meta.book_code) else {
                        continue;
                    };
                    if book.baseline_generation <= generation {
                        book.disk_baseline = meta.disk_baseline;
                        book.baseline_generation = generation;
                    }
                    for entry in meta.chapter_dirty {
                        if let Some(chapter) = book.chapters.get_mut(&entry.chapter_num) {
                            if chapter.generation <= generation {
                                chapter.dirty = entry.dirty;
                                chapter.generation = generation;
                            }
                        }
                    }
                }
                self.bump_high_water(generation);
            }
            MirrorPatchDto::PushChapter {
                ref_,
                chapter,
                generation,
            } => {
                let book = self.book_mut(&ref_.book_code);
                let stale = book
                    .chapters
                    .get(&ref_.chapter_num)
                    .is_some_and(|existing| existing.generation > generation);
                if !stale {
                    book.chapters.insert(
                        ref_.chapter_num,
                        ResidentChapter {
                            tokens: chapter.tokens,
                            dirty: chapter.dirty,
                            generation,
                        },
                    );
                }
                self.bump_high_water(generation);
            }
            MirrorPatchDto::DeleteChapter { ref_, generation } => {
                if let Some(book) = self.books.get_mut(&ref_.book_code) {
                    let stale = book
                        .chapters
                        .get(&ref_.chapter_num)
                        .is_some_and(|existing| existing.generation > generation);
                    if !stale {
                        book.chapters.remove(&ref_.chapter_num);
                        if book.chapters.is_empty() {
                            self.books.remove(&ref_.book_code);
                        }
                    }
                }
                self.bump_high_water(generation);
            }
            MirrorPatchDto::PushBaseline {
                book_code,
                disk_baseline,
                generation,
            } => {
                let book = self.book_mut(&book_code);
                if book.baseline_generation <= generation {
                    book.disk_baseline = disk_baseline;
                    book.baseline_generation = generation;
                }
                self.bump_high_water(generation);
            }
        }
    }

    /// A book's tokens in disk-chapter order (BTreeMap key order = ascending
    /// chapter number — invariant I1).
    fn book_tokens(&self, book_code: &str) -> Vec<&MirrorTokenDto> {
        match self.books.get(book_code) {
            None => Vec::new(),
            Some(book) => book
                .chapters
                .values()
                .flat_map(|chapter| chapter.tokens.iter())
                .collect(),
        }
    }

    fn books_in_scope(&self, scope: &AnalyzeScopeDto) -> Vec<String> {
        match scope {
            AnalyzeScopeDto::All(_) => self.books.keys().cloned().collect(),
            AnalyzeScopeDto::Books { books } => books
                .iter()
                .filter(|code| self.books.contains_key(*code))
                .cloned()
                .collect(),
        }
    }
}

// --- Command scope + results -----------------------------------------------

/// `{ books: [...] }` or the bare string `"all"` — matches the TS
/// `AnalyzeScope`. Untagged: the object form matches `Books`, the string `"all"`
/// matches `All`.
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum AnalyzeScopeDto {
    Books { books: Vec<String> },
    // The bare string `"all"`; the captured value is unused (the variant itself
    // is the signal) but kept so deserialization matches the literal.
    All(#[allow(dead_code)] String),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorLintResultDto {
    /// Per-book lint issues, keyed by book code (the TS `LintResult.byBook`).
    pub by_book: BTreeMap<String, Vec<LintIssueDto>>,
    pub ran_at_generation: i64,
    /// True when the mirror's high-water mark is behind the requested
    /// generation: the TS side drops the (empty) result and may resync.
    pub behind: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorSousResultDto {
    pub by_book: BTreeMap<String, SousResultDto>,
    pub ran_at_generation: i64,
    pub behind: bool,
}

// --- Commands (tauri) ------------------------------------------------------

pub type MirrorState = Mutex<WorkspaceTokenMirror>;

#[tauri::command]
pub fn mirror_push_patch(
    state: tauri::State<'_, MirrorState>,
    patch: MirrorPatchDto,
) -> Result<(), String> {
    let mut mirror = state.lock().map_err(|_| "mirror lock poisoned".to_string())?;
    mirror.apply_patch(patch);
    Ok(())
}

#[tauri::command]
pub fn mirror_lint(
    state: tauri::State<'_, MirrorState>,
    scope: AnalyzeScopeDto,
    generation: i64,
    options: Option<LintOptionsDto>,
) -> Result<MirrorLintResultDto, String> {
    let mirror = state.lock().map_err(|_| "mirror lock poisoned".to_string())?;
    if generation > mirror.high_water {
        return Ok(MirrorLintResultDto {
            by_book: BTreeMap::new(),
            ran_at_generation: generation,
            behind: true,
        });
    }
    let lint_options = map_lint_options(options);
    let mut by_book: BTreeMap<String, Vec<LintIssueDto>> = BTreeMap::new();
    for book_code in mirror.books_in_scope(&scope) {
        let flat: Vec<FlatTokenDto> = mirror
            .book_tokens(&book_code)
            .into_iter()
            .map(MirrorTokenDto::to_flat_token)
            .collect();
        by_book.insert(book_code, crate::usfm_onion::lint_flat_tokens(flat, lint_options.clone()));
    }
    Ok(MirrorLintResultDto {
        by_book,
        ran_at_generation: generation,
        behind: false,
    })
}

#[tauri::command]
pub fn mirror_sous_analyze(
    state: tauri::State<'_, MirrorState>,
    scope: AnalyzeScopeDto,
    generation: i64,
) -> Result<MirrorSousResultDto, String> {
    let mirror = state.lock().map_err(|_| "mirror lock poisoned".to_string())?;
    if generation > mirror.high_water {
        return Ok(MirrorSousResultDto {
            by_book: BTreeMap::new(),
            ran_at_generation: generation,
            behind: true,
        });
    }
    let mut by_book: BTreeMap<String, SousResultDto> = BTreeMap::new();
    for book_code in mirror.books_in_scope(&scope) {
        let tokens: Vec<SousFlatTokenDto> = mirror
            .book_tokens(&book_code)
            .into_iter()
            .map(MirrorTokenDto::to_sous_token)
            .collect();
        by_book.insert(book_code, sous::analyze_tokens(tokens));
    }
    Ok(MirrorSousResultDto {
        by_book,
        ran_at_generation: generation,
        behind: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn push_chapter(
        mirror: &mut WorkspaceTokenMirror,
        book: &str,
        chapter: i64,
        source: &str,
        generation: i64,
    ) {
        mirror.apply_patch(MirrorPatchDto::PushChapter {
            ref_: ChapterRefForPatch {
                book_code: book.to_string(),
                chapter_num: chapter,
            },
            chapter: MirrorChapterDto {
                tokens: vec![MirrorTokenDto {
                    id: format!("{book}-{chapter}"),
                    kind: "text".to_string(),
                    span: None,
                    sid: None,
                    marker: None,
                    nested: None,
                    source: source.to_string(),
                    attributes: None,
                }],
                eol: "\n".to_string(),
                dirty: true,
            },
            generation,
        });
    }

    #[test]
    fn push_chapter_is_idempotent_by_generation() {
        let mut mirror = WorkspaceTokenMirror::default();
        push_chapter(&mut mirror, "GEN", 1, "new", 5);
        // An older-generation patch for the same chapter is a no-op.
        push_chapter(&mut mirror, "GEN", 1, "stale", 2);
        let tokens = mirror.book_tokens("GEN");
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].source, "new");
        assert_eq!(mirror.high_water, 5);
    }

    #[test]
    fn book_tokens_iterate_in_chapter_order() {
        let mut mirror = WorkspaceTokenMirror::default();
        push_chapter(&mut mirror, "GEN", 2, "two", 1);
        push_chapter(&mut mirror, "GEN", 1, "one", 1);
        let tokens = mirror.book_tokens("GEN");
        assert_eq!(tokens[0].source, "one");
        assert_eq!(tokens[1].source, "two");
    }

    #[test]
    fn delete_chapter_removes_empty_book() {
        let mut mirror = WorkspaceTokenMirror::default();
        push_chapter(&mut mirror, "GEN", 1, "one", 1);
        mirror.apply_patch(MirrorPatchDto::DeleteChapter {
            ref_: ChapterRefForPatch {
                book_code: "GEN".to_string(),
                chapter_num: 1,
            },
            generation: 2,
        });
        assert!(mirror.books.is_empty());
    }

    #[test]
    fn full_sync_replaces_all_books() {
        let mut mirror = WorkspaceTokenMirror::default();
        push_chapter(&mut mirror, "GEN", 1, "old", 1);
        mirror.apply_patch(MirrorPatchDto::FullSync {
            books: vec![FullSyncBookDto {
                book_code: "EXO".to_string(),
                disk_baseline: DiskBaselineDto::Absent,
                chapters: vec![FullSyncChapterDto {
                    chapter_num: 1,
                    chapter: MirrorChapterDto {
                        tokens: vec![],
                        eol: "\n".to_string(),
                        dirty: false,
                    },
                }],
            }],
            generation: 3,
        });
        assert!(!mirror.books.contains_key("GEN"));
        assert!(mirror.books.contains_key("EXO"));
    }

    #[test]
    fn analyze_scope_filters_to_known_books() {
        let mut mirror = WorkspaceTokenMirror::default();
        push_chapter(&mut mirror, "GEN", 1, "one", 1);
        let scope = AnalyzeScopeDto::Books {
            books: vec!["GEN".to_string(), "MISSING".to_string()],
        };
        assert_eq!(mirror.books_in_scope(&scope), vec!["GEN".to_string()]);
        assert_eq!(
            mirror.books_in_scope(&AnalyzeScopeDto::All("all".to_string())),
            vec!["GEN".to_string()]
        );
    }

    // --- Cross-language protocol contract (TS <-> Rust) ---------------------
    //
    // The fixture below is the SAME file the TS test pins to its types
    // (tests/unit/mirrorProtocolFixtures.test.ts). Deserializing it here pins
    // the Rust DTOs to that wire shape; with `deny_unknown_fields` on the exact
    // envelope structs, a TS-side field rename/add fails one of the two tests.
    // No codegen — this is the lightweight drift guard for the hand-maintained
    // contract.

    #[derive(Deserialize)]
    struct ProtocolFixtures {
        patches: Vec<MirrorPatchDto>,
        scopes: Vec<AnalyzeScopeDto>,
    }

    const PROTOCOL_FIXTURE_JSON: &str =
        include_str!("../tests/fixtures/mirror-protocol.json");

    #[test]
    fn fixture_patches_and_scopes_deserialize() {
        let fixtures: ProtocolFixtures =
            serde_json::from_str(PROTOCOL_FIXTURE_JSON).expect("fixture must deserialize");
        // One per MirrorPatch kind; both AnalyzeScope forms.
        assert_eq!(fixtures.patches.len(), 5);
        assert_eq!(fixtures.scopes.len(), 2);
        // Spot-check decoded shapes so a wrong-but-parseable mapping (e.g. a
        // generation that silently defaulted to 0) still fails.
        assert!(matches!(
            &fixtures.patches[0],
            MirrorPatchDto::PushChapter { generation: 5, .. }
        ));
        assert!(matches!(
            &fixtures.patches[3],
            MirrorPatchDto::FullSync { generation: 8, .. }
        ));
    }

    #[test]
    fn token_dto_ignores_unmodeled_fields() {
        // `MirrorTokenDto` is a DELIBERATE subset of the rich TS `Token`: the
        // full token crosses the wire and serde drops fields the engines don't
        // need. Guard that leniency (no `deny_unknown_fields` here, or valid
        // messages would be rejected).
        let json = r#"{"id":"x","kind":"text","source":"hi","payload":"numberRange","paragraphCategory":"poetry"}"#;
        let token: MirrorTokenDto =
            serde_json::from_str(json).expect("subset token must parse");
        assert_eq!(token.source, "hi");
    }

    #[test]
    fn exact_envelope_rejects_unknown_field() {
        // The flip side of the subset rule: an EXACT envelope struct must reject
        // an unknown field so a TS-side drift surfaces loudly here.
        let json = r#"{"bookCode":"GEN","chapterNum":1,"surprise":true}"#;
        assert!(serde_json::from_str::<ChapterRefForPatch>(json).is_err());
    }
}
