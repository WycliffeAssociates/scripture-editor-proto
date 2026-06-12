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

## Producers (parallel pipelines)

Both subscribe to `WorkingFilesStore.changes` via `makeFoldedScopePipeline` —
parallel subscribers, not a tee.

- **onion lint** (`lintPipeline.ts`): book tokens → `IUsfmOnionService.lintScope`
  → `LintIssue[]` → `normalizeFindings.lintIssuesToFindings` → committed under
  the `"onion"` slice (`commitBookFindings`).
- **sous content analysis** (`sousPipeline.ts`, 200 ms): book tokens →
  `ISousService.analyze` → `SousAnalyzeResult` (findings + a `SegmentsBySid`
  sidecar) → `sousFindingsToFindings` → committed under the sous slice atomically
  with its segment map (`commitSousBookFindings`). Tauri runs the `sous_analyze`
  Rust command; web runs `onion.vrefIndexTokens` + `ssc.analyze_vref` in-process
  (`WebSousService.ts`). Both emit UTF-16 offsets at their boundary.

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
Per-segment ranges skip marker tokens for free.

## Rendering (`plugins/FindingsOverlayPlugin.tsx`, `useFindings.ts`)

- **Overlay:** token-anchored findings resolve to their token element
  (`highlight` box) or, when not visibly rendered, a positioned `badge`;
  content-anchored findings resolve via `resolveContentRange`. Re-runs on
  `layoutTick` (reflow) and findings change.
- **Panel** (`FindingsPopover.tsx`): `useFindings` reads the store via
  `useSyncExternalStore`, applies `presentFinding` for the panel surface, and
  offers scope tabs (this chapter / whole project) and category/code/book
  filters; jump-to navigates via `actions.switchBookOrChapter`.

## Decoration (`annotations/decorators/`)

`useDecorateFindings` assembles a stable capability context once at the React
edge (working-files store, interaction gate, history, onion service, editor
mode, modal openers); `decorateFinding(finding, ctx)` (pure) adds the localized
message and action closures. Lint autofixes live in `decorators/lintFix.ts`.
The decorator registry is closed — a new finding kind is a type edit.

## Key files

- `src/app/domain/editor/annotations/` — `finding.ts`, `normalizeFindings.ts`,
  `presentFinding.ts`, `resolveContentRange.ts`, `decorators/`
- `src/app/state/FindingsStore.ts`, `findingsSelectors.ts`
- `src/app/domain/editor/pipelines/lintPipeline.ts`, `sousPipeline.ts`
- `src/core/domain/sous/ISousService.ts`, `sousTypes.ts`;
  `src/tauri/domain/sous/TauriSousService.ts`,
  `src/web/domain/sous/WebSousService.ts`
- `src/core/domain/usfm/vrefTypes.ts`
- `src/app/domain/editor/plugins/FindingsOverlayPlugin.tsx`,
  `src/app/ui/hooks/useFindings.ts`, `useDecorateFindings.ts`,
  `src/app/ui/components/blocks/FindingsPopover.tsx`
