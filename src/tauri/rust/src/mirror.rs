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

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::sous::{GalleyConfigDto, Projection, ResidentGalley, SegmentDto, Utf16SpanDto};
use crate::usfm_onion::{LintIssueDto, TokenFixDto};
use braid::{LintConfigFingerprint, LintEngineStamp};
use usfm_onion::lint::{LintOptions as BraidLintOptions, LintScope as BraidLintScope};
use usfm_onion_wire::corpus_codec::{
    encode_corpus, CorpusSection, CorpusSectionInput, CorpusSectionTokens, EncodedCorpus,
    LintStamps, PublishedBook,
};
use usfm_onion_wire::dto::{owned_token_from_dto, Token as WireToken};

// --- Token DTO (owned by Onion's wire crate) -------------------------------

type MirrorTokenDto = WireToken;

/// The resident Braid API owns its minter as a non-`Send` callback even though
/// this host serializes every access behind `MirrorState`'s mutex. The callback
/// below is non-capturing; this wrapper makes that host invariant explicit at
/// the Tauri state boundary until upstream can expose a `Send` minter bound.
struct BraidResident(braid::Braid);

unsafe impl Send for BraidResident {}
unsafe impl Sync for BraidResident {}

struct NativeCachedBraidBook {
    source_hash: u64,
    token_identity: u64,
    stamps: LintStamps,
    published: PublishedBook,
}

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
pub struct WorkspaceTokenMirror {
    books: BTreeMap<String, ResidentBook>,
    // BTreeMap keeps lookup deterministic, while this order preserves the
    // editor/document order that Galley uses for corpus keys.
    book_order: Vec<String>,
    galley: Option<ResidentGalley>,
    braid: Option<BraidResident>,
    galley_packed: BTreeMap<u64, Vec<u8>>,
    next_galley_pack_id: u64,
    braid_packed: BTreeMap<u64, Vec<u8>>,
    next_braid_pack_id: u64,
    braid_publication_cache: Vec<NativeCachedBraidBook>,
    // High-water mark across all applied patches — a command requesting a
    // generation strictly greater than this is "behind" (the mirror hasn't seen
    // the patch yet on this unordered transport).
    high_water: i64,
}

impl WorkspaceTokenMirror {
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

    fn apply_patch(&mut self, patch: MirrorPatchDto) -> Result<(), String> {
        match patch {
            MirrorPatchDto::FullSync { books, generation } => {
                self.replace_braid_corpus(&books)?;
                self.books.clear();
                self.book_order.clear();
                self.galley = None;
                self.galley_packed.clear();
                self.braid_packed.clear();
                self.braid_publication_cache.clear();
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
            MirrorPatchDto::SyncMeta { books, generation } => {
                for meta in books {
                    let book_code = meta.book_code.clone();
                    {
                        let Some(book) = self.books.get_mut(&book_code) else {
                            continue;
                        };
                        if book.baseline_generation <= generation {
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
                    self.set_braid_baseline(&book_code, meta.baseline_tokens)?;
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
                            braid::ChapterLabel::Number(
                                ref_.chapter_num.to_string().into_boxed_str(),
                            ),
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
            .map(|resident| &mut resident.0)
            .ok_or_else(|| "Braid resident must be seeded by fullSync".to_string())
    }

    fn publish_braid(&mut self) -> Result<NativeBraidPublication, String> {
        let previous_cache = std::mem::take(&mut self.braid_publication_cache);
        let braid = self.ensure_braid()?;
        let stamps = LintStamps {
            config_fingerprint: LintConfigFingerprint::of(&braid.config().lint).0,
            engine_stamp: LintEngineStamp::current().0,
        };
        let (encoded_bytes, snapshot_id, book_metadata, next_cache) = {
            let snapshot = braid.lint();
            let mut encoded_flags = BTreeMap::new();
            let sections = snapshot
                .books
                .iter()
                .map(|book| {
                    if let Some(cached) = previous_cache.iter().find(|cached| {
                        cached.published.book == book.book
                            && cached.source_hash == book.source_hash.0
                            && cached.token_identity == book.token_identity.0
                            && cached.stamps == stamps
                    }) {
                        encoded_flags.insert(book.book.to_string(), false);
                        CorpusSection::Cached(cached.published.as_cached())
                    } else {
                        encoded_flags.insert(book.book.to_string(), true);
                        CorpusSection::Fresh(CorpusSectionInput {
                            book: book.book,
                            tokens: CorpusSectionTokens::Owned {
                                tokens: book.tokens,
                            },
                            findings: Some(book.result),
                        })
                    }
                })
                .collect::<Vec<_>>();
            let EncodedCorpus {
                bytes,
                books: published_books,
                ..
            } = encode_corpus(snapshot.id.0, Some(stamps), &sections)
                .map_err(|error| format!("Braid publication failed: {error:?}"))?;
            let metadata = snapshot
                .books
                .iter()
                .map(|book| {
                    (
                        book.book.to_string(),
                        format!("{:016x}", book.source_hash.0),
                        *encoded_flags.get(&book.book.to_string()).unwrap_or(&true),
                    )
                })
                .collect::<Vec<_>>();
            let next_cache = snapshot
                .books
                .iter()
                .zip(published_books)
                .map(|(book, published)| NativeCachedBraidBook {
                    source_hash: book.source_hash.0,
                    token_identity: book.token_identity.0,
                    stamps,
                    published,
                })
                .collect::<Vec<_>>();
            (
                bytes,
                format!("{:016x}", snapshot.id.0),
                metadata,
                next_cache,
            )
        };
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
        let source_by_book = serialized_books
            .iter()
            .map(|book| (book.book_code.clone(), book.contents.clone()))
            .collect::<BTreeMap<_, _>>();
        let books = book_metadata
            .into_iter()
            .map(
                |(book_code, source_hash, encoded)| MirrorPublishedBraidBookDto {
                    book_code: book_code.clone(),
                    source_hash,
                    encoded,
                    source: source_by_book.get(&book_code).cloned(),
                },
            )
            .collect::<Vec<_>>();
        let sources = serialized_books
            .iter()
            .map(|book| MirrorPublishedBraidSourceDto {
                book_code: book.book_code.clone(),
                source_key: book.book_code.clone(),
                source: book.contents.clone(),
            })
            .collect::<Vec<_>>();
        let packed_id = self.next_braid_pack_id;
        self.next_braid_pack_id = self.next_braid_pack_id.saturating_add(1);
        self.braid_publication_cache = next_cache;
        self.braid_packed.insert(packed_id, encoded_bytes);
        Ok(NativeBraidPublication {
            packed_id,
            snapshot_id,
            books,
            sources,
            serialized_books,
        })
    }

    fn restore_braid(
        &mut self,
        packed: &[u8],
        records: &[MirrorRestoreBraidRecordDto],
    ) -> Result<(), String> {
        let sources = records
            .iter()
            .map(|record| {
                let book = usfm_onion::token::BookId::from_str(&record.book_code)
                    .ok_or_else(|| format!("invalid Braid book id: {}", record.book_code))?;
                Ok((book, record.source.as_str()))
            })
            .collect::<Result<Vec<_>, String>>()?;
        let verified = usfm_onion_wire::corpus_codec::verify_corpus(packed, &sources)
            .map_err(|error| format!("Braid warm cache verification failed: {error:?}"))?;
        let materialized = verified
            .materialize_owned_tokens(packed, &sources)
            .map_err(|error| format!("Braid warm cache materialization failed: {error:?}"))?;
        let summary_unknowable = self.ensure_braid()?.config().lint.suppressed.len() > 0;
        let stamps = verified.lint_stamps.unwrap_or(LintStamps {
            config_fingerprint: 0,
            engine_stamp: 0,
        });
        let mut books = Vec::with_capacity(verified.books.len());
        for verified_book in verified.books {
            let book = usfm_onion::token::BookId::from_str(&verified_book.receipt.book)
                .ok_or_else(|| format!("invalid Braid book id: {}", verified_book.receipt.book))?;
            let record = records
                .iter()
                .find(|record| record.book_code == verified_book.receipt.book)
                .ok_or_else(|| format!("missing Braid source: {}", verified_book.receipt.book))?;
            let source_key = braid::SourceKey::new(record.source_key.clone())
                .ok_or_else(|| format!("invalid Braid source key: {}", record.source_key))?;
            let (_, tokens) = materialized
                .iter()
                .find(|(candidate, _)| *candidate == book)
                .ok_or_else(|| format!("missing materialized Braid book: {book}"))?;
            let lint = (!summary_unknowable)
                .then_some(())
                .and(verified_book.lint_stamps)
                .map(|_| braid::BookLintPrime {
                    book,
                    source_hash: braid::SourceHash(
                        u64::from_str_radix(&verified_book.receipt.source_hash, 16)
                            .unwrap_or_default(),
                    ),
                    result: usfm_onion::lint::LintResult {
                        summary: summarize_braid_findings(&verified_book.findings),
                        issues: verified_book.findings,
                    },
                });
            books.push(braid::BookRestoreInput {
                source_key,
                book,
                source: record.source.clone(),
                tokens: tokens.clone(),
                line_ending: usfm_onion::token::LineEnding::detect(&record.source),
                lint,
            });
        }
        let baselines = books
            .iter()
            .map(|book| {
                (
                    book.source_key.clone(),
                    book.book,
                    book.tokens.clone(),
                    book.line_ending,
                )
            })
            .collect::<Vec<_>>();
        self.ensure_braid()?
            .restore_corpus(braid::CorpusRestoreInput::new(
                braid::LintConfigFingerprint(stamps.config_fingerprint),
                braid::LintEngineStamp(stamps.engine_stamp),
                books,
            ))
            .map_err(|error| format!("Braid warm restore failed: {error:?}"))?;
        let braid = self.ensure_braid()?;
        for (source_key, book, tokens, line_ending) in baselines {
            braid
                .set_baseline(braid::BookInput::Tokens(braid::BookTokensInput {
                    source_key,
                    book,
                    tokens,
                    line_ending,
                }))
                .map_err(|error| format!("Braid warm baseline restore failed: {error:?}"))?;
        }
        Ok(())
    }

    fn replace_braid_corpus(&mut self, books: &[FullSyncBookDto]) -> Result<(), String> {
        let mut braid = braid::Braid::new(
            braid::BraidConfig::new(BraidLintOptions::scoped(BraidLintScope::Book)),
            || "sefer-braid-generated-token".to_string(),
        );
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
        self.braid = Some(BraidResident(braid));
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
        let segments = entries
            .into_iter()
            .map(|entry| {
                let segments = entry
                    .projection
                    .segments
                    .into_iter()
                    .map(|segment| SegmentDto {
                        token_id: segment.token_id,
                        text_span: Utf16SpanDto {
                            start: segment.text_span.start as usize,
                            end: segment.text_span.end as usize,
                        },
                    })
                    .collect();
                (entry.sid, segments)
            })
            .collect();
        Ok(Projection {
            keys,
            texts,
            segments,
        })
    }

    fn braid_input(
        &self,
        book_code: &str,
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
        let source_key = braid::SourceKey::new(book_code.to_string())
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
        let Some(BraidResident(mut braid)) = self.braid.take() else {
            return Err("Braid resident must be seeded by fullSync".to_string());
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
        self.braid = if result.is_ok() {
            Some(BraidResident(braid))
        } else {
            None
        };
        result
    }

    fn update_braid_chapter(
        &mut self,
        book_code: &str,
        chapter_num: i64,
        chapter_tokens: Vec<MirrorTokenDto>,
    ) -> Result<(), String> {
        let Some(BraidResident(mut braid)) = self.braid.take() else {
            return Err("Braid resident must be seeded by fullSync".to_string());
        };
        let result = (|| {
            let book = usfm_onion::token::BookId::from_str(book_code)
                .ok_or_else(|| format!("invalid Braid book id: {book_code}"))?;
            let tokens = chapter_tokens
                .into_iter()
                .enumerate()
                .map(|(index, token)| token_to_owned(&token, index as u32))
                .collect::<Result<Vec<_>, _>>()?;
            let target = braid::ChapterTarget::new(
                book,
                braid::ChapterLabel::Number(chapter_num.to_string().into_boxed_str()),
            );
            braid
                .update_chapter(target, braid::ChapterInput::Tokens(tokens))
                .map_err(|error| format!("Braid chapter update failed: {error:?}"))?;
            Ok::<(), String>(())
        })();
        self.braid = Some(BraidResident(braid));
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
            .remove_chapter(braid::ChapterTarget::new(
                book,
                braid::ChapterLabel::Number(chapter_num.to_string().into_boxed_str()),
            ))
            .map_err(|error| format!("Braid chapter removal failed: {error:?}"))?;
        Ok(())
    }

    fn remove_braid_book(&mut self, book_code: &str) {
        let Some(BraidResident(mut braid)) = self.braid.take() else {
            return;
        };
        if let Some(book) = usfm_onion::token::BookId::from_str(book_code) {
            braid.remove_book(book);
            self.braid = Some(BraidResident(braid));
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
        let braid = &mut braid.0;
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
    pub segments: BTreeMap<String, Vec<crate::sous::SegmentDto>>,
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
pub struct MirrorRestoreBraidRecordDto {
    pub book_code: String,
    pub source_key: String,
    pub source: String,
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

#[tauri::command]
pub fn mirror_restore_braid(
    state: tauri::State<'_, MirrorState>,
    packed: Vec<u8>,
    records: Vec<MirrorRestoreBraidRecordDto>,
    generation: i64,
) -> Result<bool, String> {
    let mut mirror = state
        .lock()
        .map_err(|_| "mirror lock poisoned".to_string())?;
    if generation != mirror.high_water {
        return Ok(false);
    }
    mirror.restore_braid(&packed, &records)?;
    Ok(true)
}

// --- Commands (tauri) ------------------------------------------------------

pub type MirrorState = Mutex<WorkspaceTokenMirror>;

#[tauri::command]
pub fn mirror_dispose(state: tauri::State<'_, MirrorState>) -> Result<(), String> {
    let mut mirror = state
        .lock()
        .map_err(|_| "mirror lock poisoned".to_string())?;
    *mirror = WorkspaceTokenMirror::default();
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
                .map(map_braid_lint_issue)
                .collect::<Result<Vec<_>, _>>()?;
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
    let is_dirty = if clear {
        false
    } else {
        if !mirror.books.contains_key(&book_code) {
            false
        } else {
            mirror.braid_is_dirty(&book_code).unwrap_or(true)
        }
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
        schema_version: 1,
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

fn map_braid_lint_issue(issue: &usfm_onion::lint::LintIssue) -> Result<LintIssueDto, String> {
    serde_json::from_value(
        serde_json::to_value(issue)
            .map_err(|error| format!("Braid lint encode failed: {error}"))?,
    )
    .map_err(|error| format!("Braid lint DTO conversion failed: {error}"))
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

fn summarize_braid_findings(
    findings: &[usfm_onion::lint::LintIssue],
) -> usfm_onion::lint::LintSummary {
    let mut by_category = BTreeMap::new();
    let mut by_severity = BTreeMap::new();
    let mut by_issue_type = BTreeMap::new();
    for issue in findings {
        *by_category.entry(issue.category).or_insert(0) += 1;
        *by_severity.entry(issue.severity).or_insert(0) += 1;
        *by_issue_type.entry(issue.issue_type).or_insert(0) += 1;
    }
    usfm_onion::lint::LintSummary {
        by_category,
        by_severity,
        by_issue_type,
        total_count: findings.len(),
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
            segments: BTreeMap::new(),
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
        segments: result.segments,
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
            segments: BTreeMap::new(),
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
            segments: BTreeMap::new(),
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
            segments: BTreeMap::new(),
            cache_state: "persisted".to_string(),
            expected_identity: None,
            ran_at_generation: generation,
            behind: false,
        });
    };
    let path = format!("{cache_root}/sous-chef-findings/{workspace_key}/corpus.bin");
    let Ok(packed) = std::fs::read(path) else {
        return Ok(MirrorGalleyResultDto {
            packed_id: 0,
            keys: Vec::new(),
            segments: BTreeMap::new(),
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
        segments: result.segments,
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
        mirror: &mut WorkspaceTokenMirror,
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
        let mut mirror = WorkspaceTokenMirror::default();
        push_chapter(&mut mirror, "GEN", 1, "new", 5);
        // An older-generation patch for the same chapter is a no-op.
        push_chapter(&mut mirror, "GEN", 1, "stale", 2);
        assert_eq!(mirror.books["GEN"].chapters.len(), 1);
        assert_eq!(mirror.high_water, 5);
    }

    #[test]
    fn book_tokens_preserve_editor_order() {
        let mut mirror = WorkspaceTokenMirror::default();
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
        let mut mirror = WorkspaceTokenMirror::default();
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
        let mut mirror = WorkspaceTokenMirror::default();
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
        assert_eq!(fixtures.patches.len(), 7);
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
}
