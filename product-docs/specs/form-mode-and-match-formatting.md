# Form Mode + Match-Formatting Trigger

## Context

The repository already has a working **match-formatting** engine (`src/core/domain/usfm/matchFormattingByVerseAnchors.ts`) and orchestration hook (`src/app/ui/hooks/useFormatMatching.tsx`). It aligns a target text to a reference text using verse anchors, places paragraph/poetry markers cleanly at verse boundaries, and returns `SkippedMarkerSuggestion[]` for any markers it can't place because their position falls *inside* a verse (e.g., a `\q2` mid-verse). What's missing is:

1. A UI entry point for invoking match-formatting (the old `MatchFormattingSuggestionsPanel` was removed in `137c654` and never replaced).
2. A good way to disambiguate the leftover intra-verse markers — the WYSIWYG isn't a great surface for "this marker exists but we don't know where to put it inside this verse."

The designer's proposed answer is a **structured form-style editor mode** ("form mode") where every paragraph, poetry, and character marker in a chapter is rendered as its own card with a localized human-readable label and a content form field. This mirrors the existing chapter-0 `BookFrontmatterForm` pattern, scaled up to a whole chapter. Unplaced markers from match-formatting can then be surfaced clearly as cards needing placement, instead of hiding behind a popover.

The intended workflow:

1. User selects a reference text and runs **Match Formatting** from the toolbar.
2. Match-formatting auto-inserts what it can at verse boundaries.
3. If any markers couldn't be placed, the editor automatically switches into **form mode** so the user can place them. If everything placed cleanly, mode stays as-is.
4. The user can also enter form mode manually at any time via the mode switcher.

## Approach

### 0. Persist this plan in the repo

As the very first implementation step (once approved), write this plan to `docs/plans/form-mode-and-match-formatting.md` in the repo so the team can reference it. Keep `~/.claude/plans/` as the working draft only.

### 1. Add `form` as a new `EditorModeSetting`

Edit `src/app/data/editor.ts`:
- Extend `EditorModeSetting` to `"regular" | "usfm" | "plain" | "view" | "form"`.
- Add `form: "form"` to `EDITOR_MODES`.
- Update `ContentEditorModeSetting` (form is editable, so it's included by virtue of excluding `view`).

Audit all `editorMode` switch/branch sites and add a `form` arm. Likely sites (verify when implementing):
- `src/app/domain/editor/utils/modeTransforms.ts` — mode transitions (handle entering/leaving form mode without losing state).
- `src/app/ui/components/blocks/Editor.tsx`, `NestedEditor.tsx`, `ReferenceEditor.tsx` — render branches.
- `src/app/ui/components/primitives/EditorToolbar/EditorToolbar.tsx` and `ToolbarOverflowMenu.tsx` — mode switcher entries.
- `src/app/domain/editor/utils/insertParagraphMarkerAtCursor.ts` — **no longer used by the suggestion flow**. Form mode replaces cursor-based insertion with explicit boundary placement on cards.

### 2. Token ↔ form-entries adapter

Create `src/app/domain/editor/utils/formModeEntries.ts`, modeled after `bookFrontmatterEntries.ts` (346 lines, the working precedent). The unit of grouping is the **verse hunk** — every paragraph/poetry/character marker that belongs to a verse is nested under that verse's card. There is no separate "unplaced buffer" surface; missing structure is communicated by highlights between the synced source and reference (see §3a).

Shape:

- `FormModeEntry` is a discriminated union of:
  - `verse` — top-level hunk wrapper. Holds verse `sid`/number and an ordered list of `markers: FormModeMarkerEntry[]` for that verse's substructure.
  - `prelude` — a top-level entry for any chapter-level structure that precedes the first verse (e.g., chapter heading, `\s` section heads above v1, `\d`).
- `FormModeMarkerEntry` is a discriminated union for the substructure inside a verse card: `paragraph` (`p`, `m`, `b`, `nb`, `cls`, …), `poetry` (`q1`–`q4`, `qa`, `qc`, `qm1`–`qm3`, `qr`, …), `character` (`add`, `nd`, `wj`, `it`, `bd`, …), and `text` (running text segments between markers). Each entry carries `id`, `marker`, content (token children or plain text), and source-position metadata.
- `parseFormModeEntries(tokens)` — walk a chapter's serialized Lexical children (`SerializedLexicalNode[]`) and produce `FormModeEntry[]`, grouping marker substructure under verse anchors.
- `serializeFormModeEntries(entries)` — round-trip back to `SerializedLexicalNode[]`.

Reuse the existing token bridge (`lexicalRootChildrenToUsfmTokenStream` / `usfmTokenStreamToLexicalRootChildren` in `src/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts`) so form mode never needs its own USFM parser. The serialization contract: form-mode round-trips must produce byte-identical `currentTokens` to what regular mode would produce, so save/lint/diff/history continue to work unchanged.

### 3. Form-mode chapter renderer (verse-hunk cards)

Create `src/app/ui/components/blocks/FormModeChapter.tsx` (and `.css.ts` styles), modeled on `BookFrontmatterForm.tsx` (356 lines) but structured as **one card per verse hunk**:

- The outer **verse card** has its own background tint and border so the entire verse is visually contained as a single hunk. The verse number / `sid` is rendered as the card header.
- Inside the card, render a vertical stack of **marker substructure rows** — one row per `FormModeMarkerEntry`. Each row shows the localized label (`getLocalizedUsfmMarkerLabel`), the raw `\marker` chip, the localized description (`getLocalizedUsfmMarkerDescription`), and the appropriate input:
  - paragraph/poetry → textarea-like editable region for the marker's content
  - character → labeled input
  - text → plain editable text region between markers
- An `InsertSlot` (the existing pattern from `BookFrontmatterForm`) appears between rows inside the card so users can add markers manually within a verse.
- A second `InsertSlot` appears **between verse cards** (and above the first verse / below the last) so users can add chapter-level structure — paragraph breaks, section heads, poetry blocks — without needing to be inside a verse hunk. This mirrors the chapter-0 frontmatter form's between-card insertion exactly.
- A `prelude` card sits above v1 for chapter-level structure that precedes the first verse.

The intra-card `InsertSlot` menu offers verse-scope markers (paragraph, poetry, character). The between-card `InsertSlot` menu offers chapter-scope markers (section heads `\s1`/`\s2`, descriptive titles `\d`, paragraph starts `\p`/`\m`/`\b`, poetry block starts `\q1`–`\q4`, etc.). Reuse `getLocalizedUsfmMarkerLabel` / `getLocalizedUsfmMarkerDescription` for the menu items in both cases.

**Form mode stands on its own.** It is fully usable without ever running match-formatting — a user who just wants to insert a `\p` between two existing paragraphs, or audit/clean up a chapter's structure, can drop into form mode from the mode switcher and use the `InsertSlot`s directly. Match-formatting just happens to be one of several flows that benefit from form mode; the structured-insertion UX is the primary draw.

The renderer mounts when `editorMode === "form"`. It is `contentEditable={false}` like `BookFrontmatterForm`, with form fields handling input. Changes flow through `serializeFormModeEntries` → Lexical state update → the same `setEditorContent` path used today.

### 3a. Highlighting missing-in-source by watching dirtied form fields

There is no separate "unplaced markers" panel or buffer card. Instead the workspace tracks **what the reference has that the source is missing**, and highlights it inline:

- After a match-formatting run, derive a per-verse list of "expected markers" from the reference token stream for each verse hunk. (The reference's verse → markers projection is the same `parseFormModeEntries` shape applied to the reference token stream — reuse the parser.)
- Compare against the source's per-verse marker projection. Anything the reference has that the source does not is a "missing" marker in that verse.
- In the **source** card, color the verse card border (or a left rail) with the danger/error color whenever that verse has missing markers, and render a small inline indicator inside the card listing the localized names of what's missing (e.g., "Missing: Poetry level 2"). No "place" button — the user resolves by typing into the card or adding a marker via the in-card `InsertSlot`.
- A **field-dirty watcher** sits on each marker row's content field. When the user edits a row, recompute the missing-markers set for that verse and clear the highlight if the structure now matches the reference. This is local per-verse work — recomputing on dirty events is cheap because `parseFormModeEntries` of one verse is bounded.
- This replaces the old "skipped suggestions" popover/cursor flow entirely. The visibility comes from synced cards + danger-color highlights, not a separate list.

### 4. Toolbar trigger for match-formatting

Add a "Match formatting from reference" action to `EditorToolbar.tsx` / `ToolbarOverflowMenu.tsx`:
- If no reference loaded: open the existing `ReferencePicker` (`src/app/ui/components/blocks/ReferencePicker.tsx`) first.
- Once a reference is selected, call `useFormatMatching().matchFormattingChapter()` (already exists, lines 188–254 of the hook). Book/project scope can be exposed as submenu items if desired.
- Reuse `FormatMatchingRunReport` and the existing `setFormatMatchReport` state — already wired through the workspace.

### 5. Auto-switch to form mode when there are leftovers

Edit `useFormatMatching.tsx`:
- Add a callback (or extend the existing `setIsFormatMatchSuggestionsOpen` mechanism) so that after `publishReport`, if `report.suggestions.length > 0`, the workspace switches `editorMode` to `"form"`. If `suggestions.length === 0`, leave the mode untouched. The change should be additive — pass a `setEditorMode` (or equivalent) into the hook from the caller in `ProjectView.tsx` / `WorkspaceShell.tsx`.
- **Drop the cursor-insert resolution path entirely.** Remove `applyMatchFormattingSuggestion` (lines 443–482) and stop importing `insertParagraphMarkerAtCursor`. Disambiguation happens in form mode through visible verse cards and inline marker `InsertSlot`s — no cursor placement, no popover, no implicit position.
- If `insertParagraphMarkerAtCursor` has no other callers after this change, delete it. Otherwise leave it for unrelated regular-mode usage but stop calling it from the suggestion flow.
- The `SkippedMarkerSuggestion[]` from `FormatMatchingRunReport` is no longer rendered as a list. It is consumed only as a *signal* that there is work to do (auto-switch to form mode). The actual missing-marker presentation comes from the per-verse reference-vs-source diff in §3a, which stays accurate as the user edits.

### 6. Synced reference rendering in form mode

Modes are already synced between source and reference editors. Extend that:
- When `editorMode === "form"`, the **reference editor** (`ReferenceEditor.tsx`) also renders via `FormModeChapter` (or a read-only variant). The reference cards mirror the source cards verse-by-verse so the user can scan side-by-side.
- In the reference cards, highlight the marker rows that are **present in the reference but missing from the source** using the same danger/error color (matching the source-side highlight) — this is the visual affordance for "here is the poetry-level-2 marker you still need to deal with for this verse." It uses the same per-verse comparison computed in §3a.
- Reference cards are read-only (no `InsertSlot`, no editable content) — they exist only as a structural reference.

## Files to create

- `src/app/domain/editor/utils/formModeEntries.ts`
- `src/app/ui/components/blocks/FormModeChapter.tsx`
- `src/app/ui/styles/modules/formModeChapter.css.ts`

## Files to modify

- `src/app/data/editor.ts` — add `form` to `EditorModeSetting` / `EDITOR_MODES`.
- `src/app/ui/hooks/useFormatMatching.tsx` — accept a `setEditorMode` prop; auto-switch to `"form"` when `suggestions.length > 0`.
- `src/app/ui/components/primitives/EditorToolbar/EditorToolbar.tsx` and `ToolbarOverflowMenu/ToolbarOverflowMenu.tsx` — add "Match formatting from reference" action; add form-mode entry to mode switcher.
- `src/app/ui/components/blocks/Editor.tsx` (and `NestedEditor.tsx` / `ReferenceEditor.tsx` as needed) — render `FormModeChapter` when `editorMode === "form"`.
- `src/app/domain/editor/utils/modeTransforms.ts` — handle `form` mode transitions.
- `src/app/ui/components/views/ProjectView.tsx` / `layout/WorkspaceShell.tsx` — pass `setEditorMode` into `useFormatMatching`; expose toolbar action wiring.
- `src/app/ui/i18n/locales/en/messages.ts` (and `es/`) — strings for "Match formatting from reference", "Form mode", "Needs placement", marker labels not yet localized. Run lingui compile after.

## Reuse (do not reimplement)

- `matchFormattingByVerseAnchors` and `useFormatMatching` — algorithm + orchestration are done.
- `lexicalRootChildrenToUsfmTokenStream` / `usfmTokenStreamToLexicalRootChildren` — token bridge.
- `BookFrontmatterForm.tsx` + `bookFrontmatterEntries.ts` — direct templates for the form UI and entry adapter.
- `getLocalizedUsfmMarkerLabel` / `getLocalizedUsfmMarkerDescription` — marker i18n.
- `ReferencePicker.tsx` — reference selection.
- `FormatMatchingRunReport` (`src/app/ui/data/formatMatching.ts`) — already the right shape for tracking unplaced markers.

## Verification

1. Build and start the dev server.
2. Open a project with a target USFM file and pick a well-formatted reference (e.g., a major-language Bible) via `ReferencePicker`.
3. Run **Match formatting from reference** from the toolbar; confirm a notification appears and inserted markers show in regular-mode editor.
4. Pick a chapter where the reference has intra-verse `\q1`/`\q2` markers; run match formatting; confirm the editor switches into form mode with the affected verse cards highlighted in the danger color, the in-card "Missing: …" indicator listing the missing markers, and the synced reference editor showing the same verses with the corresponding marker rows highlighted.
5. Resolve a missing marker by adding it via the in-card `InsertSlot` (or by editing the verse content so the structure matches); confirm the source verse card's danger highlight clears, the corresponding reference highlight clears, and switching back to regular mode shows correct USFM.
6. Manually toggle into form mode (no match-formatting run) and confirm round-trip: form mode → regular → form yields no diff in `currentTokens`.
7. Run match formatting where everything places cleanly; confirm the editor mode does *not* switch.
8. Without running match-formatting, switch to form mode manually and use a between-card `InsertSlot` to insert a `\p`; confirm a new paragraph row appears, the chapter round-trips back to regular mode, and the inserted marker is in the correct USFM position. Repeat with an intra-card `InsertSlot` adding a `\q1` inside an existing verse.
9. Run unit/integration tests: `npm test` (or project equivalent) to ensure token-bridge invariants and existing match-formatting tests still pass. Add tests for `parseFormModeEntries` / `serializeFormModeEntries` round-trip and for both `InsertSlot` flavors (intra-verse and between-verse) producing valid token streams.
