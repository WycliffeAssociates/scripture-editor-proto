# Spiritual Terms Evaluation (STET)

## What this feature does

STET is a read-only navigate-and-compare panel for checking how the working
project renders key spiritual terms against a frozen reference translation.

- Lists curated spiritual terms (with English gloss, Strong's numbers, definition)
  from a validated per-locale guide.
- For a selected term, shows the verses where it occurs, each as a side-by-side
  row: the **reference** (GL) frozen snapshot text on one side, the **live project**
  (HL) text on the other.
- Highlights the term's glosses within the GL text (precomputed offset ranges).
- Lets the user jump the main editor to any verse that exists in the project.

STET is deliberately a comparison/navigation aid: it has **no highlight-in-editor
and no replace action**. HL = the target (your project); GL = the reference snapshot.

## How to access it in the app

- Open the STET panel from the editor surface (docks beside the editor on desktop;
  on small screens it opens over the editor and closes on navigation).
- Pick a guide/locale (defaults to English; `en`, `es-419`, `pt-br` ship today).
- Filter and select a term; toggle **exhaustive** to widen the verse set.
- Click a verse row to navigate the editor there (disabled when the verse isn't in
  the project).

## Data model — a frozen, self-contained catalog

Term data is **not** derived live. A generator bakes a self-contained envelope
offline; the app only validates and renders it. Verse text and gloss highlight
positions are baked in — the app never fetches or unzips a GL archive.

`StetCatalog` (schema version 1):

- `locale`, and `reference { provenanceId, displayName, sourceUrl? }` where
  `provenanceId` is the pinned commit SHA of the GL snapshot the marks were
  computed against.
- `referenceVerses` — frozen GL text keyed by canonical single-verse SID.
- `terms[]` — each: `term`, `englishTerm`, `strongs[]`, `definition`,
  `subsetVerses` (curated evaluation verses), `exhaustiveVerses` (all recorded
  occurrences), `glosses` (display/diagnostics only, **not** used for runtime
  matching), and `glossRanges` (per-SID sorted non-overlapping `[start, end)`
  offsets into `referenceVerses[sid]`).

`stetCatalog.ts` is the trust boundary. `parseStetCatalog` throws
`StetCatalogError` for fatal envelope problems (bad `schemaVersion`/locale/
reference/`referenceVerses`/`terms`); individual malformed terms are dropped and
reported as non-fatal `warnings`. SIDs are normalized to canonical single verses
(ranges, chapter-only, and out-of-range refs are rejected); gloss ranges are
sanitized to in-bounds, ordered, non-overlapping. Locales outside
`SUPPORTED_STET_LOCALES` (`en`, `es-419`, `pt-br`) are refused.

## Delivery seam (bundled today, remote-ready)

`StetCatalogSource` is a `listGuides` + `loadCatalog` seam. The shipped
`PublicStetCatalogSource` reads a committed `index.json` manifest and per-locale
files under `/public/stet/`. It is the only code that knows URLs, so the source can
later swap to a remote guides API in one place. `loadCatalog` refuses an envelope
whose `locale` or `provenanceId` disagrees with the manifest ref, so a stale file is
never keyed as a valid copy. **Follow-up: source term data remotely instead of the
baked-in `public/stet/` folder** (tracked in the idea backlog).

## Derivation and presentation

- `resolveTermVerseSet` — the **exhaustive** toggle is *additive*: it shows the
  deduped union of curated + exhaustive SIDs, never a replacement. Both modes render
  in canonical SID order.
- `buildStetRows` — one row per visible SID. A visible SID is never dropped for
  missing GL or HL text; absence is surfaced via `hasSource` / `hasTarget` so the
  panel can show explicit fallbacks and count coverage. `computeCoverage` reports
  present-HL / designated.
- The HL side is a **live** lookup: `useStet` subscribes to the working-files store
  (`buildTargetSidTextLookup`, non-USFM) and rebuilds on every commit (edits, undo,
  import).
- Rows are projected into the shared `ResultRow` / `ResultColumn` result-browser
  model reused from Find, so STET and Find share one result-list presentation.
  Navigation reveals the editor (dock on desktop / close on mobile), switches
  book/chapter, and scrolls the SID into view.

## Current limits and non-goals

- Read-only: no in-editor highlight and no replace/fix action.
- Term data is bundled in `public/stet/` (remote sourcing is a planned follow-up).
- Verse matching is by baked SID + gloss ranges; `glosses` are display-only.
- Guides are limited to the supported locales above.

## Key modules (for agents)

- `src/app/domain/stet/stetCatalog.ts` — schema, validation/normalization (trust boundary)
- `src/app/domain/stet/StetCatalogSource.ts` — `listGuides`/`loadCatalog` seam + `PublicStetCatalogSource`
- `src/app/domain/stet/stetDerivation.ts` — pure verse-set / row / coverage / definition derivation
- `src/app/ui/hooks/stet/useStet.ts` — feature-local state, catalog fetch, live HL lookup, result rows
- `src/app/ui/components/views/stet-panel/StetPanel.tsx` — panel UI
- `src/app/ui/components/views/result-browser/` — shared result-list model (with Find)
- `public/stet/` — `index.json` manifest + per-locale catalogs
