# Upstream response: marker-taxonomy RFC → usfm-onion v0.0.5

**Status:** Resolved upstream. Shipped in `usfm-onion` **v0.0.5** (commit `423d2fd`).
**Relates to:** [`2026-05-29-usfm-onion-marker-taxonomy-rfc.md`](./2026-05-29-usfm-onion-marker-taxonomy-rfc.md), `agent-tmp/plans/further-refactors/phases/06-marker-taxonomy.md`

## TL;DR

The RFC's Phase B ask was **reframed and shipped**: instead of adding a `family: "poetry"`,
upstream now exposes the marker's **`paragraphCategory`** — a field it already modeled
internally but never serialized across the WASM boundary. Poetry is `paragraphCategory === "poetry"`.

To consume it, bump one line:

```jsonc
// package.json
- "usfm-onion-web": "github:WycliffeAssociates/usfm-onion#v0.0.4",
+ "usfm-onion-web": "github:WycliffeAssociates/usfm-onion#v0.0.5",
```

No app type changes needed: `usfmOnionTypes.ts` re-exports `MarkerInfo` from the package, so
`MarkerInfo.paragraphCategory?: ParagraphCategory` and the `ParagraphCategory` union appear
automatically after the bump.

## What shipped

1. **`paragraphCategory` on `MarkerInfo`** (`infoByMarker[m].paragraphCategory`), present for
   every paragraph-kind marker (`undefined` for character/note/chapter/verse/etc.):

   ```ts
   type ParagraphCategory =
     | "identification" | "introduction" | "title" | "section"
     | "body" | "poetry" | "list" | "table" | "peripheral" | "other";
   ```

   Verified values: `q`,`q1` → `"poetry"`; `s`,`s1`,`r`,`d`,`sr`,`sp` → `"section"`;
   `li` → `"list"`; `p`,`m`,`b` → `"body"`; `mt` → `"title"`; `sts` → `"identification"`;
   `pb` → `"other"`.

2. **A correctness fix that affects classification.** Upstream's `family` axis previously
   over-matched: the character markers `sc`, `sig`, `sls`, `sup` were wrongly tagged
   `family: "sectionParagraph"` (and `inlineContext: "section"`). They are now correctly
   `family: undefined`. **If the app derives "heading" from `family === "sectionParagraph"`,
   it was previously mis-grouping these four character markers — that stops with v0.0.5.**

3. **A related internal fix** (no app-visible API change): `r`/`s`/`s1..s4` now report a
   consistent `family` between the token-metadata path and `markerCatalog()`.

## What this unblocks for our refactor

### Phase A (app-side single source) — now derivable from one field
- `classifyParagraphMarker` should derive **heading / poetry / list / paragraph** from
  `infoByMarker[m].paragraphCategory` (`"section"` / `"poetry"` / `"list"` / `"body"`),
  not from the hand-maintained sets.
- `isSectionMarker` → `paragraphCategory === "section"` (preferred) — this is more accurate
  than the old `/^s\d+$/` regex *and* than `family === "sectionParagraph"` (see caveat below).

### Phase B (delete local sets) — **poetry is done now**
- The local **poetry** fallback set can be deleted immediately: poetry is first-class
  (`paragraphCategory === "poetry"`). The RFC gated this on an upstream landing — it's landed.

### What stays app-side (unchanged from the RFC)
- **Rule (`b`/`pb`)** is *not* an upstream concept and won't become one: `b` → `"body"`
  (blank-line/stanza break) and `pb` → `"other"` (page break) are semantically unrelated, so
  "RULE" is an app presentation grouping. Keep the 2-entry local allow-list for `b`/`pb`. The
  RFC's hope that Phase B deletes the *last* local set holds only for poetry, not rule.
- Presentation policy (cards, ordering, CSS) and the "change marker" allow-list remain app-side.

## Migration caveats (carry the RFC's mitigation forward)

- **Run the diff test** (derived classification vs. the current hardcoded sets, over the full
  catalog) before switching — it's still the regression gate. Two known divergences it will
  surface, both arguably *more* correct on `paragraphCategory`:
  - `cd` / `cl` are `family: "sectionParagraph"` but `paragraphCategory: "title"` — the two
    axes disagree. If our HEADING set excluded chapter label/description, prefer
    `paragraphCategory`.
  - `sp` (speaker) is `"section"` on both axes — confirm that matches our intended grouping.
- **Prefer `paragraphCategory` over `family` for the heading/poetry/list/body split.** `family`
  is a structural-grouping axis (footnote/section/list/milestone/…); `paragraphCategory` is the
  semantic/presentation axis we actually want, and it's the only one that distinguishes poetry.
- **Catalog timing is unchanged**: `paragraphCategory` is populated by the same
  `markerCatalog()` path as the rest of `infoByMarker`, so whatever init-ordering guard
  `onionMarkers.ts` already uses still applies.

## Implemented (2026-06-01)

Landed in `markerTaxonomy.ts` + `onionMarkers.ts` (package bumped to `#v0.0.5`):

- `classifyParagraphMarker` / `isSectionMarker` now DERIVE from
  `getParagraphCategory(marker)` (`onionMarkers` exposes a
  `paragraphCategoryByMarker` map; the getter returns `undefined` — not a throw — when the
  catalog is uninitialized, since it's on the per-token render path). The hand-maintained
  POETRY/HEADING/LIST/PARAGRAPH sets are deleted. Mapping: `section`→heading, `poetry`→poetry,
  `list`→list, `body`→paragraph; `identification`/`introduction`/`title`/`table`/`peripheral`/
  `other`→`null` (not a form-mode block).
- **Poetry local set deleted** (Phase B-poetry — `paragraphCategory === "poetry"`).
- **Two small local maps kept, both labeled:** RULE (`b`/`pb` — app presentation grouping) and
  `LOCAL_UNCATALOGED_MARKERS` (`ms4`, `sb`, `ph1`/`ph2`/`ph3`, `hl` — app-supported markers the
  catalog doesn't enumerate, parallel to `onionMarkers`' `LOCAL_ONLY_MARKERS` `s5`).

**The diff test (regression gate) ran and these divergences were ADOPTED as more correct**
(catalog is authoritative for markers it enumerates):

| marker | was | now | why |
| ------ | --- | --- | --- |
| `litl` | list | `null` | `category: character` (list-total inline) — never should have started a block |
| `no`   | paragraph | `null` | `noteSubmarker` — not a paragraph |
| `sts`  | heading | `null` | `paragraphCategory: identification` (status metadata), not a body heading |
| `lh` / `lf` | paragraph | list | list header/footer — still card-eligible, so no visible card regression |

`isSectionMarker` is now broader (all `paragraphCategory === "section"`: `ms`/`mr`/`sr`/`r`/`d`/…
plus legacy `ms4`/`sb`) — but it's redundant at both call sites (`isContainerStartMarker`, where
every section marker is already a valid paragraph marker), so this is a contract/test change with
no runtime effect.

**Verified:** `markerTaxonomy.test.ts` rewritten as the full-table parity gate (29 cases, inits
the catalog); full unit suite (835) green; e2e change-marker flow + Format Book/Project green.
