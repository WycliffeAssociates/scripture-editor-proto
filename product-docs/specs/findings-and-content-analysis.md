# Findings and Content Analysis

A **finding** is one flagged issue in the text. Two producers emit findings —
onion **lint** (USFM validity) and scripture-sous-chef **content analysis**
(hygiene/consistency over verse text) — into one store, through one
presentation policy, onto one decoration path that renders both as inline
overlays and a panel list.

## The Finding model (`annotations/finding.ts`)

A `Finding` carries `id`, `code`, `severity`, `category`, `source`,
`coveringTokenIds`, and an **anchor** — a closed union of:

- **`token`** — pinned to a token id (structural lint: the issue is _a marker_).
- **`content`** — `(sid, Utf16Span)` into a verse's projected text (sous: the
  issue is _some characters within a verse_).

The model holds no display strings: ids derive from canonical fields only, so
they're stable across locale and re-runs. Adding a producer or anchor kind is a
deliberate type edit (closed unions), not an open extension point.

> A third producer, main-thread `local-lint` (intrinsic consistency:
> verse/chapter monotonicity, `\cl` agreement), is in flight. A standing
> invariant for it and any future main-thread producer: **read tokens for
> structure, never trust `token.sid`** — see `adr/0001-token-sid-is-a-derived-cache.md`.

## Producers (parallel pipelines)

Both subscribe to `WorkingFilesStore.changes` via `makeFoldedScopePipeline` —
parallel subscribers, not a tee. Analysis runs **off the main thread** in the
workspace mirror; the pipelines issue commands and the result router commits
what comes back.

- **onion lint** (`lintPipeline.ts`, 100 ms debounce): folds commit events into
  a book-granular `AnalyzeScope` and sends an `analyzeLint` command to
  `MirrorFeed`. The mirror reads its resident tokens for those books, runs the
  lint engine, and returns a `LintResult`. `mirrorResultRouter` normalizes the
  raw `LintIssue[]` per book (`onionFindingsByChapter`) and commits them under
  the `"onion"` slice (`commitBookFindings`). Stale results (generation below
  the lint high-water mark) are dropped in the router.
- **sous content analysis** (`sousPipeline.ts`, 100 ms debounce): same pipeline
  shape — folds to a book-granular scope, sends `analyzeSous` to `MirrorFeed`.
  The mirror assembles vref tokens and runs the sous engine, returning a
  `SousResult` (per-book `SousAnalyzeResult`). The router calls
  `sousFindingsToFindings` and commits findings + the `SegmentsBySid` sidecar
  atomically into the sous slice (`commitSousBookFindings`). Same stale-drop
  logic at the sous high-water mark.

**First-paint findings:** at workspace load, `workspaceKernel` awaits an
initial project-wide lint + sous pass through the mirror (`InitialFindings`).
The provider seeds `FindingsStore` with these results before first paint so
the overlay and panel are never empty on open. The same results also flow
through the live result-router path, making the seed idempotent.

## FindingsStore (`state/FindingsStore.ts`, `findingsSelectors.ts`)

Namespace-partitioned by producer. The sous slice additionally holds a
`segmentsByBook` sidecar. The supersession unit is **one book in one producer's
slice**, replaced wholesale; writes are path-copy (only the touched book/slice
get new references) so untouched branches keep stable memo identity. Selectors
(`flattenFindings`, `chapterFindingsAcrossSources`, `sousSegmentsForBook`)
expose data with no message formatting — localization happens at the React edge.

## Presentation policy (`annotations/presentFinding.ts`)

`presentFinding(finding, inputs)` → `"hide" | "highlight" | "list"`, given user
prefs, editor mode, and surface (`"overlay" | "panel"`). The overlay hides
form-shape findings (DOM-range anchoring is meaningless inside decorator cards);
the panel always lists.

## Anchoring to the DOM (`annotations/resolveContentRange.ts`, `vrefTypes.ts`)

Content findings resolve `(sid, Utf16Span)` → DOM rects: iterate the verse's
`Segment`s overlapping the range, locate the UTF-16 offset within each token
element (`locateUtf16Offset` walks descendant text nodes — never assumes
`firstChild`, since Lexical splits nodes on edits), and collect client rects.
Per-segment ranges skip marker tokens for free. `resolveContentTokenSlices` is
the data-only twin (no DOM): it maps the same `(sid, range)` to the ordered
token slices it covers, which programmatic content fixes splice against.

## Rendering (`plugins/FindingsOverlayPlugin.tsx`, `useFindings.ts`)

- **Overlay:** token-anchored findings resolve to their token element
  (`highlight` box) or, when not visibly rendered, a positioned `badge`;
  content-anchored findings resolve via `resolveContentRange`. Re-runs on
  `layoutTick` (reflow) and findings change.
- **Panel** (`FindingsPopover.tsx`): `useFindings` reads the store via
  `useSyncExternalStore`, applies `presentFinding` for the panel surface, and
  offers scope tabs (this chapter / whole project) and category/code/book
  filters; jump-to navigates via `actions.switchBookOrChapter`. Code-filter
  chips are localized by `i18n/findingCodeLabels.ts` (every surfaced code has a
  terse label; the humanizer is a last-resort guard, not the common path).

## Decoration (`annotations/decorators/`)

`useDecorateFindings` assembles a stable capability context once at the React
edge (working-files store, interaction gate, history, onion service, editor
mode, modal openers); `decorateFinding(finding, ctx)` (pure) adds the localized
message and action closures. Onion autofixes live in `decorators/lintFix.ts`;
the sous `lex.excess-h-whitespace` collapse (one space, distributed across
tokens when the run straddles a marker) lives in `decorators/collapseWhitespace.ts`
— both commit through the working-files seam. The decorator registry is closed
— a new finding kind is a type edit.

## Key files

- `src/app/domain/editor/annotations/` — `finding.ts`, `normalizeFindings.ts`,
  `presentFinding.ts`, `resolveContentRange.ts`, `decorators/` (incl.
  `lintFix.ts`, `collapseWhitespace.ts`)
- `src/app/ui/i18n/findingCodeLabels.ts` — localized filter-chip labels
- `src/app/state/FindingsStore.ts`, `findingsSelectors.ts`
- `src/app/domain/editor/pipelines/lintPipeline.ts`, `sousPipeline.ts`
- `src/app/domain/editor/pipelines/mirrorResultRouter.ts` — result → store
  commit path; stale-drop high-water marks live here
- `src/app/domain/editor/pipelines/mirrorPatchProducer.ts` — `seedMirror`,
  `InitialFindings`; `src/app/domain/mirror/workspaceKernel.ts` — kernel
  build, initial pass, `WorkspaceKernelHandle`
- `src/app/domain/mirror/MirrorFeed.ts`, `mirrorProtocol.ts`
- `src/core/domain/usfm/vrefTypes.ts`
- `src/app/domain/editor/plugins/FindingsOverlayPlugin.tsx`,
  `src/app/ui/hooks/useFindings.ts`, `useDecorateFindings.ts`,
  `src/app/ui/components/blocks/FindingsPopover.tsx`
