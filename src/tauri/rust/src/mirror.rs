// mirror.rs
//
// The desktop resident host: Braid owns the resident token corpus and Galley owns
// its analysis projection. This state retains only chapter metadata and disk
// baselines needed by recovery/transport policy; it does not mirror token arrays.
//
// Ordering: desktop has none (concurrent invokes are unordered), so every patch
// and command carries a `generation`. Patches apply idempotently under a
// per-entry generation guard (an older patch for an entry is a no-op); the
// mirror tracks a high-water mark, and a command whose requested generation is
// AHEAD of the mirror returns a typed "behind" result the TS side treats as a
// stale-drop (and a resync trigger). Findings return tagged with the generation
// they ran against.
//
// Token fidelity comes directly from Onion's wire DTO. There is no second native
// token shape to drift from the generated TypeScript contract; Braid receives
// the same owned token fields that cross the web boundary.

use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::sous::{GalleyConfigDto, Projection, ResidentGalley};
use crate::usfm_onion::{LintIssueDto, TokenFixDto};
use usfm_onion::lint::{LintOptions as BraidLintOptions, LintScope as BraidLintScope};
use usfm_onion_wire::dto::{owned_token_from_dto, Token as WireToken};

// --- Token DTO (owned by Onion's wire crate) -------------------------------

type MirrorTokenDto = WireToken;

fn token_to_owned(
    token: &MirrorTokenDto,
    token_idx: u32,
) -> Result<usfm_onion::token::OwnedToken, String> {
    owned_token_from_dto(token, token_idx).map_err(|error| format!("{error:?}"))
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
// `MirrorChapter` is an exact envelope; its token payload is Onion's canonical
// wire DTO. Rejecting unknown fields turns a TS-side field add/rename into a
// loud deserialize error here instead of a silent drop.
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MirrorChapterDto {
    pub tokens: Vec<MirrorTokenDto>,
    // Part of the wire DTO (per-chapter line ending), retained for resident
    // Braid serialization and line-ending fidelity.
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
    pub baseline_tokens: Vec<MirrorTokenDto>,
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
    pub baseline_tokens: Vec<MirrorTokenDto>,
    pub chapter_dirty: Vec<SyncMetaChapterDto>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResidentSeedChapterDto {
    pub chapter_num: i64,
    pub eol: String,
    pub dirty: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResidentSeedBookDto {
    pub book_code: String,
    pub disk_baseline: DiskBaselineDto,
    pub chapters: Vec<ResidentSeedChapterDto>,
}

/// The patch vocabulary, matching the TS `MirrorPatch` union by `kind`. Backup
/// patches (`pushBaseline`) carry no tokens but keep the resident baseline
/// generation current.
#[derive(Debug, Clone, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
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
    UpdateBook {
        book: FullSyncBookDto,
        generation: i64,
    },
    RemoveBook {
        book_code: String,
        generation: i64,
    },
    PushBaseline {
        book_code: String,
        disk_baseline: DiskBaselineDto,
        baseline_tokens: Vec<MirrorTokenDto>,
        generation: i64,
    },
    FullSync {
        books: Vec<FullSyncBookDto>,
        generation: i64,
    },
    ResidentSeed {
        books: Vec<ResidentSeedBookDto>,
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
    eol: String,
    dirty: bool,
    generation: i64,
}

struct ResidentBook {
    disk_baseline: DiskBaselineDto,
    baseline_generation: i64,
    // Vec preserves the chapter order supplied by the editor. Chapter numbers
    // are lookup keys, not an ordering rule; source order can be deliberate.
    chapters: Vec<(i64, ResidentChapter)>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum BraidScopeDto {
    All,
    Book { book: String },
    Chapter { target: BraidChapterTargetDto },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BraidChapterTargetDto {
    book: String,
    label: BraidChapterLabelDto,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum BraidChapterLabelDto {
    FrontMatter,
    Number { label: String },
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct BraidFormatOptionsDto {
    recover_malformed_markers: Option<bool>,
    collapse_whitespace_in_text: Option<bool>,
    ensure_inline_separators: Option<bool>,
    remove_duplicate_verse_numbers: Option<bool>,
    normalize_spacing_after_paragraph_markers: Option<bool>,
    remove_unwanted_linebreaks: Option<bool>,
    bridge_consecutive_verse_markers: Option<bool>,
    remove_orphan_empty_verse_before_contentful_verse: Option<bool>,
    remove_bridge_verse_enumerators: Option<bool>,
    move_chapter_label_after_chapter_marker: Option<bool>,
    insert_default_paragraph_after_chapter_intro: Option<bool>,
    remove_empty_paragraphs: Option<bool>,
    insert_structural_linebreaks: Option<bool>,
    collapse_consecutive_linebreaks: Option<bool>,
    normalize_marker_whitespace_at_line_start: Option<bool>,
}

fn braid_scope(scope: BraidScopeDto) -> Result<braid::CorpusScope, String> {
    match scope {
        BraidScopeDto::All => Ok(braid::CorpusScope::All),
        BraidScopeDto::Book { book } => usfm_onion::token::BookId::from_str(&book)
            .map(braid::CorpusScope::Book)
            .ok_or_else(|| format!("invalid Braid book id: {book}")),
        BraidScopeDto::Chapter { target } => {
            let book = usfm_onion::token::BookId::from_str(&target.book)
                .ok_or_else(|| format!("invalid Braid book id: {}", target.book))?;
            let label = match target.label {
                BraidChapterLabelDto::FrontMatter => braid::ChapterLabel::FrontMatter,
                BraidChapterLabelDto::Number { label } => {
                    braid::ChapterLabel::Number(label.into_boxed_str())
                }
            };
            Ok(braid::CorpusScope::Chapter(braid::ChapterTarget::new(
                book, label,
            )))
        }
    }
}

fn braid_format_options(
    options: Option<BraidFormatOptionsDto>,
) -> usfm_onion::format::FormatOptions {
    let options = options.unwrap_or_default();
    let mut native = usfm_onion::format::FormatOptions::all_enabled();
    macro_rules! apply {
        ($field:ident) => {
            if let Some(value) = options.$field {
                native.$field = value;
            }
        };
    }
    apply!(recover_malformed_markers);
    apply!(collapse_whitespace_in_text);
    apply!(ensure_inline_separators);
    apply!(remove_duplicate_verse_numbers);
    apply!(normalize_spacing_after_paragraph_markers);
    apply!(remove_unwanted_linebreaks);
    apply!(bridge_consecutive_verse_markers);
    apply!(remove_orphan_empty_verse_before_contentful_verse);
    apply!(remove_bridge_verse_enumerators);
    apply!(move_chapter_label_after_chapter_marker);
    apply!(insert_default_paragraph_after_chapter_intro);
    apply!(remove_empty_paragraphs);
    apply!(insert_structural_linebreaks);
    apply!(collapse_consecutive_linebreaks);
    apply!(normalize_marker_whitespace_at_line_start);
    native
}

#[derive(Default)]
pub struct NativeMirrorState {
    books: BTreeMap<String, ResidentBook>,
    // BTreeMap keeps lookup deterministic, while this order preserves the
    // editor/document order that Galley uses for corpus keys.
    book_order: Vec<String>,
    galley: Option<ResidentGalley>,
    galley_cache_prefetched: Option<Vec<u8>>,
    braid: Option<braid::Braid>,
    galley_packed: BTreeMap<u64, Vec<u8>>,
    next_galley_pack_id: u64,
    braid_packed: BTreeMap<u64, Vec<u8>>,
    next_braid_pack_id: u64,
    // High-water mark across all applied patches — a command requesting a
    // generation strictly greater than this is "behind" (the mirror hasn't seen
    // the patch yet on this unordered transport). A patch older than it is a
    // straggler from a superseded state and is dropped rather than applied.
    high_water: i64,
    // Which session owns this state. See `mirror_load_project`.
    epoch: u64,
}

// Tauri requires managed state to be Send + Sync. Braid's minter is a
// handle-owned callback and is intentionally not typed Send by the upstream
// native API; this state is only ever accessed through `MirrorState`'s mutex,
// so the callback and the resident handle never cross threads independently.
unsafe impl Send for NativeMirrorState {}
unsafe impl Sync for NativeMirrorState {}

impl NativeMirrorState {
    fn book_mut(&mut self, book_code: &str) -> &mut ResidentBook {
        if !self.books.contains_key(book_code) {
            self.book_order.push(book_code.to_string());
        }
        self.books
            .entry(book_code.to_string())
            .or_insert_with(|| ResidentBook {
                disk_baseline: DiskBaselineDto::Absent,
                baseline_generation: -1,
                chapters: Vec::new(),
            })
    }

    fn bump_high_water(&mut self, generation: i64) {
        if generation > self.high_water {
            self.high_water = generation;
        }
    }

    /// A whole-corpus patch older than anything already applied describes a
    /// state the corpus has moved past. Tauri invokes are unordered, so this is
    /// an ordinary arrival, not an error — but applying it would replace newer
    /// resident content with older content.
    fn corpus_patch_is_stale(&self, generation: i64) -> bool {
        generation < self.high_water
    }

    /// The per-book counterpart. Corpus-wide staleness cannot be used here: a
    /// newer patch for a DIFFERENT book says nothing about this one, and
    /// dropping this patch on that basis would lose its edit outright.
    fn book_patch_is_stale(&self, book_code: &str, generation: i64) -> bool {
        self.books.get(book_code).is_some_and(|book| {
            book.baseline_generation > generation
                || book
                    .chapters
                    .iter()
                    .any(|(_, chapter)| chapter.generation > generation)
        })
    }

    fn apply_patch(&mut self, patch: MirrorPatchDto) -> Result<(), String> {
        match patch {
            MirrorPatchDto::FullSync { books, generation } => {
                if self.corpus_patch_is_stale(generation) {
                    return Ok(());
                }
                self.replace_braid_corpus(&books)?;
                self.books.clear();
                self.book_order.clear();
                self.galley = None;
                self.galley_cache_prefetched = None;
                self.galley_packed.clear();
                self.braid_packed.clear();
                for book in books {
                    self.book_order.push(book.book_code.clone());
                    let mut chapters = Vec::new();
                    for entry in book.chapters {
                        chapters.push((
                            entry.chapter_num,
                            ResidentChapter {
                                eol: entry.chapter.eol,
                                dirty: entry.chapter.dirty,
                                generation,
                            },
                        ));
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
                self.galley = None;
            }
            MirrorPatchDto::ResidentSeed { books, generation } => {
                if self.corpus_patch_is_stale(generation) {
                    return Ok(());
                }
                self.books.clear();
                self.book_order.clear();
                self.galley = None;
                self.galley_cache_prefetched = None;
                for book in books {
                    self.book_order.push(book.book_code.clone());
                    self.books.insert(
                        book.book_code,
                        ResidentBook {
                            disk_baseline: book.disk_baseline,
                            baseline_generation: generation,
                            chapters: book
                                .chapters
                                .into_iter()
                                .map(|chapter| {
                                    (
                                        chapter.chapter_num,
                                        ResidentChapter {
                                            eol: chapter.eol,
                                            dirty: chapter.dirty,
                                            generation,
                                        },
                                    )
                                })
                                .collect(),
                        },
                    );
                }
                self.bump_high_water(generation);
            }
            MirrorPatchDto::SyncMeta { books, generation } => {
                for meta in books {
                    let book_code = meta.book_code.clone();
                    let advances_baseline;
                    {
                        let Some(book) = self.books.get_mut(&book_code) else {
                            continue;
                        };
                        advances_baseline = book.baseline_generation <= generation;
                        if advances_baseline {
                            book.disk_baseline = meta.disk_baseline;
                            book.baseline_generation = generation;
                        }
                        for entry in meta.chapter_dirty {
                            if let Some((_, chapter)) = book
                                .chapters
                                .iter_mut()
                                .find(|(chapter_num, _)| *chapter_num == entry.chapter_num)
                            {
                                if chapter.generation <= generation {
                                    chapter.dirty = entry.dirty;
                                    chapter.generation = generation;
                                }
                            }
                        }
                    }
                    // Under the SAME guard as the disk baseline above: a stale
                    // syncMeta must not roll Braid's baseline back to the
                    // snapshot a newer save already advanced past.
                    if advances_baseline {
                        self.set_braid_baseline(&book_code, meta.baseline_tokens)?;
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
                    .iter()
                    .find(|(chapter_num, _)| *chapter_num == ref_.chapter_num)
                    .is_some_and(|(_, existing)| existing.generation > generation);
                if !stale {
                    let braid_tokens = chapter.tokens.clone();
                    let braid_eol = chapter.eol.clone();
                    if let Some((_, existing)) = book
                        .chapters
                        .iter_mut()
                        .find(|(chapter_num, _)| *chapter_num == ref_.chapter_num)
                    {
                        *existing = ResidentChapter {
                            eol: braid_eol,
                            dirty: chapter.dirty,
                            generation,
                        };
                    } else {
                        book.chapters.push((
                            ref_.chapter_num,
                            ResidentChapter {
                                eol: braid_eol,
                                dirty: chapter.dirty,
                                generation,
                            },
                        ));
                    }
                    self.update_braid_chapter(&ref_.book_code, ref_.chapter_num, braid_tokens)?;
                    if let Ok(projection) = self.braid_projection(braid::CorpusScope::Chapter(
                        braid::ChapterTarget::new(
                            usfm_onion::token::BookId::from_str(&ref_.book_code)
                                .unwrap_or(usfm_onion::token::BookId::UNKNOWN),
                            chapter_label(ref_.chapter_num),
                        ),
                    )) {
                        self.update_resident_chapter(&ref_.book_code, ref_.chapter_num, projection);
                    } else {
                        self.galley = None;
                    }
                }
                self.bump_high_water(generation);
            }
            MirrorPatchDto::DeleteChapter { ref_, generation } => {
                let mut deleted = false;
                let mut book_is_empty = false;
                if let Some(book) = self.books.get_mut(&ref_.book_code) {
                    let stale = book
                        .chapters
                        .iter()
                        .find(|(chapter_num, _)| *chapter_num == ref_.chapter_num)
                        .is_some_and(|(_, existing)| existing.generation > generation);
                    if !stale {
                        if let Some(index) = book
                            .chapters
                            .iter()
                            .position(|(chapter_num, _)| *chapter_num == ref_.chapter_num)
                        {
                            book.chapters.remove(index);
                            deleted = true;
                        }
                        book_is_empty = book.chapters.is_empty();
                    }
                }
                if deleted {
                    if book_is_empty {
                        self.books.remove(&ref_.book_code);
                        self.book_order.retain(|code| code != &ref_.book_code);
                        self.remove_resident_book(&ref_.book_code);
                        self.remove_braid_book(&ref_.book_code);
                    } else {
                        self.remove_braid_chapter(&ref_.book_code, ref_.chapter_num)?;
                        if let Ok(book) = usfm_onion::token::BookId::from_str(&ref_.book_code)
                            .ok_or_else(|| "invalid Braid book id".to_string())
                            .and_then(|book| self.braid_projection(braid::CorpusScope::Book(book)))
                        {
                            self.update_resident_book(&ref_.book_code, book);
                        } else {
                            self.galley = None;
                        }
                    }
                }
                self.bump_high_water(generation);
            }
            MirrorPatchDto::UpdateBook { book, generation } => {
                if self.book_patch_is_stale(&book.book_code, generation) {
                    self.bump_high_water(generation);
                    return Ok(());
                }
                self.update_braid_book(&book)?;
                let book_code = book.book_code.clone();
                self.books.insert(
                    book_code.clone(),
                    ResidentBook {
                        disk_baseline: book.disk_baseline,
                        baseline_generation: generation,
                        chapters: book
                            .chapters
                            .into_iter()
                            .map(|entry| {
                                (
                                    entry.chapter_num,
                                    ResidentChapter {
                                        eol: entry.chapter.eol,
                                        dirty: entry.chapter.dirty,
                                        generation,
                                    },
                                )
                            })
                            .collect(),
                    },
                );
                if !self.book_order.iter().any(|code| code == &book_code) {
                    self.book_order.push(book_code.clone());
                }
                self.set_braid_baseline(&book_code, book.baseline_tokens)?;
                let projection = self.braid_projection(braid::CorpusScope::Book(
                    usfm_onion::token::BookId::from_str(&book_code)
                        .ok_or_else(|| "invalid Braid book id".to_string())?,
                ))?;
                self.update_resident_book(&book_code, projection);
                self.bump_high_water(generation);
            }
            MirrorPatchDto::RemoveBook {
                book_code,
                generation,
            } => {
                if self.book_patch_is_stale(&book_code, generation) {
                    self.bump_high_water(generation);
                    return Ok(());
                }
                let existed = self.books.remove(&book_code).is_some();
                if existed {
                    self.book_order.retain(|code| code != &book_code);
                    self.remove_braid_book(&book_code);
                    self.remove_resident_book(&book_code);
                }
                self.bump_high_water(generation);
            }
            MirrorPatchDto::PushBaseline {
                book_code,
                disk_baseline,
                baseline_tokens,
                generation,
            } => {
                let should_update = {
                    let book = self.book_mut(&book_code);
                    if book.baseline_generation <= generation {
                        book.disk_baseline = disk_baseline;
                        book.baseline_generation = generation;
                        true
                    } else {
                        false
                    }
                };
                if should_update {
                    self.set_braid_baseline(&book_code, baseline_tokens)?;
                }
                self.bump_high_water(generation);
            }
        }
        Ok(())
    }

    fn update_resident_chapter(
        &mut self,
        book_code: &str,
        chapter_num: i64,
        projection: Projection,
    ) {
        let Some(galley) = self.galley.as_mut() else {
            return;
        };
        if galley
            .update_chapter(book_code, chapter_num, projection)
            .is_ok()
        {
            return;
        }
        let Ok(book) = usfm_onion::token::BookId::from_str(book_code)
            .ok_or_else(|| "invalid Braid book id".to_string())
            .and_then(|book| self.braid_projection(braid::CorpusScope::Book(book)))
        else {
            self.galley = None;
            return;
        };
        self.update_resident_book(book_code, book);
    }

    fn update_resident_book(&mut self, book_code: &str, projection: Projection) {
        let Some(galley) = self.galley.as_mut() else {
            return;
        };
        if galley.update_book(book_code, projection).is_err() {
            self.galley = None;
        }
    }

    fn remove_resident_book(&mut self, book_code: &str) {
        if let Some(galley) = self.galley.as_mut() {
            galley.remove_book(book_code);
        }
    }

    fn ensure_braid(&mut self) -> Result<&mut braid::Braid, String> {
        self.braid
            .as_mut()
            .ok_or_else(|| "Braid resident must be loaded or seeded by a sync".to_string())
    }

    fn publish_braid(&mut self) -> Result<NativeBraidPublication, String> {
        let publication = self
            .ensure_braid()?
            .publish()
            .map_err(|error| format!("Braid publication failed: {error:?}"))?;
        let braid = self.ensure_braid()?;
        let serialized_books = match braid
            .to_usfm(braid::CorpusScope::All)
            .map_err(|error| format!("Braid corpus USFM serialization failed: {error:?}"))?
        {
            braid::ScopedOutput::Single(_) => {
                return Err("Braid returned a single-book result for all-scope output".to_string())
            }
            braid::ScopedOutput::All(books) => books
                .into_iter()
                .map(|book| MirrorBraidBookOutputDto {
                    book_code: book.book.to_string(),
                    contents: book.value,
                })
                .collect::<Vec<_>>(),
        };
        let source_key_by_book = braid
            .books()
            .into_iter()
            .map(|book| (book.book.to_string(), book.source_key.as_str().to_string()))
            .collect::<BTreeMap<_, _>>();
        let source_by_book = serialized_books
            .iter()
            .map(|book| (book.book_code.clone(), book.contents.clone()))
            .collect::<BTreeMap<_, _>>();
        let books = publication
            .books
            .into_iter()
            .map(|book| MirrorPublishedBraidBookDto {
                book_code: book.book.clone(),
                source_hash: book.source_hash,
                encoded: book.encoded,
                source: book
                    .source
                    .or_else(|| source_by_book.get(&book.book).cloned()),
            })
            .collect::<Vec<_>>();
        let sources = serialized_books
            .iter()
            .map(|book| MirrorPublishedBraidSourceDto {
                book_code: book.book_code.clone(),
                source_key: source_key_by_book
                    .get(&book.book_code)
                    .cloned()
                    .unwrap_or_else(|| book.book_code.clone()),
                source: book.contents.clone(),
            })
            .collect::<Vec<_>>();
        let packed_id = self.next_braid_pack_id;
        self.next_braid_pack_id = self.next_braid_pack_id.saturating_add(1);
        self.braid_packed.insert(packed_id, publication.bytes);
        Ok(NativeBraidPublication {
            packed_id,
            snapshot_id: publication.snapshot_id,
            books,
            sources,
            serialized_books,
        })
    }

    /// Bring BOTH resident arms up for one project and hand the frontend the
    /// bytes it needs to materialize them.
    ///
    /// Braid is seeded from each book's exact disk bytes — `BookInput::Usfm`,
    /// never a token round trip — so every hash it publishes binds to the file
    /// on disk. That is what lets the sidecar be validated by Braid itself on
    /// the next open, lets the frontend verify the same container against the
    /// same bytes, and makes the crash-recovery md5 a hash of real disk content.
    fn load_project(
        &mut self,
        cache_root: &str,
        workspace_key: &str,
        dirty_buffer_root: &str,
        books: &[MirrorLoadProjectBookDto],
        config: Option<&GalleyConfigDto>,
        analysis_disabled: bool,
    ) -> Result<MirrorLoadProjectResultDto, String> {
        let mut phases = HostPhases::default();
        let cache_dir = PathBuf::from(cache_root).join("braid").join(workspace_key);
        let corpus_path = cache_dir.join("corpus.bin");
        self.galley_cache_prefetched = None;
        let galley_cache_path = PathBuf::from(cache_root)
            .join("sous-chef-findings")
            .join(workspace_key)
            .join("corpus.bin");

        let ((sidecar, disk_sources), galley_cache) = phases.timed(
            "native:load:read",
            || {
                rayon::join(
                    || {
                        let disk_sources = books
                            .par_iter()
                            .map(|book| {
                                std::fs::read_to_string(&book.path)
                                    .map(|source| DiskBookSource {
                                        book_code: book.book_code.clone(),
                                        source_key: book.source_key.clone(),
                                        source,
                                    })
                                    .map_err(|error| {
                                        format!("failed to read {}: {error}", book.path)
                                    })
                            })
                            .collect::<Result<Vec<_>, _>>();
                        (std::fs::read(&corpus_path).ok(), disk_sources)
                    },
                    || std::fs::read(galley_cache_path).ok(),
                )
            },
            |((sidecar, _), galley_cache)| {
                vec![
                    ("braidCache", cache_state(sidecar.is_some())),
                    ("galleyCache", cache_state(galley_cache.is_some())),
                ]
            },
        );
        let disk_sources = disk_sources?;
        self.galley_cache_prefetched = galley_cache;

        let (sources_blob, mut catalog) = phases.timed(
            "native:load:hash-sources",
            || {
                let mut blob =
                    Vec::with_capacity(disk_sources.iter().map(|book| book.source.len()).sum());
                let digests = disk_sources
                    .par_iter()
                    .map(|book| crate::md5::md5_hex(&book.source))
                    .collect::<Vec<_>>();
                let mut catalog = Vec::with_capacity(disk_sources.len());
                for (book, source_md5) in disk_sources.iter().zip(digests) {
                    let bytes = book.source.as_bytes();
                    catalog.push(MirrorLoadedBookDto {
                        book_code: book.book_code.clone(),
                        source_key: book.source_key.clone(),
                        byte_offset: blob.len(),
                        byte_length: bytes.len(),
                        source_md5,
                        dirty_chapters: None,
                    });
                    blob.extend_from_slice(bytes);
                }
                (blob, catalog)
            },
            |(blob, catalog)| {
                vec![
                    ("books", catalog.len().to_string()),
                    ("bytes", blob.len().to_string()),
                ]
            },
        );

        let restored = match sidecar {
            None => None,
            Some(sidecar) => {
                let accepted = phases.timed(
                    "native:braid:restore",
                    || self.restore_published_corpus(&sidecar, &disk_sources),
                    |outcome| vec![("state", restore_state(outcome))],
                );
                accepted.ok().map(|()| sidecar)
            }
        };

        let state = if restored.is_some() { "warm" } else { "cold" };
        if restored.is_none() {
            phases.timed(
                "native:braid:cold-seed",
                || self.cold_seed_braid(&disk_sources),
                no_detail,
            )?;
        }

        // Crash recovery, as a layer over the corpus just established: baseline
        // is disk, current becomes the backup. Everything downstream — lint,
        // publish, Galley — then runs ONCE, on the effective content.
        let mut layered: BTreeMap<String, String> = BTreeMap::new();
        let recovery = {
            let started_ms = phases.since();
            let recovery = self.layer_dirty_buffers(
                &dirty_buffer_root,
                &workspace_key,
                &mut catalog,
                &sources_blob,
                &mut layered,
            );
            phases.push(
                "native:braid:recover",
                started_ms,
                vec![
                    ("restored", recovery.restored_book_codes.len().to_string()),
                    (
                        "conflicted",
                        recovery.conflicted_book_codes.len().to_string(),
                    ),
                    ("reported", recovery.entries.len().to_string()),
                ],
            );
            recovery
        };
        let recovered = !recovery.restored_book_codes.is_empty();
        // What main certifies the container against has to be what the
        // container is BOUND to, book for book: layering rebound the recovered
        // books, so their bytes (and every later extent) move with them.
        let sources_blob = if layered.is_empty() {
            sources_blob
        } else {
            rebind_sources(&mut catalog, &sources_blob, &layered)
        };

        let packed_id = match restored {
            // A warm open that layered nothing already holds the exact bytes
            // main needs; anything else has to republish so main can
            // materialize the effective corpus from a container.
            Some(sidecar) if !recovered => self.store_braid_packed(sidecar),
            _ => phases.timed("native:braid:publish", || self.publish_packed(), no_detail)?,
        };

        // THE SIDECAR MEANS "THIS IS WHAT IS ON DISK". A recovery open holds
        // unsaved work, so republishing it here would label the user's backup as
        // the saved corpus and the next open would restore it as clean. Same
        // rule Galley follows with `cachePolicy: "none"`. Only a cold open —
        // which by definition just parsed disk and layered nothing — may write.
        if state == "cold" && !recovered {
            if let Some(packed) = self.braid_packed.get(&packed_id).cloned() {
                let offset_ms = phases.since();
                phases.push(
                    "native:braid:cache-write",
                    offset_ms,
                    vec![
                        ("state", "queued".to_string()),
                        ("bytes", packed.len().to_string()),
                    ],
                );
                // Existence is never validity: an entry a previous open
                // rejected is replaced here, which is the only way a corrupt
                // sidecar ever heals. Best-effort and off the load path — a
                // failure only costs the next open its warm start.
                std::thread::spawn(move || {
                    if std::fs::create_dir_all(&cache_dir).is_ok() {
                        if let Err(error) = atomic_write_file(&corpus_path, &packed) {
                            eprintln!("[startup:cache-write] arm=braid state=failed {error}");
                        } else {
                            eprintln!(
                                "[startup:cache-write] arm=braid origin=load state=written bytes={}",
                                packed.len()
                            );
                        }
                    }
                });
            }
        } else if recovered {
            let offset_ms = phases.since();
            phases.push(
                "native:braid:cache-write",
                offset_ms,
                vec![
                    ("state", "skipped".to_string()),
                    ("reason", "recovered".to_string()),
                ],
            );
        }

        let galley = if analysis_disabled {
            None
        } else {
            Some(self.load_galley(config, &mut phases)?)
        };

        Ok(MirrorLoadProjectResultDto {
            state: state.to_string(),
            packed_id,
            sources_id: self.store_braid_packed(sources_blob),
            books: catalog,
            recovery,
            galley,
            host_phases: phases.phases,
            error: None,
        })
    }

    /// Galley's half of the load: seeded from the freshly resident Braid
    /// projection, then answered from its own cache when one is present.
    fn load_galley(
        &mut self,
        config: Option<&GalleyConfigDto>,
        phases: &mut HostPhases,
    ) -> Result<MirrorLoadGalleyDto, String> {
        let projection = phases.timed(
            "native:galley:seed",
            || self.braid_projection(braid::CorpusScope::All),
            no_detail,
        )?;
        let mut galley = ResidentGalley::new(projection, config)?;
        let cached = self.galley_cache_prefetched.take();
        let result = match cached {
            Some(packed) => phases.timed(
                "native:galley:restore",
                || galley.load_cached(packed),
                no_detail,
            ),
            None => phases.timed("native:galley:analyze", || galley.analyze(), no_detail)?,
        };
        self.galley = Some(galley);
        Ok(MirrorLoadGalleyDto {
            packed_id: self.store_galley_packed(result.packed),
            keys: result.keys,
            cache_state: result.cache_state,
            expected_identity: result.expected_identity,
        })
    }

    fn cold_seed_braid(&mut self, disk_sources: &[DiskBookSource]) -> Result<(), String> {
        let mut braid = new_braid();
        let inputs = disk_sources
            .iter()
            .map(|book| book.braid_input())
            .collect::<Result<Vec<_>, _>>()?;
        braid
            .replace_corpus(braid::CorpusInput::new(inputs))
            .map_err(|error| format!("Braid cold seed failed: {error:?}"))?;
        self.braid = Some(braid);
        // A cold seed IS the disk state, so declaring it as the baseline is a
        // statement about what is already resident — not content to hand back.
        self.ensure_braid()?
            .set_baseline_to_current(braid::CorpusScope::All)
            .map_err(|error| format!("Braid cold baseline failed: {error:?}"))?;
        Ok(())
    }

    /// Pack the resident corpus for the sidecar. Unlike `publish_braid` this
    /// skips the whole-corpus `to_usfm` pass a save receipt needs: a load only
    /// wants the container's bytes.
    fn publish_packed(&mut self) -> Result<u64, String> {
        let publication = self
            .ensure_braid()?
            .publish()
            .map_err(|error| format!("Braid publication failed: {error:?}"))?;
        Ok(self.store_braid_packed(publication.bytes))
    }

    fn store_braid_packed(&mut self, bytes: Vec<u8>) -> u64 {
        let packed_id = self.next_braid_pack_id.max(1);
        self.next_braid_pack_id = packed_id.wrapping_add(1).max(1);
        self.braid_packed.insert(packed_id, bytes);
        packed_id
    }

    /// Seed the resident corpus from the sidecar plus the exact disk bytes it
    /// must be bound to. Braid performs the whole trust boundary, so a rejection
    /// here IS the cache-validity answer.
    fn restore_published_corpus(
        &mut self,
        packed: &[u8],
        records: &[DiskBookSource],
    ) -> Result<(), String> {
        let sources = records
            .iter()
            .map(|record| braid::PublishedCorpusSource {
                book: record.book_code.clone(),
                source_key: record.source_key.clone(),
                source: record.source.as_bytes().to_vec(),
            })
            .collect::<Vec<_>>();
        if self.braid.is_none() {
            self.braid = Some(new_braid());
        }
        self.ensure_braid()?
            .restore_published_corpus(packed, &sources)
            .map_err(|error| format!("Braid warm restore failed: {error}"))?;
        // A warm restore installs exactly the bytes the container was bound to
        // — the files on disk — so current IS the saved state, and that is the
        // whole fact being recorded.
        self.ensure_braid()?
            .set_baseline_to_current(braid::CorpusScope::All)
            .map_err(|error| format!("Braid warm baseline restore failed: {error:?}"))?;
        Ok(())
    }

    /// Layer every usable crash backup over the corpus just established.
    ///
    /// Baseline is disk at this point, so `update_book` makes current the backup
    /// and leaves the comparison intact — which is what lets Braid, rather than
    /// a token diff on main, answer both "is this stale residue" and "which
    /// chapters did the user actually change".
    ///
    /// Nothing here fails the load: a backup that cannot be read, parsed, or
    /// matched to a resident book becomes a report entry and the reopen
    /// continues. The named file may still hold the translator's only copy.
    fn layer_dirty_buffers(
        &mut self,
        dirty_buffer_root: &str,
        workspace_key: &str,
        catalog: &mut [MirrorLoadedBookDto],
        sources: &[u8],
        // `layered` receives each layered book's backup source — its new bound
        // source, which `rebind_sources` then writes into the blob.
        layered: &mut BTreeMap<String, String>,
    ) -> MirrorRecoveryDto {
        let mut recovery = MirrorRecoveryDto::default();
        for item in list_dirty_buffers(dirty_buffer_root, workspace_key) {
            let (disk_baseline, content) = match item.result {
                DirtyBufferRead::Missing => continue,
                DirtyBufferRead::Unreadable { reason, message } => {
                    recovery
                        .entries
                        .push(MirrorRecoveryEntryDto::BackupUnreadable {
                            reason: reason.as_str().to_string(),
                            message,
                            path: item.path,
                        });
                    continue;
                }
                DirtyBufferRead::Valid {
                    disk_baseline,
                    content,
                } => (disk_baseline, content),
            };

            let Some(index) = catalog
                .iter()
                .position(|book| book.book_code == item.book_code)
            else {
                // Not in the project at all. Distinct from "we have no baseline
                // for it": a loaded book whose md5 is unknown is still on disk
                // and still restores.
                recovery
                    .entries
                    .push(MirrorRecoveryEntryDto::ManualRecovery {
                        sub_kind: match disk_baseline {
                            DiskBaselineDto::Absent => "new-book-not-supported",
                            DiskBaselineDto::Present { .. } => "disk-book-missing",
                        }
                        .to_string(),
                        book_code: item.book_code,
                        path: item.path,
                    });
                continue;
            };

            let book_code = catalog[index].book_code.clone();
            let disk_source = String::from_utf8_lossy(
                &sources[catalog[index].byte_offset
                    ..catalog[index].byte_offset + catalog[index].byte_length],
            )
            .into_owned();
            let content_for_binding = content.clone();
            let input = braid::SourceKey::new(catalog[index].source_key.clone())
                .zip(usfm_onion::token::BookId::from_str(&book_code))
                .map(|(source_key, book)| braid::BookInput::Usfm {
                    source_key,
                    book,
                    source: content,
                });
            if let Err(error) = match input {
                None => Err(format!("invalid Braid address for {book_code}")),
                Some(input) => self.ensure_braid().and_then(|braid| {
                    braid
                        .update_book(input)
                        .map(|_| ())
                        .map_err(|error| format!("{error:?}"))
                }),
            } {
                recovery
                    .entries
                    .push(MirrorRecoveryEntryDto::UsfmParseError {
                        message: error,
                        path: item.path,
                        book_code,
                    });
                continue;
            }

            // Residue, decided by the one authority on what "same USFM" means:
            // a save that failed to clear its backup leaves a file equal to
            // disk, and after layering it Braid simply reports the book clean.
            let dirty_chapters = match self.braid_dirty_chapters(&book_code) {
                Ok(dirty_chapters) => dirty_chapters,
                Err(error) => {
                    // Unanswerable, so the backup stays: see the verb's own doc.
                    recovery
                        .entries
                        .push(MirrorRecoveryEntryDto::UsfmParseError {
                            message: error,
                            path: item.path,
                            book_code,
                        });
                    continue;
                }
            };
            if dirty_chapters.is_empty() {
                // Residue — but layering ALREADY rebound this book's source to
                // the backup, and `layered` is what the sources blob is rebuilt
                // from. A book reported clean must be bound to disk, or the
                // container gets published against backup bytes main will
                // certify against disk bytes.
                if let Some(book) = usfm_onion::token::BookId::from_str(&book_code) {
                    let _ = self
                        .ensure_braid()
                        .map(|braid| braid.revert_to_baseline(braid::CorpusScope::Book(book)));
                }
                let _ = std::fs::remove_file(dirty_buffer_path(
                    dirty_buffer_root,
                    workspace_key,
                    &book_code,
                ));
                continue;
            }
            // Disk moved underneath the backup. A message, never a branch — the
            // work is kept either way; an unknown baseline counts as moved.
            let conflicted = match &disk_baseline {
                DiskBaselineDto::Absent => true,
                DiskBaselineDto::Present { md5 } => *md5 != catalog[index].source_md5,
            };
            catalog[index].dirty_chapters = Some(dirty_chapters);
            // Disk, before the backup replaced it as this book's bound source.
            recovery
                .disk_source_by_book
                .insert(book_code.clone(), disk_source);
            layered.insert(book_code.clone(), content_for_binding);
            recovery.restored_book_codes.push(book_code.clone());
            if conflicted {
                recovery.conflicted_book_codes.push(book_code);
            }
        }
        recovery
    }

    /// Which of a book's chapters differ from its baseline, by chapter number.
    /// Front matter has no number and is reported as 0, the same front-matter
    /// bucket findings already use.
    /// Errors are NOT swallowed into "clean". An empty result means Braid
    /// affirmatively reported every chapter equal to its baseline, and the
    /// caller deletes the backup on the strength of that — so an unanswerable
    /// scope has to surface as a failure, not as permission to delete a
    /// translator's only copy of their work.
    fn braid_dirty_chapters(&mut self, book_code: &str) -> Result<Vec<i64>, String> {
        let book = usfm_onion::token::BookId::from_str(book_code)
            .ok_or_else(|| format!("invalid Braid book id: {book_code}"))?;
        let braid = self.ensure_braid()?;
        let labels = braid
            .chapter_labels(book)
            .map_err(|error| format!("Braid chapter labels failed: {error:?}"))?;
        let mut dirty = Vec::new();
        for label in labels {
            let number = match &label {
                braid::ChapterLabel::FrontMatter => 0,
                // The label is the chapter run's label EXACTLY as the source
                // spells it, so `\c 1 \p` yields "1 " — trailing space and
                // all. Trim before reading it as a number.
                braid::ChapterLabel::Number(text) => text
                    .trim()
                    .parse::<i64>()
                    .map_err(|error| format!("non-numeric chapter label {text:?}: {error}"))?,
            };
            let target = braid::ChapterTarget::new(book, label);
            if braid
                .is_dirty(braid::CorpusScope::Chapter(target))
                .map_err(|error| format!("Braid chapter dirty check failed: {error:?}"))?
            {
                dirty.push(number);
            }
        }
        Ok(dirty)
    }

    fn replace_braid_corpus(&mut self, books: &[FullSyncBookDto]) -> Result<(), String> {
        let mut braid = new_braid();
        let inputs = books
            .iter()
            .filter_map(|book| {
                let tokens = book
                    .chapters
                    .iter()
                    .flat_map(|chapter| chapter.chapter.tokens.clone())
                    .collect::<Vec<_>>();
                if tokens.is_empty() {
                    None
                } else {
                    Some(
                        self.braid_input(
                            &book.book_code,
                            tokens,
                            book.chapters
                                .first()
                                .map(|chapter| chapter.chapter.eol.as_str())
                                .unwrap_or("\n"),
                        ),
                    )
                }
            })
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .flatten()
            .collect::<Vec<_>>();
        braid
            .replace_corpus(braid::CorpusInput::new(inputs))
            .map_err(|error| format!("Braid corpus seed failed: {error:?}"))?;
        for book in books {
            if book.baseline_tokens.is_empty() {
                continue;
            }
            let input = self
                .braid_input(
                    &book.book_code,
                    book.baseline_tokens.clone(),
                    book.chapters
                        .first()
                        .map(|chapter| chapter.chapter.eol.as_str())
                        .unwrap_or("\n"),
                )?
                .ok_or_else(|| format!("missing Braid baseline: {}", book.book_code))?;
            braid
                .set_baseline(input)
                .map_err(|error| format!("Braid baseline seed failed: {error:?}"))?;
        }
        self.braid = Some(braid);
        Ok(())
    }

    fn braid_projection(&mut self, scope: braid::CorpusScope) -> Result<Projection, String> {
        let braid = self.ensure_braid()?;
        let output = braid
            .vref_index(scope)
            .map_err(|error| format!("Braid vref index failed: {error:?}"))?;
        let entries = match output {
            braid::ScopedOutput::Single(entries) => entries,
            braid::ScopedOutput::All(books) => {
                books.into_iter().flat_map(|book| book.value).collect()
            }
        };
        let keys = entries.iter().map(|entry| entry.sid.clone()).collect();
        let texts = entries
            .iter()
            .map(|entry| entry.projection.text.clone())
            .collect();
        Ok(Projection { keys, texts })
    }

    fn braid_input(
        &self,
        book_code: &str,
        tokens: Vec<MirrorTokenDto>,
        eol: &str,
    ) -> Result<Option<braid::BookInput>, String> {
        self.braid_input_with_source_key(book_code, book_code, tokens, eol)
    }

    fn braid_input_with_source_key(
        &self,
        book_code: &str,
        source_key: &str,
        tokens: Vec<MirrorTokenDto>,
        eol: &str,
    ) -> Result<Option<braid::BookInput>, String> {
        let book = usfm_onion::token::BookId::from_str(book_code)
            .ok_or_else(|| format!("invalid Braid book id: {book_code}"))?;
        let owned = tokens
            .iter()
            .enumerate()
            .map(|(index, token)| token_to_owned(token, index as u32))
            .collect::<Result<Vec<_>, _>>()?;
        let source_key = braid::SourceKey::new(source_key.to_string())
            .ok_or_else(|| format!("invalid Braid source key: {book_code}"))?;
        let line_ending = if eol == "\r\n" {
            usfm_onion::token::LineEnding::CrLf
        } else {
            usfm_onion::token::LineEnding::Lf
        };
        Ok(Some(braid::BookInput::Tokens(braid::BookTokensInput {
            source_key,
            book,
            tokens: owned,
            line_ending,
        })))
    }

    fn set_braid_baseline(
        &mut self,
        book_code: &str,
        baseline_tokens: Vec<MirrorTokenDto>,
    ) -> Result<(), String> {
        let Some(mut braid) = self.braid.take() else {
            return Err("Braid resident must be loaded or seeded by a sync".to_string());
        };
        let result = (|| {
            if baseline_tokens.is_empty() {
                if let Some(book) = usfm_onion::token::BookId::from_str(book_code) {
                    braid.clear_baseline(book);
                }
                return Ok::<(), String>(());
            }
            let eol = self
                .books
                .get(book_code)
                .and_then(|book| book.chapters.first())
                .map(|(_, chapter)| chapter.eol.as_str())
                .unwrap_or("\n");
            let input = self
                .braid_input(book_code, baseline_tokens, eol)?
                .ok_or_else(|| format!("missing Braid baseline: {book_code}"))?;
            braid
                .set_baseline(input)
                .map_err(|error| format!("Braid baseline update failed: {error:?}"))?;
            Ok::<(), String>(())
        })();
        self.braid = if result.is_ok() { Some(braid) } else { None };
        result
    }

    fn update_braid_chapter(
        &mut self,
        book_code: &str,
        chapter_num: i64,
        chapter_tokens: Vec<MirrorTokenDto>,
    ) -> Result<(), String> {
        let Some(mut braid) = self.braid.take() else {
            return Err("Braid resident must be loaded or seeded by a sync".to_string());
        };
        let result = (|| {
            let book = usfm_onion::token::BookId::from_str(book_code)
                .ok_or_else(|| format!("invalid Braid book id: {book_code}"))?;
            let tokens = chapter_tokens
                .into_iter()
                .enumerate()
                .map(|(index, token)| token_to_owned(&token, index as u32))
                .collect::<Result<Vec<_>, _>>()?;
            let target = braid::ChapterTarget::new(book, chapter_label(chapter_num));
            braid
                .update_chapter(target, braid::ChapterInput::Tokens(tokens))
                .map_err(|error| format!("Braid chapter update failed: {error:?}"))?;
            Ok::<(), String>(())
        })();
        self.braid = Some(braid);
        result
    }

    fn update_braid_book(&mut self, book: &FullSyncBookDto) -> Result<(), String> {
        let tokens = book
            .chapters
            .iter()
            .flat_map(|chapter| chapter.chapter.tokens.clone())
            .collect::<Vec<_>>();
        let eol = book
            .chapters
            .first()
            .map(|chapter| chapter.chapter.eol.as_str())
            .unwrap_or("\n");
        let input = self
            .braid_input(&book.book_code, tokens, eol)?
            .ok_or_else(|| format!("missing Braid book: {}", book.book_code))?;
        self.ensure_braid()?
            .update_book(input)
            .map_err(|error| format!("Braid book update failed: {error:?}"))?;
        Ok(())
    }

    fn remove_braid_chapter(&mut self, book_code: &str, chapter_num: i64) -> Result<(), String> {
        let braid = self.ensure_braid()?;
        let book = usfm_onion::token::BookId::from_str(book_code)
            .ok_or_else(|| format!("invalid Braid book id: {book_code}"))?;
        braid
            .remove_chapter(braid::ChapterTarget::new(book, chapter_label(chapter_num)))
            .map_err(|error| format!("Braid chapter removal failed: {error:?}"))?;
        Ok(())
    }

    fn remove_braid_book(&mut self, book_code: &str) {
        let Some(mut braid) = self.braid.take() else {
            return;
        };
        if let Some(book) = usfm_onion::token::BookId::from_str(book_code) {
            braid.remove_book(book);
            self.braid = Some(braid);
        }
    }

    fn braid_usfm(&mut self, book_code: &str) -> Result<String, String> {
        let book = usfm_onion::token::BookId::from_str(book_code)
            .ok_or_else(|| format!("invalid Braid book id: {book_code}"))?;
        let output = self
            .ensure_braid()?
            .to_usfm(braid::CorpusScope::Book(book))
            .map_err(|error| format!("Braid USFM serialization failed: {error:?}"))?;
        match output {
            braid::ScopedOutput::Single(source) => Ok(source),
            braid::ScopedOutput::All(_) => Err("Braid returned an all-scope result".to_string()),
        }
    }

    /// Whether Braid currently holds this book at all.
    fn braid_has_book(&mut self, book_code: &str) -> bool {
        let Ok(braid) = self.ensure_braid() else {
            return false;
        };
        braid
            .books()
            .into_iter()
            .any(|book| book.book.to_string() == book_code)
    }

    fn braid_is_dirty(&mut self, book_code: &str) -> Result<bool, String> {
        let book = usfm_onion::token::BookId::from_str(book_code)
            .ok_or_else(|| format!("invalid Braid book id: {book_code}"))?;
        self.ensure_braid()?
            .is_dirty(braid::CorpusScope::Book(book))
            .map_err(|error| format!("Braid dirty check failed: {error:?}"))
    }

    fn format_braid(
        &mut self,
        scope: BraidScopeDto,
        options: Option<BraidFormatOptionsDto>,
    ) -> Result<
        (
            BTreeMap<String, Vec<MirrorTokenDto>>,
            BTreeMap<String, String>,
        ),
        String,
    > {
        let scope = braid_scope(scope)?;
        let preparation = self
            .ensure_braid()?
            .prepare_format_patch(scope, braid_format_options(options))
            .map_err(|error| format!("Braid format preparation failed: {error:?}"))?;
        let braid = self
            .braid
            .as_mut()
            .ok_or_else(|| "Braid resident was not initialized".to_string())?;
        let changed_books: Vec<String> = match preparation {
            braid::PatchPreparation::Unchanged => Vec::new(),
            braid::PatchPreparation::Ready(id) => braid
                .apply_format_patch(id)
                .map_err(|error| format!("Braid format apply failed: {error:?}"))?
                .changed
                .iter()
                .map(|changed| changed.book.to_string())
                .collect(),
        };
        let mut books = BTreeMap::new();
        let mut usfm = BTreeMap::new();
        for book_code in changed_books {
            let book = usfm_onion::token::BookId::from_str(&book_code)
                .ok_or_else(|| format!("invalid formatted Braid book id: {book_code}"))?;
            let hydrated = braid
                .to_tokens(vec![braid::Scope::book(book)])
                .map_err(|error| format!("Braid format hydration failed: {error:?}"))?;
            let tokens = hydrated
                .into_iter()
                .flat_map(|scope| scope.tokens)
                .map(|token| MirrorTokenDto::from(&token))
                .collect();
            let source = braid
                .to_usfm(braid::CorpusScope::Book(book))
                .map_err(|error| format!("Braid format USFM failed: {error:?}"))?;
            let source = match source {
                braid::ScopedOutput::Single(source) => source,
                braid::ScopedOutput::All(_) => {
                    return Err("Braid returned an all-scope result".to_string())
                }
            };
            books.insert(book_code.clone(), tokens);
            usfm.insert(book_code.clone(), source);
        }
        for book_code in usfm.keys() {
            let projection = self.braid_projection(braid::CorpusScope::Book(
                usfm_onion::token::BookId::from_str(book_code)
                    .ok_or_else(|| format!("invalid formatted book id: {book_code}"))?,
            ))?;
            self.update_resident_book(book_code, projection);
        }
        Ok((books, usfm))
    }

    fn apply_braid_fix(
        &mut self,
        book_code: &str,
        fix: &TokenFixDto,
    ) -> Result<
        (
            BTreeMap<String, Vec<MirrorTokenDto>>,
            BTreeMap<String, String>,
        ),
        String,
    > {
        let (code, label, label_params, target_token_id) = token_fix_identity(fix);
        let book = usfm_onion::token::BookId::from_str(book_code)
            .ok_or_else(|| format!("invalid Braid book id: {book_code}"))?;
        let token_ids: Vec<String> = self
            .ensure_braid()?
            .to_tokens(vec![braid::Scope::book(book)])
            .map_err(|error| format!("Braid fix token hydration failed: {error:?}"))?
            .into_iter()
            .flat_map(|scope| scope.tokens)
            .map(|token| token.id().to_string())
            .collect();
        let braid = self.ensure_braid()?;
        let patch = braid
            .patches()
            .into_iter()
            .find(|candidate| {
                candidate.book.as_str() == book_code
                    && candidate.code == code
                    && candidate.label == label
                    && candidate.label_params == *label_params
                    && candidate.rows.iter().any(|row| {
                        token_ids
                            .get(row.position as usize)
                            .map(|token_id| token_id == target_token_id)
                            .unwrap_or(false)
                    })
            })
            .ok_or_else(|| format!("Braid fix is stale or unavailable for {book_code}:{code}"))?;
        let changed = braid
            .apply_patch(patch.id)
            .map_err(|error| format!("Braid fix apply failed: {error:?}"))?
            .changed;
        if changed.is_empty() {
            return Ok((BTreeMap::new(), BTreeMap::new()));
        }

        let book = usfm_onion::token::BookId::from_str(book_code)
            .ok_or_else(|| format!("invalid Braid fix book id: {book_code}"))?;
        let hydrated = braid
            .to_tokens(vec![braid::Scope::book(book)])
            .map_err(|error| format!("Braid fix hydration failed: {error:?}"))?;
        let tokens = hydrated
            .into_iter()
            .flat_map(|scope| scope.tokens)
            .map(|token| MirrorTokenDto::from(&token))
            .collect();
        let source = braid
            .to_usfm(braid::CorpusScope::Book(book))
            .map_err(|error| format!("Braid fix USFM failed: {error:?}"))?;
        let source = match source {
            braid::ScopedOutput::Single(source) => source,
            braid::ScopedOutput::All(_) => {
                return Err("Braid returned an all-scope result".to_string())
            }
        };
        let projection = self.braid_projection(braid::CorpusScope::Book(book))?;
        self.update_resident_book(book_code, projection);
        Ok((
            BTreeMap::from([(book_code.to_string(), tokens)]),
            BTreeMap::from([(book_code.to_string(), source)]),
        ))
    }

    fn store_galley_packed(&mut self, packed: Vec<u8>) -> u64 {
        // Zero is reserved for the wire-level "no payload" sentinel.
        let id = self.next_galley_pack_id.max(1);
        self.next_galley_pack_id = id.wrapping_add(1);
        self.galley_packed.insert(id, packed);
        id
    }
}

fn new_braid() -> braid::Braid {
    static NEXT_GENERATED_TOKEN_ID: AtomicU64 = AtomicU64::new(1);
    braid::Braid::new(
        braid::BraidConfig::new(BraidLintOptions::scoped(BraidLintScope::Book)),
        || {
            format!(
                "sefer-braid-generated-token-{}",
                NEXT_GENERATED_TOKEN_ID.fetch_add(1, Ordering::Relaxed)
            )
        },
    )
}

fn token_fix_identity(fix: &TokenFixDto) -> (&str, &str, &BTreeMap<String, String>, &str) {
    match fix {
        TokenFixDto::ReplaceToken {
            code,
            label,
            label_params,
            target_token_id,
            ..
        }
        | TokenFixDto::DeleteToken {
            code,
            label,
            label_params,
            target_token_id,
        }
        | TokenFixDto::InsertAfter {
            code,
            label,
            label_params,
            target_token_id,
            ..
        } => (code, label, label_params, target_token_id),
    }
}

// --- Command scope + results -----------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorLintResultDto {
    /// The complete resident Braid snapshot. The app may project it for UI
    /// display, but the transport never sends a per-book delta.
    pub snapshot: MirrorLintSnapshotDto,
    pub ran_at_generation: i64,
    /// True when the mirror's high-water mark is behind the requested
    /// generation: the TS side drops the (empty) result and may resync.
    pub behind: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorLintSnapshotDto {
    pub snapshot_id: String,
    pub books: Vec<MirrorBookLintSnapshotDto>,
    pub summary: MirrorLintSummaryDto,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorBookLintSnapshotDto {
    pub source_key: String,
    pub book: String,
    pub source_hash: String,
    pub token_identity: String,
    pub findings: Vec<LintIssueDto>,
    pub summary: MirrorLintSummaryDto,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorLintSummaryDto {
    pub by_category: BTreeMap<String, usize>,
    pub by_severity: BTreeMap<String, usize>,
    pub by_issue_type: BTreeMap<String, usize>,
    pub total_count: usize,
    pub suppressed_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorGalleyResultDto {
    pub packed_id: u64,
    pub keys: Vec<String>,
    pub cache_state: String,
    pub expected_identity: Option<crate::sous::GalleyCacheIdentityDto>,
    pub ran_at_generation: i64,
    pub behind: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorFormatBraidResultDto {
    pub books: BTreeMap<String, Vec<MirrorTokenDto>>,
    pub usfm: BTreeMap<String, String>,
    pub ran_at_generation: i64,
    pub behind: bool,
    pub superseded: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorApplyBraidFixResultDto {
    pub books: BTreeMap<String, Vec<MirrorTokenDto>>,
    pub usfm: BTreeMap<String, String>,
    pub ran_at_generation: i64,
    pub behind: bool,
    pub superseded: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorBraidBookOutputDto {
    pub book_code: String,
    pub contents: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorPublishedBraidBookDto {
    pub book_code: String,
    pub source_hash: String,
    pub encoded: bool,
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorPublishedBraidSourceDto {
    pub book_code: String,
    pub source_key: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorPublishBraidResultDto {
    pub packed_id: u64,
    pub snapshot_id: String,
    pub books: Vec<MirrorPublishedBraidBookDto>,
    pub sources: Vec<MirrorPublishedBraidSourceDto>,
    pub serialized_books: Vec<MirrorBraidBookOutputDto>,
    pub ran_at_generation: i64,
    pub behind: bool,
    pub superseded: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MirrorLoadProjectBookDto {
    pub book_code: String,
    pub source_key: String,
    pub path: String,
}

/// One loaded book, addressing its exact disk bytes inside the single sources
/// buffer the frontend fetches over the binary response path.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorLoadedBookDto {
    pub book_code: String,
    pub source_key: String,
    pub byte_offset: usize,
    pub byte_length: usize,
    pub source_md5: String,
    /// Chapters differing from this book's baseline (0 is front matter).
    /// Present only when a crash backup was layered over the book.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dirty_chapters: Option<Vec<i64>>,
}

/// Mirrors the TS `HostRecoveryEntry` union, tag values included — the app
/// renders these by name, so the two hosts must spell them identically.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind")]
pub enum MirrorRecoveryEntryDto {
    #[serde(rename = "backup-unreadable", rename_all = "camelCase")]
    BackupUnreadable {
        reason: String,
        message: String,
        path: String,
    },
    #[serde(rename = "usfm-parse-error", rename_all = "camelCase")]
    UsfmParseError {
        message: String,
        path: String,
        book_code: String,
    },
    #[serde(rename = "manual-recovery", rename_all = "camelCase")]
    ManualRecovery {
        sub_kind: String,
        book_code: String,
        path: String,
    },
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorRecoveryDto {
    pub restored_book_codes: Vec<String>,
    pub conflicted_book_codes: Vec<String>,
    pub entries: Vec<MirrorRecoveryEntryDto>,
    /// Each restored book's DISK source. It cannot ride in the `sources` blob:
    /// that blob is what the packed container is BOUND to, and layering a
    /// backup rebinds the book to the backup — certification checks exact
    /// source length and content hash, so the two must agree. Main holds this
    /// as the recovered book's baseline.
    pub disk_source_by_book: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorLoadGalleyDto {
    pub packed_id: u64,
    pub keys: Vec<String>,
    pub cache_state: String,
    pub expected_identity: Option<crate::sous::GalleyCacheIdentityDto>,
}

/// A phase this host measured, replayed into the frontend's startup trace so
/// native and main costs read as one ordered sequence.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorHostPhaseDto {
    pub phase: String,
    /// Start, relative to this load's own recorder — rebased onto the trace.
    pub offset_ms: f64,
    pub duration_ms: f64,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub detail: BTreeMap<String, String>,
}

/// Bookkeeping only. Every large payload is a handle the frontend redeems
/// through `mirror_braid_packed`/`mirror_galley_packed`, so no part of the
/// corpus is JSON-encoded across the IPC boundary.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorLoadProjectResultDto {
    pub state: String,
    pub packed_id: u64,
    pub sources_id: u64,
    pub books: Vec<MirrorLoadedBookDto>,
    pub recovery: MirrorRecoveryDto,
    pub galley: Option<MirrorLoadGalleyDto>,
    pub host_phases: Vec<MirrorHostPhaseDto>,
    pub error: Option<String>,
}

/// Collects host phase timings without printing: the frontend owns the trace.
struct HostPhases {
    created_at: std::time::Instant,
    phases: Vec<MirrorHostPhaseDto>,
}

impl Default for HostPhases {
    fn default() -> Self {
        Self {
            created_at: std::time::Instant::now(),
            phases: Vec::new(),
        }
    }
}

impl HostPhases {
    fn since(&self) -> f64 {
        self.created_at.elapsed().as_secs_f64() * 1000.0
    }

    fn push(&mut self, phase: &str, offset_ms: f64, detail: Vec<(&'static str, String)>) {
        self.phases.push(MirrorHostPhaseDto {
            phase: phase.to_string(),
            offset_ms,
            duration_ms: self.since() - offset_ms,
            detail: detail
                .into_iter()
                .map(|(key, value)| (key.to_string(), value))
                .collect(),
        });
    }

    fn timed<T>(
        &mut self,
        phase: &str,
        operation: impl FnOnce() -> T,
        detail: impl FnOnce(&T) -> Vec<(&'static str, String)>,
    ) -> T {
        let offset_ms = self.since();
        let value = operation();
        self.push(phase, offset_ms, detail(&value));
        value
    }
}

fn no_detail<T>(_: &T) -> Vec<(&'static str, String)> {
    Vec::new()
}

fn cache_state(present: bool) -> String {
    if present { "hit" } else { "miss" }.to_string()
}

fn restore_state(outcome: &Result<(), String>) -> String {
    match outcome {
        Ok(()) => "accepted".to_string(),
        Err(error) => format!("rejected: {error}"),
    }
}

/// One book's exact bytes as read from disk, with the key the corpus addresses
/// it by. The source form of `BookInput` keeps those bytes verbatim, so this is
/// the only thing the load path ever hands Braid.
struct DiskBookSource {
    book_code: String,
    source_key: String,
    source: String,
}

impl DiskBookSource {
    fn braid_input(&self) -> Result<braid::BookInput, String> {
        Ok(braid::BookInput::Usfm {
            source_key: braid::SourceKey::new(self.source_key.clone())
                .ok_or_else(|| format!("invalid Braid source key: {}", self.source_key))?,
            book: usfm_onion::token::BookId::from_str(&self.book_code)
                .ok_or_else(|| format!("invalid Braid book id: {}", self.book_code))?,
            source: self.source.clone(),
        })
    }
}

/// Rebuild the sources blob so it holds what the corpus is now BOUND to.
///
/// Extents move with the content, so the catalog is rewritten in place rather
/// than patched. See `MirrorRecoveryDto::disk_source_by_book` for why disk
/// cannot simply stay here.
fn rebind_sources(
    catalog: &mut [MirrorLoadedBookDto],
    sources: &[u8],
    layered: &BTreeMap<String, String>,
) -> Vec<u8> {
    let mut rebound = Vec::with_capacity(sources.len());
    for book in catalog.iter_mut() {
        let bytes: &[u8] = match layered.get(&book.book_code) {
            Some(backup) => backup.as_bytes(),
            None => &sources[book.byte_offset..book.byte_offset + book.byte_length],
        };
        book.byte_offset = rebound.len();
        book.byte_length = bytes.len();
        rebound.extend_from_slice(bytes);
    }
    rebound
}

/// Install `bytes` at `path`, replacing whatever is there. A sidecar the last
/// open rejected must be overwritten, never preserved because it exists.
fn atomic_write_file(path: &std::path::Path, bytes: &[u8]) -> Result<(), String> {
    let file_name = path
        .file_name()
        .ok_or_else(|| "cache path has no file name".to_string())?
        .to_string_lossy();
    let temporary = path.with_file_name(format!(".{file_name}.tmp-{}", std::process::id()));
    std::fs::write(&temporary, bytes)
        .map_err(|error| format!("failed to write cache temporary file: {error}"))?;
    if let Err(error) = std::fs::rename(&temporary, path) {
        let _ = std::fs::remove_file(&temporary);
        return Err(format!("failed to install cache file: {error}"));
    }
    Ok(())
}

struct NativeBraidPublication {
    packed_id: u64,
    snapshot_id: String,
    books: Vec<MirrorPublishedBraidBookDto>,
    sources: Vec<MirrorPublishedBraidSourceDto>,
    serialized_books: Vec<MirrorBraidBookOutputDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorBackupResultDto {
    pub book_code: String,
    pub cleared: bool,
    pub ran_at_generation: i64,
    pub behind: bool,
}

#[tauri::command]
pub fn mirror_galley_packed(
    state: tauri::State<'_, MirrorState>,
    packed_id: u64,
) -> Result<tauri::ipc::Response, String> {
    let mut mirror = state
        .lock()
        .map_err(|_| "mirror lock poisoned".to_string())?;
    let packed = mirror
        .galley_packed
        .remove(&packed_id)
        .ok_or_else(|| format!("unknown Galley packed result {packed_id}"))?;
    Ok(tauri::ipc::Response::new(packed))
}

#[tauri::command]
pub fn mirror_braid_packed(
    state: tauri::State<'_, MirrorState>,
    packed_id: u64,
) -> Result<tauri::ipc::Response, String> {
    let mut mirror = state
        .lock()
        .map_err(|_| "mirror lock poisoned".to_string())?;
    let packed = mirror
        .braid_packed
        .remove(&packed_id)
        .ok_or_else(|| format!("unknown Braid packed result {packed_id}"))?;
    Ok(tauri::ipc::Response::new(packed))
}

/// Take ownership of the process-wide resident state for `epoch` and load the
/// project into it.
///
/// A load is by definition a complete replacement, so it resets first rather
/// than negotiating with whatever the previous workspace left behind. `epoch` is
/// what makes that safe on an unordered transport: a stale session's load or
/// teardown carries an older epoch and is refused, so it cannot reach in and
/// wipe the workspace that replaced it.
#[tauri::command]
pub fn mirror_load_project(
    state: tauri::State<'_, MirrorState>,
    epoch: u64,
    project_path: String,
    workspace_key: String,
    cache_root: String,
    dirty_buffer_root: String,
    books: Vec<MirrorLoadProjectBookDto>,
    generation: i64,
    config: Option<GalleyConfigDto>,
    analysis_disabled: bool,
) -> Result<MirrorLoadProjectResultDto, String> {
    let mut mirror = state
        .lock()
        .map_err(|_| "mirror lock poisoned".to_string())?;
    if epoch < mirror.epoch {
        return Ok(MirrorLoadProjectResultDto {
            state: "rejected".to_string(),
            packed_id: 0,
            sources_id: 0,
            books: Vec::new(),
            recovery: MirrorRecoveryDto::default(),
            galley: None,
            host_phases: Vec::new(),
            error: Some(format!(
                "load for epoch {epoch} was superseded by epoch {}",
                mirror.epoch
            )),
        });
    }
    *mirror = NativeMirrorState {
        epoch,
        high_water: generation,
        ..NativeMirrorState::default()
    };
    let result = mirror.load_project(
        &cache_root,
        &workspace_key,
        &dirty_buffer_root,
        &books,
        config.as_ref(),
        analysis_disabled,
    )?;
    eprintln!(
        "native:braid:load-project path={project_path} state={}",
        result.state
    );
    Ok(result)
}

// --- Commands (tauri) ------------------------------------------------------

pub type MirrorState = Mutex<NativeMirrorState>;

/// Reset the resident state, but only if this session still owns it. Tauri
/// invokes are unordered, so a superseded session's teardown can otherwise land
/// after its successor's load.
#[tauri::command]
pub fn mirror_dispose(state: tauri::State<'_, MirrorState>, epoch: u64) -> Result<(), String> {
    let mut mirror = state
        .lock()
        .map_err(|_| "mirror lock poisoned".to_string())?;
    if mirror.epoch != epoch {
        return Ok(());
    }
    *mirror = NativeMirrorState::default();
    Ok(())
}

#[tauri::command]
pub fn mirror_push_patch(
    state: tauri::State<'_, MirrorState>,
    patch: MirrorPatchDto,
) -> Result<(), String> {
    let mut mirror = state
        .lock()
        .map_err(|_| "mirror lock poisoned".to_string())?;
    mirror.apply_patch(patch)?;
    Ok(())
}

#[tauri::command]
pub fn mirror_lint(
    state: tauri::State<'_, MirrorState>,
    generation: i64,
) -> Result<MirrorLintResultDto, String> {
    let mut mirror = state
        .lock()
        .map_err(|_| "mirror lock poisoned".to_string())?;
    if generation > mirror.high_water {
        return Ok(MirrorLintResultDto {
            snapshot: MirrorLintSnapshotDto {
                snapshot_id: String::new(),
                books: Vec::new(),
                summary: empty_lint_summary(),
            },
            ran_at_generation: generation,
            behind: true,
        });
    }
    let braid = mirror.ensure_braid()?;
    let snapshot = braid.lint();
    let books = snapshot
        .books
        .iter()
        .map(|book| {
            let findings = book
                .result
                .issues
                .iter()
                .map(crate::usfm_onion::map_lint_issue)
                .collect::<Vec<_>>();
            Ok(MirrorBookLintSnapshotDto {
                source_key: book.source_key.as_str().to_string(),
                book: book.book.to_string(),
                source_hash: format!("{:016x}", book.source_hash.0),
                token_identity: format!("{:016x}", book.token_identity.0),
                findings,
                summary: map_braid_lint_summary(&book.result.summary)?,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    Ok(MirrorLintResultDto {
        snapshot: MirrorLintSnapshotDto {
            snapshot_id: format!("{:016x}", snapshot.id.0),
            books,
            summary: map_braid_lint_summary(&snapshot.summary)?,
        },
        ran_at_generation: generation,
        behind: false,
    })
}

#[tauri::command]
pub fn mirror_format_braid(
    state: tauri::State<'_, MirrorState>,
    generation: i64,
    scope: serde_json::Value,
    options: Option<serde_json::Value>,
) -> Result<MirrorFormatBraidResultDto, String> {
    let mut mirror = state
        .lock()
        .map_err(|_| "mirror lock poisoned".to_string())?;
    if generation != mirror.high_water {
        return Ok(MirrorFormatBraidResultDto {
            books: BTreeMap::new(),
            usfm: BTreeMap::new(),
            ran_at_generation: generation,
            behind: generation > mirror.high_water,
            superseded: generation < mirror.high_water,
        });
    }
    let scope = serde_json::from_value(scope)
        .map_err(|error| format!("invalid Braid format scope: {error}"))?;
    let options = options
        .map(serde_json::from_value)
        .transpose()
        .map_err(|error| format!("invalid Braid format options: {error}"))?;
    let (books, usfm) = mirror.format_braid(scope, options)?;
    Ok(MirrorFormatBraidResultDto {
        books,
        usfm,
        ran_at_generation: generation,
        behind: false,
        superseded: false,
    })
}

#[tauri::command]
pub fn mirror_apply_braid_fix(
    state: tauri::State<'_, MirrorState>,
    generation: i64,
    book_code: String,
    fix: TokenFixDto,
) -> Result<MirrorApplyBraidFixResultDto, String> {
    let mut mirror = state
        .lock()
        .map_err(|_| "mirror lock poisoned".to_string())?;
    if generation != mirror.high_water {
        return Ok(MirrorApplyBraidFixResultDto {
            books: BTreeMap::new(),
            usfm: BTreeMap::new(),
            ran_at_generation: generation,
            behind: generation > mirror.high_water,
            superseded: generation < mirror.high_water,
        });
    }
    let (books, usfm) = mirror.apply_braid_fix(&book_code, &fix)?;
    Ok(MirrorApplyBraidFixResultDto {
        books,
        usfm,
        ran_at_generation: generation,
        behind: false,
        superseded: false,
    })
}

#[tauri::command]
pub fn mirror_publish_braid(
    state: tauri::State<'_, MirrorState>,
    generation: i64,
) -> Result<MirrorPublishBraidResultDto, String> {
    let mut mirror = state
        .lock()
        .map_err(|_| "mirror lock poisoned".to_string())?;
    if generation != mirror.high_water {
        return Ok(MirrorPublishBraidResultDto {
            packed_id: 0,
            snapshot_id: String::new(),
            books: Vec::new(),
            sources: Vec::new(),
            serialized_books: Vec::new(),
            ran_at_generation: generation,
            behind: generation > mirror.high_water,
            superseded: generation < mirror.high_water,
        });
    }
    let publication = mirror.publish_braid()?;
    Ok(MirrorPublishBraidResultDto {
        packed_id: publication.packed_id,
        snapshot_id: publication.snapshot_id,
        books: publication.books,
        sources: publication.sources,
        serialized_books: publication.serialized_books,
        ran_at_generation: generation,
        behind: false,
        superseded: false,
    })
}

/// Mirrors `DIRTY_BUFFER_SCHEMA_VERSION` in `DirtyBufferStore.ts`. Both hosts
/// write and accept the same wrapper, so the two must move together.
const DIRTY_BUFFER_SCHEMA_VERSION: u8 = 1;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DirtyBufferEnvelope<'a> {
    schema_version: u8,
    disk_baseline: &'a DiskBaselineDto,
    body_md5: String,
    written_at: u128,
    app_version: String,
    content: String,
}

fn dirty_buffer_path(root: &str, workspace_key: &str, book_code: &str) -> PathBuf {
    PathBuf::from(root)
        .join(workspace_key)
        .join(format!("{book_code}.json"))
}

/// Address one chapter run the way Braid names it.
///
/// Chapter 0 is the editor's address for front matter — everything before
/// `\c 1` — which Braid does not label with a number at all. Sending it as
/// `Number("0")` names a run that cannot exist, so the mutation fails with
/// `chapterNotFound`; this is the inverse of the mapping `braid_dirty_chapters`
/// already applies when it reports front matter as 0.
fn chapter_label(chapter_num: i64) -> braid::ChapterLabel {
    if chapter_num == 0 {
        braid::ChapterLabel::FrontMatter
    } else {
        braid::ChapterLabel::Number(chapter_num.to_string().into_boxed_str())
    }
}

fn dirty_buffer_workspace_dir(root: &str, workspace_key: &str) -> PathBuf {
    PathBuf::from(root).join(workspace_key)
}

/// The read side of the backup envelope — the owned counterpart to
/// [`DirtyBufferEnvelope`], which borrows because it only ever serializes.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredDirtyBuffer {
    schema_version: u8,
    disk_baseline: DiskBaselineDto,
    body_md5: String,
    content: String,
}

/// Why one backup could not be used. Mirrors the TS `ReadUnreadableReason`
/// string union verbatim — the app renders these in the recovery report, so
/// the two hosts must name the same failure the same way.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum DirtyBufferUnreadable {
    SchemaVersion,
    BodyMd5Mismatch,
    JsonParse,
    IoError,
}

impl DirtyBufferUnreadable {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::SchemaVersion => "schema-version",
            Self::BodyMd5Mismatch => "body-md5-mismatch",
            Self::JsonParse => "json-parse",
            Self::IoError => "io-error",
        }
    }
}

/// One backup, classified. Mirrors the TS `ReadResult` union.
///
/// `Unreadable` is a value, never an error: one bad backup must not abort a
/// reopen, and the path is carried so a tech can go find the file by hand.
#[derive(Debug)]
pub(crate) enum DirtyBufferRead {
    Missing,
    Valid {
        disk_baseline: DiskBaselineDto,
        content: String,
    },
    Unreadable {
        reason: DirtyBufferUnreadable,
        message: String,
    },
}

#[derive(Debug)]
pub(crate) struct DirtyBufferListItem {
    pub(crate) book_code: String,
    pub(crate) path: String,
    pub(crate) result: DirtyBufferRead,
}

/// Read and validate one backup file.
///
/// Validation order is deliberate and matches `DirtyBufferStore.readPath` on
/// the TS side step for step: a torn or malformed file is reported with the
/// most specific reason that can be proven, and the body-MD5 check runs last so
/// it only sees otherwise-well-formed JSON. The JSON is parsed to a `Value`
/// before being shaped, because "not JSON at all" and "JSON of the wrong shape
/// or version" are different answers to the user.
pub(crate) fn read_dirty_buffer(path: &PathBuf) -> DirtyBufferRead {
    let raw = match std::fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return DirtyBufferRead::Missing
        }
        Err(error) => {
            return DirtyBufferRead::Unreadable {
                reason: DirtyBufferUnreadable::IoError,
                message: error.to_string(),
            }
        }
    };

    let value: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(value) => value,
        Err(error) => {
            return DirtyBufferRead::Unreadable {
                reason: DirtyBufferUnreadable::JsonParse,
                message: error.to_string(),
            }
        }
    };

    let stored = match serde_json::from_value::<StoredDirtyBuffer>(value) {
        Ok(stored) if stored.schema_version == DIRTY_BUFFER_SCHEMA_VERSION => stored,
        _ => {
            return DirtyBufferRead::Unreadable {
                reason: DirtyBufferUnreadable::SchemaVersion,
                message: format!(
                    "Unsupported or malformed dirty-buffer wrapper (expected schemaVersion {DIRTY_BUFFER_SCHEMA_VERSION})"
                ),
            }
        }
    };

    if crate::md5::md5_hex(&stored.content) != stored.body_md5 {
        return DirtyBufferRead::Unreadable {
            reason: DirtyBufferUnreadable::BodyMd5Mismatch,
            message: "Backup body checksum did not match (possible torn write)".to_string(),
        };
    }

    DirtyBufferRead::Valid {
        disk_baseline: stored.disk_baseline,
        content: stored.content,
    }
}

/// Every backup for a workspace, each already classified.
///
/// A workspace with no backup directory yet is an empty list, not an error —
/// that is the ordinary clean-open case. Entries are returned in book-code
/// order so a recovery open is deterministic regardless of directory order.
pub(crate) fn list_dirty_buffers(root: &str, workspace_key: &str) -> Vec<DirtyBufferListItem> {
    let dir = dirty_buffer_workspace_dir(root, workspace_key);
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut items: Vec<DirtyBufferListItem> = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_file())
        .filter_map(|entry| {
            let path = entry.path();
            let book_code = path.file_stem()?.to_str()?.to_string();
            if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
                return None;
            }
            Some(DirtyBufferListItem {
                result: read_dirty_buffer(&path),
                path: path.to_string_lossy().into_owned(),
                book_code,
            })
        })
        .collect();
    items.sort_by(|left, right| left.book_code.cmp(&right.book_code));
    items
}

fn atomic_write_text(path: &PathBuf, content: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "dirty-buffer path has no parent".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("dirty-buffer directory creation failed: {error}"))?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("clock failed: {error}"))?
        .as_nanos();
    let temporary = path.with_extension(format!("json.tmp-{}-{nonce}", std::process::id()));
    std::fs::write(&temporary, content)
        .map_err(|error| format!("dirty-buffer write failed: {error}"))?;
    if let Err(error) = std::fs::rename(&temporary, path) {
        let _ = std::fs::remove_file(&temporary);
        return Err(format!("dirty-buffer atomic replace failed: {error}"));
    }
    Ok(())
}

#[tauri::command]
pub fn mirror_backup(
    state: tauri::State<'_, MirrorState>,
    book_code: String,
    app_version: Option<String>,
    generation: i64,
    dirty_buffer_root: String,
    workspace_key: String,
    clear: bool,
) -> Result<MirrorBackupResultDto, String> {
    let mut mirror = state
        .lock()
        .map_err(|_| "mirror lock poisoned".to_string())?;
    if generation > mirror.high_water {
        return Ok(MirrorBackupResultDto {
            book_code,
            cleared: false,
            ran_at_generation: generation,
            behind: true,
        });
    }
    let path = dirty_buffer_path(&dirty_buffer_root, &workspace_key, &book_code);
    // A book the editor knows about but Braid does not is a residency gap — an
    // atomic corpus mutation that was rejected, say. Leave any existing backup
    // ALONE rather than treating "no resident content" as "nothing to save":
    // clearing here would delete the user's unsaved work at exactly the moment
    // the resident state is the thing that is wrong. An explicit `clear` still
    // clears; that one is the caller's decision, not an inference.
    if !clear && !mirror.braid_has_book(&book_code) {
        eprintln!("[native:braid] no resident book; backup left as-is book={book_code}");
        return Ok(MirrorBackupResultDto {
            book_code,
            cleared: false,
            ran_at_generation: generation,
            behind: false,
        });
    }
    let is_dirty = if clear {
        false
    } else {
        mirror.braid_is_dirty(&book_code).unwrap_or(true)
    };
    if !is_dirty {
        match std::fs::remove_file(&path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("dirty-buffer clear failed: {error}")),
        }
        return Ok(MirrorBackupResultDto {
            book_code,
            cleared: true,
            ran_at_generation: generation,
            behind: false,
        });
    }
    let content = mirror.braid_usfm(&book_code)?;
    let baseline = mirror
        .books
        .get(&book_code)
        .map(|book| book.disk_baseline.clone())
        .ok_or_else(|| "book disappeared during backup".to_string())?;
    let envelope = DirtyBufferEnvelope {
        schema_version: DIRTY_BUFFER_SCHEMA_VERSION,
        disk_baseline: &baseline,
        body_md5: crate::md5::md5_hex(&content),
        written_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| format!("clock failed: {error}"))?
            .as_millis(),
        app_version: app_version.unwrap_or_default(),
        content,
    };
    let json = serde_json::to_string(&envelope)
        .map_err(|error| format!("dirty-buffer envelope encoding failed: {error}"))?;
    atomic_write_text(&path, &json)?;
    Ok(MirrorBackupResultDto {
        book_code,
        cleared: false,
        ran_at_generation: generation,
        behind: false,
    })
}

fn empty_lint_summary() -> MirrorLintSummaryDto {
    MirrorLintSummaryDto {
        by_category: BTreeMap::new(),
        by_severity: BTreeMap::new(),
        by_issue_type: BTreeMap::new(),
        total_count: 0,
        suppressed_count: 0,
    }
}

fn map_braid_lint_summary(
    summary: &usfm_onion::lint::LintSummary,
) -> Result<MirrorLintSummaryDto, String> {
    fn map_counts<T: serde::Serialize>(
        counts: &BTreeMap<T, usize>,
    ) -> Result<BTreeMap<String, usize>, String> {
        counts
            .iter()
            .map(|(key, count)| {
                let key = serde_json::to_value(key)
                    .map_err(|error| format!("Braid lint summary key encode failed: {error}"))?
                    .as_str()
                    .ok_or_else(|| "Braid lint summary key was not a string".to_string())?
                    .to_string();
                Ok((key, *count))
            })
            .collect()
    }

    Ok(MirrorLintSummaryDto {
        by_category: map_counts(&summary.by_category)?,
        by_severity: map_counts(&summary.by_severity)?,
        by_issue_type: map_counts(&summary.by_issue_type)?,
        total_count: summary.total_count,
        suppressed_count: summary.suppressed_count,
    })
}

#[tauri::command]
pub fn mirror_galley_analyze(
    state: tauri::State<'_, MirrorState>,
    generation: i64,
    config: Option<GalleyConfigDto>,
) -> Result<MirrorGalleyResultDto, String> {
    let mut mirror = state
        .lock()
        .map_err(|_| "mirror lock poisoned".to_string())?;
    if generation > mirror.high_water {
        return Ok(MirrorGalleyResultDto {
            packed_id: 0,
            keys: Vec::new(),
            cache_state: "fresh".to_string(),
            expected_identity: None,
            ran_at_generation: generation,
            behind: true,
        });
    }
    let mut galley = match mirror.galley.take() {
        Some(galley) => galley,
        None => {
            let projection = mirror.braid_projection(braid::CorpusScope::All)?;
            ResidentGalley::new(projection, config.as_ref())?
        }
    };
    galley.update_config(config.as_ref())?;
    let result = galley.analyze();
    mirror.galley = Some(galley);
    let result = result?;
    let packed_id = mirror.store_galley_packed(result.packed);
    Ok(MirrorGalleyResultDto {
        packed_id,
        keys: result.keys,
        cache_state: result.cache_state,
        expected_identity: result.expected_identity,
        ran_at_generation: generation,
        behind: false,
    })
}

#[tauri::command]
pub fn mirror_galley_load(
    state: tauri::State<'_, MirrorState>,
    generation: i64,
    config: Option<GalleyConfigDto>,
    cache_root: Option<String>,
    workspace_key: Option<String>,
) -> Result<MirrorGalleyResultDto, String> {
    let mut mirror = state
        .lock()
        .map_err(|_| "mirror lock poisoned".to_string())?;
    if generation > mirror.high_water {
        return Ok(MirrorGalleyResultDto {
            packed_id: 0,
            keys: Vec::new(),
            cache_state: "persisted".to_string(),
            expected_identity: None,
            ran_at_generation: generation,
            behind: true,
        });
    }
    let Some(cache_root) = cache_root else {
        return Ok(MirrorGalleyResultDto {
            packed_id: 0,
            keys: Vec::new(),
            cache_state: "persisted".to_string(),
            expected_identity: None,
            ran_at_generation: generation,
            behind: false,
        });
    };
    let Some(workspace_key) = workspace_key else {
        return Ok(MirrorGalleyResultDto {
            packed_id: 0,
            keys: Vec::new(),
            cache_state: "persisted".to_string(),
            expected_identity: None,
            ran_at_generation: generation,
            behind: false,
        });
    };
    let packed = mirror.galley_cache_prefetched.take().or_else(|| {
        let path = format!("{cache_root}/sous-chef-findings/{workspace_key}/corpus.bin");
        std::fs::read(path).ok()
    });
    let Some(packed) = packed else {
        return Ok(MirrorGalleyResultDto {
            packed_id: 0,
            keys: Vec::new(),
            cache_state: "persisted".to_string(),
            expected_identity: None,
            ran_at_generation: generation,
            behind: false,
        });
    };
    let galley = match mirror.galley.take() {
        Some(galley) => galley,
        None => {
            let projection = mirror.braid_projection(braid::CorpusScope::All)?;
            ResidentGalley::new(projection, config.as_ref())?
        }
    };
    let result = galley.load_cached(packed);
    mirror.galley = Some(galley);
    Ok(MirrorGalleyResultDto {
        packed_id: mirror.store_galley_packed(result.packed),
        keys: result.keys,
        cache_state: result.cache_state,
        expected_identity: result.expected_identity,
        ran_at_generation: generation,
        behind: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn push_chapter(
        mirror: &mut NativeMirrorState,
        book: &str,
        chapter: i64,
        source: &str,
        generation: i64,
    ) {
        let book_tokens = test_book_tokens(book, chapter, source);
        let chapter_tokens = test_chapter_tokens(chapter, source);
        if mirror.braid.is_none() {
            mirror
                .apply_patch(MirrorPatchDto::FullSync {
                    books: vec![FullSyncBookDto {
                        book_code: book.to_string(),
                        disk_baseline: DiskBaselineDto::Absent,
                        baseline_tokens: vec![],
                        chapters: vec![FullSyncChapterDto {
                            chapter_num: chapter,
                            chapter: MirrorChapterDto {
                                tokens: book_tokens,
                                eol: "\n".to_string(),
                                dirty: true,
                            },
                        }],
                    }],
                    generation: generation - 1,
                })
                .expect("seed Braid before chapter mutation");
        }
        mirror
            .apply_patch(MirrorPatchDto::PushChapter {
                ref_: ChapterRefForPatch {
                    book_code: book.to_string(),
                    chapter_num: chapter,
                },
                chapter: MirrorChapterDto {
                    tokens: chapter_tokens,
                    eol: "\n".to_string(),
                    dirty: true,
                },
                generation,
            })
            .expect("apply chapter mutation");
    }

    fn test_book_tokens(book: &str, chapter: i64, text: &str) -> Vec<MirrorTokenDto> {
        let source = format!("\\id {book}\n\\c {chapter}\n\\p\n\\v 1 {text}\n");
        parse_test_tokens(&source, &format!("{book}-book"))
    }

    fn test_chapter_tokens(chapter: i64, text: &str) -> Vec<MirrorTokenDto> {
        let source = format!("\\c {chapter}\n\\p\n\\v 1 {text}\n");
        parse_test_tokens(&source, &format!("chapter-{chapter}"))
    }

    fn parse_test_tokens(source: &str, id_prefix: &str) -> Vec<MirrorTokenDto> {
        let parsed = usfm_onion::parse::parse(&source);
        parsed
            .tokens
            .iter()
            .enumerate()
            .map(|(index, token)| {
                let owned = usfm_onion::token::OwnedToken::from_parsed(token);
                let mut wire = MirrorTokenDto::from(&owned);
                wire.id = format!("{id_prefix}-{index}");
                wire
            })
            .collect()
    }

    #[test]
    fn push_chapter_is_idempotent_by_generation() {
        let mut mirror = NativeMirrorState::default();
        push_chapter(&mut mirror, "GEN", 1, "new", 5);
        // An older-generation patch for the same chapter is a no-op.
        push_chapter(&mut mirror, "GEN", 1, "stale", 2);
        assert_eq!(mirror.books["GEN"].chapters.len(), 1);
        assert_eq!(mirror.high_water, 5);
    }

    #[test]
    fn book_tokens_preserve_editor_order() {
        let mut mirror = NativeMirrorState::default();
        mirror
            .apply_patch(MirrorPatchDto::FullSync {
                books: vec![FullSyncBookDto {
                    book_code: "GEN".to_string(),
                    disk_baseline: DiskBaselineDto::Absent,
                    baseline_tokens: vec![],
                    chapters: vec![
                        FullSyncChapterDto {
                            chapter_num: 2,
                            chapter: MirrorChapterDto {
                                tokens: test_chapter_tokens(2, "two"),
                                eol: "\n".to_string(),
                                dirty: true,
                            },
                        },
                        FullSyncChapterDto {
                            chapter_num: 1,
                            chapter: MirrorChapterDto {
                                tokens: test_chapter_tokens(1, "one"),
                                eol: "\n".to_string(),
                                dirty: true,
                            },
                        },
                    ],
                }],
                generation: 0,
            })
            .expect("seed ordered book");
        assert_eq!(
            mirror.books["GEN"]
                .chapters
                .iter()
                .map(|(chapter, _)| *chapter)
                .collect::<Vec<_>>(),
            vec![2, 1]
        );
    }

    #[test]
    fn delete_chapter_removes_empty_book() {
        let mut mirror = NativeMirrorState::default();
        push_chapter(&mut mirror, "GEN", 1, "one", 1);
        mirror
            .apply_patch(MirrorPatchDto::DeleteChapter {
                ref_: ChapterRefForPatch {
                    book_code: "GEN".to_string(),
                    chapter_num: 1,
                },
                generation: 2,
            })
            .expect("delete chapter");
        assert!(mirror.books.is_empty());
    }

    #[test]
    fn full_sync_replaces_all_books() {
        let mut mirror = NativeMirrorState::default();
        push_chapter(&mut mirror, "GEN", 1, "old", 1);
        mirror
            .apply_patch(MirrorPatchDto::FullSync {
                books: vec![FullSyncBookDto {
                    book_code: "EXO".to_string(),
                    disk_baseline: DiskBaselineDto::Absent,
                    baseline_tokens: vec![],
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
            })
            .expect("full sync");
        assert!(!mirror.books.contains_key("GEN"));
        assert!(mirror.books.contains_key("EXO"));
    }

    // --- Ordering: Tauri invokes are unordered, so an older patch can arrive
    // after a newer one. Structural patches replace whole books or the whole
    // corpus, so applying a stale one unconditionally would discard newer
    // resident content outright.

    #[test]
    fn stale_full_sync_does_not_replace_newer_resident_content() {
        let mut mirror = NativeMirrorState::default();
        push_chapter(&mut mirror, "GEN", 1, "current", 5);
        mirror
            .apply_patch(MirrorPatchDto::FullSync {
                books: vec![FullSyncBookDto {
                    book_code: "EXO".to_string(),
                    disk_baseline: DiskBaselineDto::Absent,
                    baseline_tokens: vec![],
                    chapters: vec![FullSyncChapterDto {
                        chapter_num: 1,
                        chapter: MirrorChapterDto {
                            tokens: vec![],
                            eol: "\n".to_string(),
                            dirty: false,
                        },
                    }],
                }],
                generation: 2,
            })
            .expect("stale full sync is dropped, not an error");
        assert!(mirror.books.contains_key("GEN"));
        assert!(!mirror.books.contains_key("EXO"));
    }

    #[test]
    fn stale_update_book_does_not_replace_a_newer_book() {
        let mut mirror = NativeMirrorState::default();
        push_chapter(&mut mirror, "GEN", 1, "one", 1);
        push_chapter(&mut mirror, "GEN", 1, "edited", 6);
        mirror
            .apply_patch(MirrorPatchDto::UpdateBook {
                book: FullSyncBookDto {
                    book_code: "GEN".to_string(),
                    disk_baseline: DiskBaselineDto::Absent,
                    baseline_tokens: vec![],
                    chapters: vec![FullSyncChapterDto {
                        chapter_num: 1,
                        chapter: MirrorChapterDto {
                            tokens: test_book_tokens("GEN", 1, "one"),
                            eol: "\n".to_string(),
                            dirty: false,
                        },
                    }],
                },
                generation: 3,
            })
            .expect("stale book update is dropped, not an error");
        // The generation-3 book never saw the generation-6 edit, so applying it
        // would silently roll the chapter back.
        assert_eq!(mirror.books["GEN"].chapters[0].1.generation, 6);
        assert!(mirror
            .braid_usfm("GEN")
            .expect("resident usfm")
            .contains("edited"));
    }

    #[test]
    fn stale_remove_book_does_not_delete_a_newer_book() {
        let mut mirror = NativeMirrorState::default();
        push_chapter(&mut mirror, "GEN", 1, "recreated", 9);
        mirror
            .apply_patch(MirrorPatchDto::RemoveBook {
                book_code: "GEN".to_string(),
                generation: 4,
            })
            .expect("stale removal is dropped, not an error");
        assert!(mirror.books.contains_key("GEN"));
    }

    #[test]
    fn a_book_patch_is_not_stale_merely_because_another_book_is_newer() {
        let mut mirror = NativeMirrorState::default();
        push_chapter(&mut mirror, "MRK", 1, "newer", 8);
        mirror
            .apply_patch(MirrorPatchDto::UpdateBook {
                book: FullSyncBookDto {
                    book_code: "GEN".to_string(),
                    disk_baseline: DiskBaselineDto::Absent,
                    baseline_tokens: vec![],
                    chapters: vec![FullSyncChapterDto {
                        chapter_num: 1,
                        chapter: MirrorChapterDto {
                            tokens: test_book_tokens("GEN", 1, "kept"),
                            eol: "\n".to_string(),
                            dirty: false,
                        },
                    }],
                },
                generation: 3,
            })
            .expect("book update");
        // Corpus-wide staleness would have dropped this and lost GEN's edit:
        // MRK's newer generation says nothing about GEN.
        assert!(mirror.books.contains_key("GEN"));
    }

    // --- The load's byte contract -------------------------------------------

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("sefer-mirror-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    /// A source whose Braid round trip is NOT byte-identical: the `\p` sits on
    /// the same line as `\c`, which serialization would normalize. Hashing or
    /// caching the round trip instead of the file would silently disagree with
    /// disk, so this is the fixture that distinguishes the two.
    const UNNORMALIZED_SOURCE: &str = "\\id GEN\n\\c 1 \\p\n\\v 1 In the beginning\n";

    #[test]
    fn cold_load_binds_hashes_and_sources_to_the_exact_disk_bytes() {
        let dir = temp_dir("cold-load");
        let book_path = dir.join("GEN.usfm");
        std::fs::write(&book_path, UNNORMALIZED_SOURCE).expect("write book");

        let mut mirror = NativeMirrorState::default();
        let result = mirror
            .load_project(
                dir.join("cache").to_str().expect("cache root"),
                "workspace",
                dir.join("backups").to_str().expect("backup root"),
                &[MirrorLoadProjectBookDto {
                    book_code: "GEN".to_string(),
                    source_key: "GEN".to_string(),
                    path: book_path.to_string_lossy().to_string(),
                }],
                None,
                true,
            )
            .expect("cold load");

        assert_eq!(result.state, "cold");
        let book = &result.books[0];
        // The md5 crash recovery compares against must be the file's own bytes.
        assert_eq!(book.source_md5, crate::md5::md5_hex(UNNORMALIZED_SOURCE));
        assert_eq!(book.byte_length, UNNORMALIZED_SOURCE.len());
        let sources = mirror
            .braid_packed
            .get(&result.sources_id)
            .expect("sources blob");
        assert_eq!(
            &sources[book.byte_offset..book.byte_offset + book.byte_length],
            UNNORMALIZED_SOURCE.as_bytes()
        );
        // And the seed kept those bytes verbatim rather than a normalized
        // re-serialization of them.
        assert_eq!(
            mirror.braid_usfm("GEN").expect("resident usfm"),
            UNNORMALIZED_SOURCE
        );
        assert!(!mirror.braid_is_dirty("GEN").expect("dirty check"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_rejected_sidecar_is_replaced_and_the_next_open_is_warm() {
        let dir = temp_dir("sidecar-heal");
        let book_path = dir.join("GEN.usfm");
        std::fs::write(&book_path, UNNORMALIZED_SOURCE).expect("write book");
        let cache_root = dir.join("cache");
        let backup_root = dir.join("backups");
        let sidecar = cache_root
            .join("braid")
            .join("workspace")
            .join("corpus.bin");
        std::fs::create_dir_all(sidecar.parent().expect("cache dir")).expect("cache dir");
        std::fs::write(&sidecar, b"not a packed corpus").expect("corrupt sidecar");

        let books = [MirrorLoadProjectBookDto {
            book_code: "GEN".to_string(),
            source_key: "GEN".to_string(),
            path: book_path.to_string_lossy().to_string(),
        }];
        let load = |mirror: &mut NativeMirrorState| {
            mirror
                .load_project(
                    cache_root.to_str().expect("cache root"),
                    "workspace",
                    backup_root.to_str().expect("backup root"),
                    &books,
                    None,
                    true,
                )
                .expect("load")
        };

        let first = load(&mut NativeMirrorState::default());
        assert_eq!(first.state, "cold");
        // The sidecar write is best-effort and happens off-thread; wait for the
        // corrupt bytes to be replaced rather than assuming a duration.
        for _ in 0..200 {
            if std::fs::read(&sidecar).expect("sidecar") != b"not a packed corpus" {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }

        // Existence never healed a bad entry before this: the second open would
        // have read the same corrupt file and gone cold again, forever.
        let second = load(&mut NativeMirrorState::default());
        assert_eq!(second.state, "warm");
        let _ = std::fs::remove_dir_all(&dir);
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
    }

    const PROTOCOL_FIXTURE_JSON: &str = include_str!("../tests/fixtures/mirror-protocol.json");

    #[test]
    fn fixture_patches_deserialize() {
        let fixtures: ProtocolFixtures =
            serde_json::from_str(PROTOCOL_FIXTURE_JSON).expect("fixture must deserialize");
        // One per MirrorPatch kind.
        assert_eq!(fixtures.patches.len(), 8);
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
        // Onion's wire token deliberately permits forward-compatible fields.
        // Guard that leniency (no `deny_unknown_fields` here, or valid messages
        // would be rejected).
        let json = r#"{"id":"x","kind":"text","source":"hi","payload":"numberRange","paragraphCategory":"poetry"}"#;
        let token: MirrorTokenDto = serde_json::from_str(json).expect("subset token must parse");
        assert_eq!(token.source, "hi");
    }

    #[test]
    fn exact_envelope_rejects_unknown_field() {
        // The flip side of the subset rule: an EXACT envelope struct must reject
        // an unknown field so a TS-side drift surfaces loudly here.
        let json = r#"{"bookCode":"GEN","chapterNum":1,"surprise":true}"#;
        assert!(serde_json::from_str::<ChapterRefForPatch>(json).is_err());
    }

    // --- Reading backups natively -------------------------------------------
    //
    // The desktop host has always WRITTEN dirty buffers and never read them:
    // recovery ran on main. These cover the read side against the same
    // classification `DirtyBufferStore.readPath` performs, because the two
    // hosts have to answer a reopen identically — a backup the web host would
    // restore must not read as unreadable on desktop, and the reasons are
    // rendered to the user by name.

    fn write_backup(root: &PathBuf, workspace: &str, book: &str, body: &str) {
        let path = dirty_buffer_path(&root.to_string_lossy(), workspace, book);
        std::fs::create_dir_all(path.parent().expect("parent")).expect("backup dir");
        std::fs::write(&path, body).expect("write backup");
    }

    fn valid_envelope(content: &str) -> String {
        format!(
            r#"{{"schemaVersion":1,"diskBaseline":{{"kind":"present","md5":"abc"}},"bodyMd5":"{}","writtenAt":1,"appVersion":"test","content":{}}}"#,
            crate::md5::md5_hex(content),
            serde_json::to_string(content).expect("json string")
        )
    }

    #[test]
    fn a_well_formed_backup_reads_as_valid_with_its_recorded_disk_baseline() {
        let dir = temp_dir("backup-valid");
        let root = dir.to_string_lossy().into_owned();
        write_backup(&dir, "ws", "GEN", &valid_envelope(UNNORMALIZED_SOURCE));

        match read_dirty_buffer(&dirty_buffer_path(&root, "ws", "GEN")) {
            DirtyBufferRead::Valid {
                disk_baseline,
                content,
            } => {
                assert_eq!(content, UNNORMALIZED_SOURCE);
                match disk_baseline {
                    DiskBaselineDto::Present { md5 } => assert_eq!(md5, "abc"),
                    other => panic!("expected a present baseline, got {other:?}"),
                }
            }
            other => panic!("expected valid, got {other:?}"),
        }
    }

    #[test]
    fn an_absent_backup_is_missing_rather_than_an_error() {
        let dir = temp_dir("backup-missing");
        let root = dir.to_string_lossy().into_owned();
        assert!(matches!(
            read_dirty_buffer(&dirty_buffer_path(&root, "ws", "GEN")),
            DirtyBufferRead::Missing
        ));
    }

    /// The validation ORDER is the contract here, not just the outcomes: each
    /// malformed file must report the most specific reason provable about it,
    /// so "this is not JSON" never surfaces as a checksum failure and a
    /// well-formed file at the wrong version never surfaces as a parse error.
    #[test]
    fn each_malformed_backup_reports_its_own_most_specific_reason() {
        let dir = temp_dir("backup-malformed");
        let root = dir.to_string_lossy().into_owned();

        let cases: Vec<(&str, String, DirtyBufferUnreadable)> = vec![
            (
                "NOTJSON",
                "{not json at all".to_string(),
                DirtyBufferUnreadable::JsonParse,
            ),
            (
                "OLDVER",
                r#"{"schemaVersion":99,"diskBaseline":{"kind":"absent"},"bodyMd5":"x","writtenAt":1,"appVersion":"t","content":"hi"}"#.to_string(),
                DirtyBufferUnreadable::SchemaVersion,
            ),
            (
                "NOBASE",
                // Checksum-valid but the baseline union is garbage — the app
                // dereferences `diskBaseline.kind`, so this must not pass.
                r#"{"schemaVersion":1,"diskBaseline":null,"bodyMd5":"x","writtenAt":1,"appVersion":"t","content":"hi"}"#.to_string(),
                DirtyBufferUnreadable::SchemaVersion,
            ),
            (
                "TORN",
                r#"{"schemaVersion":1,"diskBaseline":{"kind":"absent"},"bodyMd5":"deadbeef","writtenAt":1,"appVersion":"t","content":"hi"}"#.to_string(),
                DirtyBufferUnreadable::BodyMd5Mismatch,
            ),
        ];

        for (book, body, expected) in cases {
            write_backup(&dir, "ws", book, &body);
            match read_dirty_buffer(&dirty_buffer_path(&root, "ws", book)) {
                DirtyBufferRead::Unreadable { reason, .. } => {
                    assert_eq!(reason, expected, "{book} reported the wrong reason");
                }
                other => panic!("{book} expected unreadable, got {other:?}"),
            }
        }
    }

    #[test]
    fn listing_a_workspace_yields_every_backup_in_book_order_and_skips_non_json() {
        let dir = temp_dir("backup-list");
        let root = dir.to_string_lossy().into_owned();
        write_backup(&dir, "ws", "MRK", &valid_envelope("\\id MRK\n"));
        write_backup(&dir, "ws", "GEN", &valid_envelope("\\id GEN\n"));
        std::fs::write(
            dirty_buffer_workspace_dir(&root, "ws").join("GEN.json.tmp-1-2"),
            "half a write",
        )
        .expect("write temp");

        let listed = list_dirty_buffers(&root, "ws");
        assert_eq!(
            listed
                .iter()
                .map(|item| item.book_code.as_str())
                .collect::<Vec<_>>(),
            vec!["GEN", "MRK"],
            "an in-flight atomic-write temp file is not a backup"
        );
        assert!(listed
            .iter()
            .all(|item| matches!(item.result, DirtyBufferRead::Valid { .. })));
    }

    /// The bound-source contract, which is the whole reason the sources blob is
    /// rebuilt after layering.
    ///
    /// A packed container is bound to the exact bytes it was built from, and
    /// main certifies it by length + content hash per book. Layering a backup
    /// rebinds that book, so returning disk bytes here would refuse the entire
    /// load — a recovery open would fail to open at all. Disk still has to
    /// reach main, which is what `disk_source_by_book` carries.
    #[test]
    fn a_recovery_open_returns_the_bytes_the_container_is_bound_to() {
        let dir = temp_dir("recovery-open");
        let book_path = dir.join("GEN.usfm");
        std::fs::write(&book_path, UNNORMALIZED_SOURCE).expect("write book");
        let backup_root = dir.join("backups");
        let backup = "\\id GEN\n\\c 1 \\p\n\\v 1 In the beginning, edited\n";
        write_backup(&backup_root, "workspace", "GEN", &valid_envelope(backup));

        let mut mirror = NativeMirrorState::default();
        let result = mirror
            .load_project(
                dir.join("cache").to_str().expect("cache root"),
                "workspace",
                backup_root.to_str().expect("backup root"),
                &[MirrorLoadProjectBookDto {
                    book_code: "GEN".to_string(),
                    source_key: "GEN".to_string(),
                    path: book_path.to_string_lossy().to_string(),
                }],
                None,
                true,
            )
            .expect("load");

        assert_eq!(
            result.recovery.restored_book_codes,
            vec!["GEN".to_string()],
            "entries={:?}",
            result.recovery.entries
        );
        let book = &result.books[0];
        assert_eq!(
            book.dirty_chapters,
            Some(vec![1]),
            "the edited chapter is what Braid reports dirty"
        );

        // The blob main will certify against holds the BACKUP, not disk.
        let blob = mirror
            .braid_packed
            .get(&result.sources_id)
            .expect("sources blob");
        let bound = &blob[book.byte_offset..book.byte_offset + book.byte_length];
        assert_eq!(std::str::from_utf8(bound).expect("utf8"), backup);

        // Disk still reaches main, separately — it is the recovered book's
        // baseline, and without it every dirty/revert reader on main is wrong.
        assert_eq!(
            result
                .recovery
                .disk_source_by_book
                .get("GEN")
                .map(String::as_str),
            Some(UNNORMALIZED_SOURCE)
        );

        // And the sidecar was NOT written: `corpus.bin` means "this is disk".
        assert!(
            !dir.join("cache")
                .join("braid")
                .join("workspace")
                .join("corpus.bin")
                .exists(),
            "a recovery open must never label unsaved work as the saved corpus"
        );
    }

    /// Braid's findings must reach the frontend in the shape the frontend
    /// reads: camelCase keys, canonical string values.
    ///
    /// Nothing in the type system enforces that. `LintIssue` in the crate
    /// derives `Serialize` with no `rename_all`, so it emits snake_case, and
    /// `code` serializes as its enum variant rather than the canonical code
    /// string. A serde round-trip from one to the other therefore compiles
    /// and fails at runtime — and only on desktop, because the web arm
    /// consumes the wasm DTO, which is already camelCase. This test is the
    /// only thing standing between that drift and a shipped build.
    #[test]
    fn braid_findings_reach_the_frontend_in_its_own_shape() {
        let dir = temp_dir("lint-dto");
        let book_path = dir.join("GEN.usfm");
        std::fs::write(
            &book_path,
            "\\id GEN\n\\c 1 \\p\n\\v 1 First\n\\v 1 Duplicated\n",
        )
        .expect("write book");

        let mut mirror = NativeMirrorState::default();
        mirror
            .load_project(
                dir.join("cache").to_str().expect("cache root"),
                "workspace",
                dir.join("backups").to_str().expect("backup root"),
                &[MirrorLoadProjectBookDto {
                    book_code: "GEN".to_string(),
                    source_key: "GEN".to_string(),
                    path: book_path.to_string_lossy().to_string(),
                }],
                None,
                true,
            )
            .expect("load");

        let snapshot = mirror.ensure_braid().expect("braid").lint();
        let findings = snapshot
            .books
            .iter()
            .flat_map(|book| book.result.issues.iter())
            .map(crate::usfm_onion::map_lint_issue)
            .collect::<Vec<_>>();
        assert!(
            !findings.is_empty(),
            "the duplicated verse must produce a finding for this test to mean anything"
        );

        let wire = serde_json::to_value(&findings[0]).expect("encode finding");
        let fields = wire.as_object().expect("finding encodes as an object");
        assert!(
            fields.contains_key("issueType") && !fields.contains_key("issue_type"),
            "camelCase on the wire, got {fields:?}"
        );
        assert!(
            ["usfm", "content"].contains(&fields["issueType"].as_str().expect("string")),
            "issueType is the canonical lowercase value, not an enum variant: {:?}",
            fields["issueType"]
        );
        let code = fields["code"].as_str().expect("code is a string");
        assert!(
            code.chars().next().is_some_and(char::is_lowercase),
            "code is the canonical code string, not a PascalCase variant: {code}"
        );
        assert!(
            snapshot
                .books
                .iter()
                .all(|book| map_braid_lint_summary(&book.result.summary).is_ok()),
            "summary keys encode as strings"
        );
    }

    #[test]
    fn a_workspace_with_no_backup_directory_lists_empty() {
        let dir = temp_dir("backup-none");
        assert!(list_dirty_buffers(&dir.to_string_lossy(), "never-opened").is_empty());
    }
}
