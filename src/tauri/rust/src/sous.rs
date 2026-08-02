// sous.rs
//
// scripture-sous-chef content analysis over Braid's resident vref projection.
//
// The mirror supplies an ordered Braid projection, runs sous over each verse's
// projected text, and returns the segment map + UTF-16 findings the editor zips
// into the annotation popover. Sibling of the lint command, NOT a tee on it.
// The web/wasm twin is `WebGalleyService`, which composes the same two libraries
// in the browser.

use serde::{Deserialize, Serialize};
use ssc_core::{
    apply_review_policy, BookBlock, ChapterBlock, Config, Corpus, MutationEffect, ReviewDepth,
    ReviewPolicy, RuleId,
};
use ssc_galley::Galley;
use ssc_wire::pack;
use std::collections::BTreeMap;

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

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GalleyConfigDto {
    #[serde(default)]
    pub rules: BTreeMap<String, bool>,
    pub review: Option<ReviewPolicyDto>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ReviewPolicyDto {
    pub depth: i16,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GalleyPackedResultDto {
    pub packed: Vec<u8>,
    pub keys: Vec<String>,
    pub segments: BTreeMap<String, Vec<SegmentDto>>,
    pub cache_state: String,
    pub expected_identity: Option<GalleyCacheIdentityDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GalleyCacheIdentityDto {
    pub analysis_id: String,
    pub target_context_id: String,
    pub has_reference: bool,
}

/// The native resident handle. It owns Galley's corpus/cache between mirror
/// commands; the mirror still owns the editor token projection and segment map.
pub struct ResidentGalley {
    inner: Galley,
    projection: Projection,
    dirty: bool,
    last_result: Option<GalleyPackedResultDto>,
}

impl ResidentGalley {
    pub fn new(projection: Projection, config: Option<&GalleyConfigDto>) -> Result<Self, String> {
        let corpus = Corpus::try_from_parts(projection.keys.clone(), projection.texts.clone())
            .map_err(|error| error.to_string())?;
        Ok(Self {
            inner: Galley::new(corpus, None, config_to_core(config)?),
            projection,
            dirty: true,
            last_result: None,
        })
    }

    pub fn analyze(&mut self) -> Result<GalleyPackedResultDto, String> {
        if !self.dirty {
            if let Some(result) = &self.last_result {
                return Ok(result.clone());
            }
        }
        let findings = self.inner.analyze();
        let packed = pack(
            &findings,
            self.inner.corpus(),
            self.inner.expected_target_context_id(),
            self.inner.expected_analysis_id(),
            false,
        )
        .map_err(|error| error.to_string())?;
        let result = GalleyPackedResultDto {
            packed,
            keys: self.projection.keys.clone(),
            segments: self.projection.segments.clone(),
            cache_state: "fresh".to_string(),
            expected_identity: None,
        };
        self.dirty = false;
        self.last_result = Some(result.clone());
        Ok(result)
    }

    pub fn update_config(
        &mut self,
        config: Option<&GalleyConfigDto>,
    ) -> Result<MutationEffect, String> {
        let effect = self.inner.update_config(config_to_core(config)?);
        if effect == MutationEffect::Changed {
            self.dirty = true;
        }
        Ok(effect)
    }

    pub fn update_chapter(
        &mut self,
        book_code: &str,
        chapter_num: i64,
        next: Projection,
    ) -> Result<MutationEffect, String> {
        let effect = self
            .inner
            .update_chapter(ChapterBlock {
                slug: book_code.to_uppercase().into_boxed_str(),
                chapter: chapter_num.to_string().into_boxed_str(),
                keys: next.keys.clone(),
                texts: next.texts.clone(),
            })
            .map_err(|error| error.to_string())?;
        if effect == MutationEffect::Changed {
            self.replace_chapter_projection(book_code, chapter_num, &next);
            self.dirty = true;
        }
        Ok(effect)
    }

    pub fn update_book(
        &mut self,
        book_code: &str,
        next: Projection,
    ) -> Result<MutationEffect, String> {
        let effect = self
            .inner
            .update_book(BookBlock {
                slug: book_code.to_uppercase().into_boxed_str(),
                keys: next.keys.clone(),
                texts: next.texts.clone(),
            })
            .map_err(|error| error.to_string())?;
        if effect == MutationEffect::Changed {
            self.replace_book_projection(book_code, &next);
            self.dirty = true;
        }
        Ok(effect)
    }

    pub fn remove_book(&mut self, book_code: &str) -> MutationEffect {
        let effect = if self.inner.remove_books(&[book_code]) > 0 {
            MutationEffect::Changed
        } else {
            MutationEffect::Unchanged
        };
        if effect == MutationEffect::Changed {
            self.remove_book_projection(book_code);
            self.dirty = true;
        }
        effect
    }

    pub fn load_cached(&self, packed: Vec<u8>) -> GalleyPackedResultDto {
        GalleyPackedResultDto {
            packed,
            keys: self.projection.keys.clone(),
            segments: self.projection.segments.clone(),
            cache_state: "persisted".to_string(),
            expected_identity: Some(self.expected_identity()),
        }
    }

    fn expected_identity(&self) -> GalleyCacheIdentityDto {
        GalleyCacheIdentityDto {
            analysis_id: self.inner.expected_analysis_id().get().to_string(),
            target_context_id: self.inner.expected_target_context_id().get().to_string(),
            has_reference: self.inner.has_reference(),
        }
    }

    fn replace_chapter_projection(&mut self, book_code: &str, chapter_num: i64, next: &Projection) {
        let prefix = format!("{} {}:", book_code.to_uppercase(), chapter_num);
        replace_projection_range(&mut self.projection, &prefix, next);
    }

    fn replace_book_projection(&mut self, book_code: &str, next: &Projection) {
        let prefix = format!("{} ", book_code.to_uppercase());
        replace_projection_range(&mut self.projection, &prefix, next);
    }

    fn remove_book_projection(&mut self, book_code: &str) {
        let prefix = format!("{} ", book_code.to_uppercase());
        let keep: Vec<(String, String)> = self
            .projection
            .keys
            .iter()
            .cloned()
            .zip(self.projection.texts.iter().cloned())
            .filter(|(sid, _)| !sid.starts_with(&prefix))
            .collect();
        self.projection.keys = keep.iter().map(|(sid, _)| sid.clone()).collect();
        self.projection.texts = keep.iter().map(|(_, text)| text.clone()).collect();
        self.projection
            .segments
            .retain(|sid, _| sid.starts_with(&prefix) == false);
    }
}

#[derive(Clone)]
pub(crate) struct Projection {
    pub(crate) keys: Vec<String>,
    pub(crate) texts: Vec<String>,
    pub(crate) segments: BTreeMap<String, Vec<SegmentDto>>,
}

fn replace_projection_range(projection: &mut Projection, prefix: &str, next: &Projection) {
    let old_insert_at = projection
        .keys
        .iter()
        .position(|sid| sid.starts_with(prefix))
        .unwrap_or(projection.keys.len());
    let keep: Vec<(String, String)> = projection
        .keys
        .iter()
        .cloned()
        .zip(projection.texts.iter().cloned())
        .filter(|(sid, _)| !sid.starts_with(prefix))
        .collect();
    let insert_at = projection
        .keys
        .iter()
        .take(old_insert_at)
        .filter(|sid| !sid.starts_with(prefix))
        .count()
        .min(keep.len());
    let next_pairs: Vec<(String, String)> = next
        .keys
        .iter()
        .cloned()
        .zip(next.texts.iter().cloned())
        .collect();
    let mut combined = keep[..insert_at].to_vec();
    combined.extend(next_pairs);
    combined.extend(keep[insert_at..].iter().cloned());
    projection.keys = combined.iter().map(|(sid, _)| sid.clone()).collect();
    projection.texts = combined.iter().map(|(_, text)| text.clone()).collect();
    projection
        .segments
        .retain(|sid, _| !sid.starts_with(prefix));
    projection.segments.extend(
        next.segments
            .iter()
            .map(|(sid, segments)| (sid.clone(), segments.clone())),
    );
}

fn config_to_core(config: Option<&GalleyConfigDto>) -> Result<Config, String> {
    let mut core = Config::v1_defaults();
    let Some(config) = config else {
        return Ok(core);
    };
    for (code, enabled) in &config.rules {
        let rule: RuleId = serde_json::from_value(serde_json::Value::String(code.clone()))
            .map_err(|error| format!("unknown Galley rule {code}: {error}"))?;
        core.rules.insert(rule, *enabled);
    }
    if let Some(review) = &config.review {
        let policy = ReviewPolicy {
            depth: ReviewDepth::from_i16(review.depth).map_err(|error| error.to_string())?,
            adjustments: BTreeMap::new(),
        };
        apply_review_policy(&mut core, &policy).map_err(|error| error.to_string())?;
    }
    Ok(core)
}
