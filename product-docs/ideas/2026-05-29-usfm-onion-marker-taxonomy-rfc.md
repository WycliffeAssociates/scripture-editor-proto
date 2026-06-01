# RFC: Single-source marker taxonomy (app ↔ usfm-onion)

**Status:** ✅ Resolved / implemented (usfm-onion v0.0.5). Phase A + Phase B-poetry shipped; see
[`2026-06-01-usfm-onion-marker-taxonomy-upstream-response.md`](./2026-06-01-usfm-onion-marker-taxonomy-upstream-response.md).
**Date:** 2026-05-29
**Scope:** `scripture-editor` app + a small upstream ask to `usfm-onion`
**Relates to:** the deferred "Phase 6" of the further-refactors plan; `product-docs/specs/form-mode-and-match-formatting.md`, `usfm-editing-modes.md`

## Problem

The app classifies paragraph markers into presentation categories (poetry / heading /
rule / list / paragraph / continuation) in several places, by hand, and those copies can
drift from each other and from the canonical USFM marker knowledge:

| Site                                                             | What it hardcodes                                                                                                |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/app/domain/editor/utils/formModeBlockTree.ts`               | `POETRY_MARKERS`, `HEADING_MARKERS`, `RULE_MARKERS`, `LIST_MARKERS`, `PARAGRAPH_MARKERS` sets + `classifyMarker` |
| `src/app/domain/editor/utils/modeTransforms.ts`                  | `isSectionMarker = m => m === "s" \|\| /^s\d+$/.test(m)`                                                         |
| `src/app/domain/editor/serialization/fromSerializedToLexical.ts` | its own marker-category rules for serialized→Lexical                                                             |
| `src/app/domain/editor/actions/markerActions.ts`                 | `AVAILABLE_MARKERS_FOR_CHANGE` (the "change marker" menu)                                                        |
| `formBlock.css.ts` (form-mode styling)                           | continuation-pair styling coupled to the above by convention                                                     |

Each of these is a separate, hand-maintained answer to "what kind of paragraph marker is
this?" A new marker (or a recategorization) means editing N files in lockstep, with no
compiler or single source enforcing agreement. This is exactly the implicit-knowledge
smell the rest of the refactor work has been collapsing.

## Key finding: usfm-onion already classifies most of this

`usfm-onion-web` (the Rust/WASM canonical USFM engine) already exposes rich per-marker
structural metadata, which the app receives in `UsfmMarkerCatalog.infoByMarker[marker]`
(`src/core/domain/usfm/usfmOnionTypes.ts`) but currently **ignores** in favor of the
hardcoded sets above. `MarkerInfo` carries:

```ts
interface MarkerInfo {
    marker: string;
    category: MarkerCategory;   // "paragraph" | "character" | "chapter" | "verse" | ...
    kind: MarkerKind;
    family?: MarkerFamily;      // "sectionParagraph" | "listParagraph" | "footnote" | ...
    blockBehavior?: BlockBehavior; // "none" | "paragraph" | "tableRow" | ...
    // ...
}
```

Mapping the app's hardcoded categories onto what upstream already provides:

| App category (`formModeBlockTree`)                          | Upstream signal (today)                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| HEADING (`s`, `s1..4`, `ms`, `mr`, `r`, `d`, `sr`, `sd`, …) | `family === "sectionParagraph"`                                                      |
| LIST (`li`, `lim`, …)                                       | `family === "listParagraph"`                                                         |
| PARAGRAPH (`p`, `m`, `pi`, …)                               | `category === "paragraph"` and no specialized family                                 |
| POETRY (`q`, `q1..4`, `qa`, `qc`, `qm*`, `qr`, `qd`)        | **no distinct family today** — these are `category: "paragraph"`                     |
| RULE (`b`, `pb`)                                            | partially expressible via `blockBehavior` / break semantics — **needs confirmation** |

So this is mostly a **consumption** problem, not a missing-data problem: the app should
derive heading/list/paragraph from `infoByMarker`, and `modeTransforms.isSectionMarker`
should be `family === "sectionParagraph"` rather than a `/^s\d+$/` regex (which, e.g.,
misses `ms`/`mr`/`sr`/`d` and over-matches anything starting with `s`+digits).

## Proposal

### Phase A — app-side single source (no upstream change required)

Add one canonical classifier in the app that **derives** form-mode categories from the
catalog, with a small, clearly-labeled local fallback ONLY for the genuine upstream gaps
(poetry, rule):

```ts
// src/core/domain/usfm/markerTaxonomy.ts  (or extend onionMarkers.ts)
type ParagraphMarkerCategory =
    | "paragraph" | "heading" | "poetry" | "list" | "rule" | "continuation";

function classifyParagraphMarker(marker: string): ParagraphMarkerCategory | null;
function isSectionMarker(marker: string): boolean;   // family === "sectionParagraph"
function isContinuationPair(a: string, b: string): boolean;
```

- `heading` / `list` / `paragraph` derive from `infoByMarker[marker].family` / `.category`.
- `poetry` / `rule` use a **local set** (documented as "pending upstream", see Phase B).
- `formModeBlockTree`, `modeTransforms`, `fromSerializedToLexical`, and the "change marker"
  menu all call this classifier. The CSS module **imports** continuation pairs rather than
  mirroring them by comment.

This removes the drift immediately. The local poetry/rule sets become the only
app-resident marker knowledge, isolated and labeled.

### Phase B — upstream ask to usfm-onion (deletes the last local sets)

Ask the `usfm-onion` maintainers to expose the two distinctions the app still has to keep
locally, on `MarkerInfo`:

1. **Poetry**: a way to identify poetic paragraph markers (`q*`). Options: a
   `family: "poetry"` (parallel to `sectionParagraph`/`listParagraph`), or a `familyRole`
   that marks poetic lines. Today there is no `MarkerFamily` value for poetry.
2. **Rule / break**: confirm whether `b` / `pb` are already distinguishable via
   `blockBehavior` or a break kind; if not, add an explicit signal.

Once present, the app's local poetry/rule fallback sets are deleted and
`classifyParagraphMarker` becomes a pure projection of `infoByMarker`.

### What stays app-side (deliberately NOT upstream)

- **Presentation policy**: which categories get a form-mode "card", card ordering, and the
  CSS for each. That is editor UX, not USFM semantics — it consumes the upstream
  classification but is not part of it.
- **The "change marker" menu** (`AVAILABLE_MARKERS_FOR_CHANGE`): which markers a user may
  switch between is product policy; it should be *derived from* the taxonomy + a
  curated allow-list, not hand-listed independently.

## Migration / rollout

1. Land Phase A behind the existing form-mode tests (`tests/unit/core/domain/usfm/*` is the
   gold prior art) — move the local sets VERBATIM into `markerTaxonomy.ts` first (zero
   membership change), prove parity, then switch the derivable categories (heading/list/
   paragraph) to read `infoByMarker`. This is the regression-sensitive step: form-mode card
   rendering depends on these categories, so verify visually + via the form-mode e2e.
2. File the Phase B upstream issue against `usfm-onion`; gate the deletion of the local
   poetry/rule sets on that landing.

## Risks

- **Form-mode rendering regression.** Heading/list membership derived from `family` must
  match the current hardcoded sets exactly, or cards regroup. Mitigate by diffing the
  derived classification against the current sets for the full known-marker catalog as a
  test before switching.
- **Catalog availability timing.** `infoByMarker` is populated by
  `initializeUsfmMarkerCatalog` at startup; the classifier must handle being asked about a
  marker before init (fall back to local, or assert init-first) — match whatever
  `onionMarkers.ts` already does.

## Open questions (for the onion maintainers)

- Is there an existing signal for poetic markers we've missed (a `familyRole`,
  `kind`, or `blockBehavior` value)?
- Are `b` / `pb` (and other breaks) intended to be classified structurally, or are they
  deliberately "just whitespace" markers?
- Would upstream accept a `family: "poetry"` addition, or is poetry considered a
  rendering concern outside the marker model?




