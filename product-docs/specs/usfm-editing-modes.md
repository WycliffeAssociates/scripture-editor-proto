# Editor Modes

## What this feature does

- Provides five editor modes for different editing needs:
  - `Regular`: reader-friendly WYSIWYG editing. Chapter (`\c`) and verse (`\v`)
    markers are structured nodes (`USFMNumberedMarkerNode`) whose number is
    directly editable; all other marker bytes are hidden but non-editable.
  - `Form`: structured per-block UI for paragraph/poetry/list rows with verse chips, indent controls, and inline insert/combine/delete affordances
  - `View`: read-only regular layout
  - `Plain`: underlying markup view with fewer editor helpers
  - `USFM`: metadata-visible mode where markers are shown and editable
- Keeps content mode-switchable without changing persisted source-of-truth semantics.

## Mode vs. shape

The user-facing mode is separate from the underlying Lexical tree shape.
`editorModeToShape()` maps modes onto one of three `EditorShape` values:

- `regular` shape — `regular`, `view`
- `form` shape — `form`
- `flat` shape — `usfm`, `plain`

Plugins, toolbars, match-formatting, prettify, and the mode toggle read
shape rather than re-deriving from mode strings. Adding a new mode means
deciding which existing shape it projects onto (or adding a new shape
intentionally).

## Form mode

- Renders each paragraph-class block as a `FormBlockNode` decorator
  (Lexical decorator node, not a sibling render branch). All custom
  editing UI lives inside the Lexical lifecycle.
- Which markers are paragraph-class, and the block category they get
  (heading / poetry / list / paragraph), derive from the usfm-onion
  catalog's `paragraphCategory` via `markerTaxonomy.classifyParagraphMarker`
  — not hardcoded marker sets. Only the app's `rule` grouping (`\b` / `\pb`)
  and a few uncatalogued legacy markers stay local (see
  `form-mode-and-match-formatting.md`).
- Visual cards span paragraph → poetry runs: paragraph-class and list
  blocks start a white card; poetry blocks that immediately follow a
  card-eligible sibling collapse into it (no top radius, predecessor
  loses bottom radius/padding). Heading, rule, and implicit blocks
  close the open card.
- Per-row chrome: marker chip, indent ◀▶ arrows (poetry rows only),
  kebab menu, inline delete-X. Indent cycle is REMOVE → q1 → q2; `\p`
  is only manipulated through menus and the inter-block combine pill,
  never via Tab.
- Inter-block affordances: a `+` insert slot in the gap below each
  block (hidden between continuation siblings, where the within-block
  `+` covers it), a combine pill between any two adjacent card-
  eligible blocks, and a split pill above any row whose next sibling
  starts a new verse.
- Outdent from q1 → REMOVE merges the row into the previous block
  and parks the caret on the predecessor's last fragment via
  `markBlockPendingFocus`, avoiding the focus-drops-to-body scroll
  jump.
- Textareas auto-size to content (`AutoTextarea`); no fixed-rows
  textareas with internal scrollbars.
- Reference pane uses the form renderer in read-only shape: card
  chrome collapses to a transparent surface, the row grid flattens
  (no indent rail, no add-after column), and cross-pane focus
  alignment scrolls the matching fragment to center and sets
  `data-aligned="true"` for a brand focus ring.

## How to access it in the app

- Open project drawer.
- Go to `Settings`.
- Use the `Editor Mode` segmented control.
- Quick toggle for read-only is available from the toolbar lock/unlock button.

## Typical user flow

1. Work in `Regular` for text-focused editing.
2. Switch to `Form` for structured per-block editing (paragraph/poetry
   reorganization, inserting/combining/splitting verses).
3. Switch to `USFM` when you need direct marker edits.
4. Switch to `Plain` for source-like inspection/editing.
5. Use `View` when reviewing without editing.

## Current limits and non-goals

- `Plain` mode intentionally reduces structure helpers; lint/update behaviors differ from regular/usfm flows.
- Mode switching changes editor presentation/projection and interaction rules; it does not auto-save changes.
- Mode-flip losslessness: every flip reduces to flat tokens first, then rebuilds
  for the target shape (`transformToShape` in `modeTransforms.ts`). For
  `USFMNumberedMarkerNode`, one node unfolds to 2–3 tokens and refolds with
  stable ids. A dev-only I2 fixpoint pipeline (`tokenFixpointPipeline.ts`,
  gated on `import.meta.env.DEV`) continuously re-lexes committed bytes and
  `console.error`s on divergence.
- Milestone-kind round-trip through the Lexical adapter is a known
  pending issue (the adapter currently collapses `kind: "milestone"`
  → `"marker"`); locked-in divergences are pinned via `it.fails` in
  `tests/unit/syntheticFixtureRoundTrip.test.ts`.
- This mode system is not a substitute for full USFM semantic validation.

## Key modules (for agents)

- `src/app/data/editor.ts` — `EditorModeSetting`, `EditorShape`, `editorModeToShape`, `UsfmTokenTypes`
- `src/app/ui/components/blocks/ProjectSettings/EditorModeToggle.tsx`
- `src/app/ui/hooks/useModeSwitching.tsx`
- `src/app/domain/editor/utils/modeTransforms.ts`
- `src/app/domain/editor/serialization/fromSerializedToLexical.ts`
- `src/app/domain/editor/listeners/manageUsfmMarkers.ts`
- `src/app/domain/editor/nodes/USFMNumberedMarkerNode.ts` — structured c/v node; `registerNumberedMarkerBehaviors`
- `src/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts` — tree→flat waist
- `src/app/domain/editor/pipelines/structureMaintenancePipeline.ts` — metadata pass (sid/inPara/structural-empty) at frame cadence (~16 ms); char-open/close repair (residual until char-element nodes ship)
- `src/app/domain/editor/pipelines/tokenFixpointPipeline.ts` — dev-only I2 re-lex alarm
- Form-mode specific:
  - `src/app/domain/editor/nodes/FormBlockNode.tsx` — decorator node, sets `data-block-category`
  - `src/app/ui/components/blocks/FormBlockCard.tsx` — row grid, chrome, indent cycle, insert/combine/split slots
  - `src/app/ui/components/blocks/formBlock.css.ts` — merged-card surface rules (uses `:has()` for continuation collapse)
  - `src/app/domain/editor/utils/formModeBlockTree.ts` — block classification (delegates to `markerTaxonomy`), continuation predicates, pending-focus helpers
  - `src/app/domain/editor/markerTaxonomy.ts` — `classifyParagraphMarker` / `isSectionMarker`, derived from the usfm-onion catalog
  - `src/app/domain/editor/utils/formModeEntries.ts` — structural entry model the form renderer walks
  - `src/core/domain/usfm/skeletonInjection.ts` — paragraph/poetry skeleton injection for form-mode entry creation
  - `src/app/ui/components/primitives/AutoTextarea/AutoTextarea.tsx`
  - `src/app/ui/contexts/FormFocusContext.tsx` — cross-pane focus alignment
