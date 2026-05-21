# Form Mode + Match-Formatting Trigger

> **Note for reviewer.** This spec was retrofitted from the original "verse-hunk
> form" plan after the implementation iterated to a *discourse-first* model.
> What is described below reflects what was actually built; the reviewer's job
> is to evaluate whether the code in the repo matches this plan and meets the
> stated goals.

## Context

The repository already had a working **match-formatting** engine
(`src/core/domain/usfm/matchFormattingByVerseAnchors.ts`) and orchestration
hook (`src/app/ui/hooks/useFormatMatching.tsx`). It aligns a target text to a
reference text using verse anchors, places paragraph/poetry markers cleanly at
verse boundaries, and returns `SkippedMarkerSuggestion[]` for any markers it
cannot place because their position falls *inside* a verse (e.g., a `\q2`
mid-verse). What was missing was:

1. A UI entry point for invoking match-formatting.
2. A good way to disambiguate the leftover intra-verse markers — the WYSIWYG
   isn't a great surface for "this marker exists but we don't know where to
   put it inside this verse."

The designer's answer is a **structured form-style editor mode** ("form
mode"). The first iteration of the plan was *verse-first*: each `\v` hunk was
a card and paragraph/poetry markers within that hunk were rows. Real USFM
patterns broke that model — paragraph and verse axes are orthogonal:

- A single verse can span many paragraph-class markers (Heb 1:5: one verse
  spans `\p`, `\q`, `\q2`, `\b`, `\p`, `\b`, `\q`, `\q2`).
- A single paragraph can contain multiple verses (Mt 4:5–6: one `\p` holds
  both `\v 5` and `\v 6`).
- A `\p` typically prefixes the *next* verse's content, so a verse-first
  hunker leaves it stranded at the tail of the previous verse — the source
  of the "is this `\p` a seam or content?" ambiguity that haunted the v1
  prototype.

The shipped model is **discourse-first**: paragraph-class markers (`\p`,
`\m`, `\q1`–`\q4`, `\s1`–`\s4`, `\b`, `\pb`, …) are top-level blocks; verse
fragments live as cards inside. Block kind drives typesetting (indent
staircase for `\q1`–`\q4`, italic for q-class, heading style for `\s`,
flush-left for `\p`/`\m`, thin rule for `\b`/`\pb`). Verse fragments stay the
editable unit (one textarea each). Visual hierarchy is typesetting only — no
nested cards.

The intended workflow:

1. User picks a reference text and runs **Match Formatting** from the toolbar.
2. Match-formatting auto-inserts what it can at verse boundaries.
3. If anything couldn't be placed inside a verse, the workspace switches
   `editorMode` to `"form"` so the user can resolve it. If everything placed
   cleanly, the mode stays as-is.
4. The user can also enter form mode manually at any time via the mode
   switcher; form mode is fully usable on its own.

## Architecture

### Block tree shape (presentation layer over the flat USFM token stream)

```
FormBlockTree
├── FormBlock { kind: paragraph|poetry|heading|rule|list|implicit, tokens, fragments }
│   ├── FormVerseFragment { sid, verseNumber, isFirstOfVerse, text, tokenIndices }
│   ├── FormVerseFragment
│   └── ...
├── FormBlock (kind: rule)  ← \b / \pb, no fragments, renders as thin horizontal rule
└── ...
```

Rules:

- A new block starts whenever a paragraph-class marker appears in the token
  stream.
- A new fragment within a block starts whenever a `\v` marker appears.
- Text tokens accumulate into the current fragment; fragments without a
  preceding `\v` (chapter prelude, or a continuation block whose verse
  started in a prior block) get the **inherited SID** from the most recent
  preceding `\v` so cross-pane focus alignment works.
- `\b` / `\pb` blocks render as a thin centered rule with a hover-reveal X
  for delete (no fragments).
- Chapter framing (`\c`-only block before the first paragraph-class marker)
  renders as a non-editable "Chapter N" badge — kind `implicit`.
- `isFirstOfVerse` is true on the first fragment of any verse-run across
  the chapter so the verse chip is stamped exactly once per verse no
  matter how many blocks the verse spans.

The block-tree is purely a presentation layer over the existing flat USFM
token stream. **Round-trip back to tokens is byte-identical**:
`flattenFormBlockTree(buildFormBlockTree(tokens)) === tokens`.

### Lexical decorator architecture

A single `FormBlockNode` decorator replaces the originally-planned
`FormVerseNode` + `FormPreludeNode` pair:

- One decorator node per top-level block in the chapter.
- Holds `tokens: SerializedLexicalNode[]` (the slice of tokens for that
  block, including its leading marker and trailing linebreak).
- `createDOM` adds `form-block-node` plus a kind class
  (`form-block-q1`, `form-block-p`, …) so CSS can target typesetting per
  kind.
- `decorate()` returns `<FormBlockCard ... />` with all callbacks the
  card needs (insert, split, delete, change-marker, change-text).

`FormBlockCard` parses its own tokens into fragments via
`extractFragmentsFromBlock` and renders one sub-component per fragment.
For `\b` / `\pb` it short-circuits to the rule. For `\s*` / `\d` it
applies heading typesetting. Otherwise it renders the fragment stack.

### Verse stamping (first-of-run only)

Within a chapter, multiple consecutive fragments may share a verse SID
(one verse spanning many blocks). Only the first fragment of any
verse-run shows the verse chip ("Verse N"). Continuation fragments
suppress the chip; on the editable side they show a small kind chip
("POETRY 1", "PARAGRAPH") so the user can still see what kind of
paragraph the continuation lives in. The reference pane (read-only)
hides the kind chip on continuation fragments — typesetting alone
conveys it.

The block-tree builder computes `isFirstOfVerse` chapter-wide by
tracking the previously-seen verse SID across blocks.

### Verse-fragment cards (the editable units)

Each fragment renders as a small bordered card with:

- Verse chip ("Verse N"; on continuation fragments, the kind label).
- Auto-sizing textarea bound to the fragment text (no internal
  scrollbar — the chapter scrolls, not individual cards).
- Inline **outdent / indent arrows** (◀ ▶) on the first fragment of
  each block, cycling the block's leading marker `m → p → q1 → q2`.
  - Outdent past `\m` calls "remove preceding marker": strip the leading
    marker and merge the block's content into the previous block.
    Disabled when the previous sibling is the implicit chapter-framing
    block (would wipe the chapter).
  - Indent past `\q2` is disabled.
  - Bare `\q` (no number) is normalized to `\q1` for the cycle so legacy
    docs still get arrows.
  - Tooltips name the target marker ("Indent to Poetry 2", "Outdent to
    Paragraph", "Remove paragraph" at the endpoint).
- Kebab overflow menu, populated on every first-in-block fragment:
  - "Delete verse" — only on first-of-verse fragments; removes the
    fragment's tokens from the block.
  - "Delete paragraph" — removes the entire block.

The card sits inside the block's typesetting context. A fragment in a
`\q2` block inherits the indent + italic from its parent block class.

### Insertion UI

Two insert-slot positions, both rendered as a small `+` affordance that
opens a marker menu:

1. **Trailing slot** below each block. Inserts a new sibling block
   immediately after this one — except for the special `Verse` choice,
   which **appends a new verse fragment to the current block** (it does
   not auto-wrap in a new `\p`).
2. **Within-block slot** between fragments of a multi-fragment block.
   For a paragraph-class marker (`\p`, `\q1`, `\q2`), this **splits the
   block** at the chosen fragment, prepending the new marker as the
   "after" half's framing. For the special `Verse` choice, it inserts a
   new `\v N \n` fragment **before the chosen fragment, in the same
   block** — it does not split the paragraph.

The menu palette is intentionally constrained:

```ts
INSERT_MARKERS = ["v", "p", "q1", "q2"]
```

Drop `\m`, `\q3`+, `\b`, `\pb` from user-pickable choices. `\m` is
reachable only via the outdent cycle; advanced markers (`\q3`, `\b`,
`\pb`) are preserved when imported from source but never user-inserted.
`\q2` is gated: only offered when the predecessor block is `\q1`.

### Pending-focus coordination

When a `+` action creates or rebuilds a block, we want the right
fragment textarea to receive focus so the user can start typing
immediately, **without scrolling the chapter under them**.

Implementation: a module-level `Map<blockId, "first" | "last" | number>`
in `formModeBlockTree.ts`. Insert handlers call
`markBlockPendingFocus(blockId, position)`; the FragmentCard mounted
inside the new/rebuilt block calls `peekPendingFocus` then
`consumePendingFocus` in a mount-only effect and focuses with
`{ preventScroll: true }`.

Position usage:

- Verse-append (trailing `+ → Verse`) → `"last"` (the new verse is the
  tail).
- Block split (within `+ → Paragraph/Poetry`) → `"first"` (the moved
  fragment leads the new block; that's the part the user is
  interacting with).
- Within-block verse insert (within `+ → Verse`) → numeric index: the
  new fragment occupies the index where the target fragment used to
  live.

### Cross-pane focus and alignment

Source and reference pane each render the same `FormBlockNode`
decorator chain. The reference editor mounts the decorator in
read-only mode (`!editor.isEditable()`).

Keying: `(sid, ordinal)` where ordinal is the index of the focused
fragment among same-SID fragments **on its own pane**. Skeleton
mirroring during match-formatting keeps source and reference block
sequences parallel for any verse, so equivalent ordinals on both panes
identify equivalent positions.

The `FormFocusProvider` effect imperatively manages a `data-aligned`
attribute on the *single* opposite-pane fragment matching the focused
ordinal:

1. Clear all `[data-aligned="true"]`.
2. Find the matching fragment on the other pane via
   `[data-form-pane]` + `[data-form-row-sid]` selectors and the
   parsed ordinal.
3. Set `data-aligned="true"` on the match and `scrollIntoView({ block:
   "nearest", behavior: "smooth" })`.

Source-of-focus side is identified by the textarea's nearest
`[data-form-pane]` ancestor (`source` or `reference`). Highlighting is
a brand outline on the read-only counterpart card.

Continuation fragments — blocks with no `\v` of their own — get an
**inherited SID** plumbed from `FormBlockNode.decorate()` by walking
previous siblings. This lets the cross-pane focus selector match
continuation fragments too.

### Match-formatting integration

`useFormatMatching.matchFormattingChapter()`:

1. Strip deprecated markers (`\s5`) from the source token stream so
   they never propagate from reference to target.
2. Run `matchFormattingByVerseAnchors` to align target to reference.
3. `injectSkeletonVersesFromSource` — for any verse SID the reference
   has but the target lacks, insert an empty `\v N \n` hunk at the
   reference's position. Existing target verses keep their content.
4. `injectSkeletonMarkersFromSource` — for any per-verse paragraph /
   poetry marker the reference has but the target lacks, append an
   empty marker row at the tail of the target's verse hunk.
5. If the run produced any unplaced suggestions or skeleton injections,
   call `setEditorMode(EDITOR_MODES.form)` to switch into form mode.

Notes (`\f...\f*`, `\fe...\fe*`, `\x...\x*`, `\ef`, `\ex`) and the
inline char markers nested inside them (`\fr`, `\ft`, `\fk`, `\fq`,
`\xo`, `\xt`, …) are content, not skeleton. They are dropped from both
source and target via `dropNoteSpans` before diffing so we don't spray
empty `\fr` rows across form-mode cards. The two opener-sets are
top-level config in `skeletonInjection.ts`:

```ts
const DEPRECATED_MARKERS  = new Set(["s5"]);
const NOTE_SPAN_OPENERS   = new Set(["f", "fe", "x", "ef", "ex"]);
```

### Match-formatting indicators (per-verse missing markers)

Per-verse missing markers are computed from
`formatMatchReport.suggestions` and surfaced inline on the affected
fragment card: a left rail in `onSurfaceError` plus a small "Missing:
Poetry 1, Poetry 2" banner. Resolution happens by typing into the
card or by adding a marker via the in-card `+` slot; recomputing on
edit is cheap because per-verse marker projection is bounded.

There is no separate "skipped suggestions" panel.
`SkippedMarkerSuggestion[]` is consumed only as a *signal* that there
is work to do (auto-switch to form mode); the visible state comes
from the per-verse diff.

### Reference pane

Reference editor mounts the same `FormBlockNode` decorator chain in
read-only mode. Reference cards mirror the source verse-by-verse. No
arrows, no kebab, no inserts — purely a structural reference.
Continuation fragments on the reference side hide the kind chip; only
the verse stamp and content show.

## Files

### Created

- `src/app/domain/editor/utils/formModeBlockTree.ts` — pure block-tree
  builder + helpers. Public surface:
  `buildFormBlockTree`, `flattenFormBlockTree`,
  `extractFragmentsFromBlock` (takes `inheritedSid`),
  `replaceFragmentText`, `removeFragmentFromBlock`,
  `splitBlockAtFragment`, `insertVerseFragmentBeforeFragment`,
  `setBlockMarker`, `findChapterNumber`, `findLastVerseSid`,
  `nextVerseSidFrom`, `buildVerseFragmentTokens`,
  `buildEmptyBlockTokens`, `computeFramingEnd`,
  `markBlockPendingFocus` / `peekPendingFocus` /
  `consumePendingFocus`, `deriveBlockKind`, `classifyMarker`.
  Marker classification sets: `POETRY_MARKERS`, `HEADING_MARKERS`,
  `RULE_MARKERS`, `LIST_MARKERS`, `PARAGRAPH_MARKERS`.
- `src/app/domain/editor/nodes/FormBlockNode.tsx` — single Lexical
  decorator. `decorate()` walks `getPreviousSibling()` to plumb
  `canOutdentPastM` and `inheritedSid` into the card. Insert /
  split / change-marker / delete handlers all use `getLatest()` and
  `replace(new FormBlockNode(...))` for unambiguous reconciliation
  (in-place `__tokens` mutation was unreliable across siblings).
- `src/app/ui/components/blocks/FormBlockCard.tsx` — React component
  the decorator renders. Switches on kind:
  `ImplicitBlock` (Chapter N badge), `RuleBlock` (rule + delete X),
  `HeadingBlock` and `ParagraphBlock` (both via `FragmentStack`).
  Hosts `FragmentCard`, `FragmentHeader`, `IndentControl`,
  `FragmentOverflowMenu`, `InsertBlockSlot`.
- `src/app/ui/components/blocks/formBlock.css.ts` — vanilla-extract
  styles. Per-kind `globalStyle` for indent staircase, italic for
  q-class, heading bold, inter-block gap rules (tight inside a
  poetry stanza, wider between paragraph runs). `:disabled` opacity
  rule on `iconButton` for the indent endpoints.
- `src/app/ui/contexts/FormFocusContext.tsx` — provider + effect for
  cross-pane `data-aligned` toggling.
- `src/app/ui/components/primitives/AutoTextarea/` — content-sized
  textarea (no internal scrollbar) used inside fragment cards.
- `src/core/domain/usfm/skeletonInjection.ts` — pure helpers extracted
  from `useFormatMatching.tsx`. Public surface:
  `dropNoteSpans`, `stripDeprecatedMarkers`,
  `groupEnvelopesByVerse`, `listVerseMarkers`, `multisetDiff`,
  `injectSkeletonVersesFromSource`,
  `injectSkeletonMarkersFromSource`, `formatMarkerSkeleton`.

### Removed

- `FormVerseNode.tsx`, `FormPreludeNode.tsx`,
  `FormVerseCard.tsx`, `FormPreludeCard.tsx`,
  `MarkerInsertSlot.tsx`, `MarkerContextMenu.tsx`,
  `formCard.css.ts` — superseded by the discourse-first model. The
  seam logic, `expandedRowKeys`, click-to-expand, and the
  `ALWAYS_SEAM_MARKERS` / `PARAGRAPH_CLASS_MARKERS` /
  `CONTENTLESS_MARKERS` heuristics all go away with them.

### Modified

- `src/app/data/editor.ts` — `"form"` added to `EditorModeSetting` and
  `EDITOR_MODES`.
- `src/app/domain/editor/utils/modeTransforms.ts` — form-mode branch
  emits `FormBlockNode[]` from `buildFormBlockTree(flatTokens)`. The
  reverse path (form → regular) reads each block's `tokens`,
  concatenates, and round-trips through
  `usfmTokenStreamToLexicalRootChildren`. Form-mode detection via
  `isSerializedFormBlockNode`.
- `src/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts`
  — flattens `FormBlockNode.tokens` so the canonical-snapshot path
  sees real flat tokens.
- `src/app/ui/hooks/useFormatMatching.tsx` — accepts `setEditorMode`;
  uses the extracted skeleton-injection helpers; switches to form
  mode when there are unresolved per-verse skeletons. Drop the
  cursor-based `applyMatchFormattingSuggestion` flow.
- `src/app/ui/components/primitives/EditorToolbar/EditorToolbar.tsx`
  and `ToolbarOverflowMenu/ToolbarOverflowMenu.tsx` — "Form" entry
  in the mode switcher; "Match formatting from reference" action
  surfaced.
- `src/app/ui/components/blocks/Editor.tsx` /
  `ReferenceEditor.tsx` — register `FormBlockNode` in the
  `LexicalComposer` config. Each pane's content-editable carries
  `data-form-pane="source"` / `"reference"` for ordinal-by-pane
  cross-pane lookups.
- `src/app/ui/components/views/layout/WorkspaceShell.tsx` /
  `views/ProjectView.tsx` — pass `setEditorMode` into
  `useFormatMatching`; mount `FormFocusProvider` around the editor
  panes.
- `src/app/ui/i18n/usfmMarkerLocalization.ts` — `\p` and `\m` both
  localize to "Paragraph" (product decision: don't make users
  distinguish margin vs. indented paragraphs). All four cycle
  markers also have human labels for the indent-arrow tooltips.
- `src/app/ui/i18n/locales/en/messages.po`, `es/messages.po` and
  compiled `messages.ts` — strings for "Form mode", "Verse N",
  "Indent to …", "Outdent to …", "Remove paragraph", "Delete verse",
  "Delete paragraph", "Insert block", "Match formatting from
  reference", and the marker labels.

## Reuse (do not reimplement)

- `lexicalRootChildrenToUsfmTokenStream` /
  `usfmTokenStreamToLexicalRootChildren` — token bridge unchanged.
- `parseSid` (`src/core/data/bible/bible.ts`) — verse-number parsing
  for fragment SIDs and gap rules.
- `getLocalizedUsfmMarkerLabel` /
  `getLocalizedUsfmMarkerDescription` — marker labels for the kind
  chip, kind label, indent-arrow tooltips, and insert-menu items.
- `formatMatchReport.suggestions` — feeds the per-verse missing
  banners.
- The match-formatting algorithm itself — operates on flat token
  streams, unchanged.

## Verification

1. `pnpm check` — `tsc --noEmit` clean.
2. `pnpm test` — all 110 test files / 610 tests pass. Targeted
   suites that should be exercised:
   - `tests/unit/formModeBlockTree.test.ts` — round-trip on
     Heb 1:5, Mt 4:5–6, prelude, blank-line breaks, section
     heading patterns.
   - `tests/unit/skeletonInjection.test.ts` — pipeline regressions
     including notes-stripping.
   - `tests/unit/app/domain/editor/utils/modeTransforms.test.ts` —
     regular → form → regular byte-identical round-trip on
     real chapters.
3. Manual on Heb 1:5 — verify v5 renders as 7 cards (no card for the
   `\b`s — those are rules) all stamped only on the first;
   typesetting is `\p` flush-left, `\q` indent 1 italic, `\q2`
   indent 2 italic, etc.
4. Manual on Mt 4:5–6 — verify the leading `\p` block contains two
   adjacent fragment cards (v5, v6) with no extra vertical gap;
   subsequent blocks each have their own card stamped v6.
5. Manual insertion paths:
   a. Trailing `+ → Paragraph` after a `\p` block creates a new
      empty `\p` block immediately after with autofocus.
   b. Trailing `+ → Verse` after a verse appends a new verse
      fragment **into the current block** (no new `\p` wrapper)
      with the next verse number.
   c. Within-block `+ → Verse` between two existing fragments
      inserts a new verse fragment **before the chosen fragment,
      in the same block** with focus landing on the new fragment.
      *Specific regression to check: this used to incorrectly
      route to split-with-marker `\v` and corrupt sibling blocks.*
   d. Within-block `+ → Poetry 1` splits the block at the chosen
      fragment.
   e. `\q2` is hidden in the `+` menu unless the predecessor block
      is `\q1`.
6. Indent arrows on a `\p` block: ▶ → "Poetry 1" (italic, indent 1),
   ▶ again → "Poetry 2", ▶ disabled. ◀ back through `\p` to `\m`.
   On `\m` with an implicit predecessor (chapter framing), ◀ is
   disabled. On `\m` with a non-implicit predecessor, ◀ strips the
   marker and merges content into the previous block.
7. Cross-pane focus: click a fragment on source; the matching
   fragment on the read-only reference side gains the brand outline
   and scrolls into view (smooth, nearest). Continuation fragments
   (no own `\v`) also align via inheritedSid.
8. Match formatting on a chapter where the reference has intra-verse
   `\q1`/`\q2` the source lacks: confirm the editor switches into
   form mode, the affected first fragments show the danger left
   rail and "Missing: …" banner, and the synced reference shows
   the corresponding rows.
9. Notes (`\f...\f*`) in the reference are NOT injected as empty
   `\fr`/`\ft` rows on the target.
10. Round-trip: load a chapter with each example pattern, switch to
    form mode, switch back, diff `currentTokens` — byte-identical.
