# Find and Replace

## What this feature does

- Searches across the loaded project (all books and chapters currently in memory).
- Finds matches by SID-scoped text segments so results can jump to exact scripture locations.
- Supports:
  - Match case
  - Whole word
  - Include USFM markers in search text
  - Searching your reference project
- Supports replacement actions:
  - Replace current selected match
  - Replace next match per result row
- Supports result sorting:
  - Canonical order
  - Case mismatches first

## How to access it in the app

- In a project, click the search icon in the top toolbar.
- Keyboard shortcuts:
  - `Cmd/Ctrl + F`: open search and focus input
  - `Escape`: close search panel
- Desktop: side panel.
- Mobile: bottom drawer.

## Typical user flow

1. Open search (`Cmd/Ctrl + F` or toolbar icon).
2. Enter a query.
3. Optionally enable `Match Case`, `Whole Word`, or `Include USFM markers`.
4. Click a result to jump the editor to that book/chapter and highlight a match.
5. Enter replacement text and use `Replace` (current match) or
   `Replace next match` on a specific result row.
6. Use `Review & Save` to persist changes to disk.

## Current limits and non-goals

- **No project-wide "Replace All"** affordance. The blast radius of a
  single-click replace across every chapter was judged too easy to mess
  up unknowingly, so the UI exposes only one-match-at-a-time replacement.
  (The `replaceAllInChapter` action also no longer exists in the hook
  layer; intentionally removed to avoid being mis-wired into the UI
  later without a UX review.)
- Search runs against working in-memory content; changes are not written to disk until save.
- Replacement is literal text replacement in matched text nodes (no regex replace workflow).
- This is not a linguistic concordance or morphology search tool.

## Highlight architecture (drift-free)

Highlight painting was previously imperative: each search call site called
the highlighter directly. When the structure-maintenance pipeline or a
chapter swap moved Lexical nodes between paints, the painted decorations
drifted away from where matches actually lived.

The current architecture decouples _what should be highlighted_ from
_when to repaint_:

- **`SearchHighlightStore`** (`src/app/state/SearchHighlightStore.ts`) holds
  the current `SearchHighlightInput[] | null`. Search hooks (execution,
  navigation, replace) publish via `set(...)` whenever the query or active
  match changes; `clear()` removes all highlights.
- **`HighlightSink`** (`src/app/domain/editor/plugins/HighlightSink.tsx`)
  subscribes to both the store **and** `LayoutTickStore` (via
  `useLayoutTick`) and repaints in `useLayoutEffect`. The layout tick is
  bumped by `overlayTickPipeline` after commits and by workspace-level
  scroll / resize listeners, so highlights stay in lockstep with the live
  DOM.

Search reads `currentTokens` directly from each `ScriptureChapterState` via
`tokensToLexical` in flat mode (`chapterFlatChildren` in `SearchService.ts`).
This is mode-independent: the flat token projection carries every token's
`sid` and text regardless of whether the editor is in regular, form, or flat
shape. A separate Lexical in-editor scan (`collectMatchesInCurrentEditor`)
handles the active-chapter highlight matches — it runs against the live editor
tree so caret positions are exact.

Replace operations mutate Lexical directly in `editor.update()`, then
re-run `runSearchLogic()` so the result list and highlights stay
consistent with the new content.

For changes that don't go through the search hooks' own replace path
(`undo` / `redo`, `programmaticFix`, `import`), `makeSearchRerunPipeline`
subscribes to `workingFilesStore.changes` and re-runs the current query
through a 250 ms debounce. The policy lives in `isSearchRerunRelevant`
inside the same module — narrower than `isSaveStatusRelevant`: `userEdit`
is intentionally excluded because (a) the replace path already re-runs
synchronously after its own commit and (b) the search panel occupies
the workspace surface, so per-keystroke auto-rerun would re-tokenize
the project for results nobody is reading.

**Known gap (2026-05-20):** in some flows the e2e tests have observed
the search count not refreshing after an undo even with a manual
`Enter` re-submit, while the editor itself IS restored. The policy +
mechanism are pinned by `searchRerunPipeline.test.ts` (23 cases) at
the seam we control; the deeper state-sync gap between
`workingFilesStore.read()` and the search execution's
`getTargetFiles` snapshot needs runtime instrumentation to diagnose
and is tracked as a follow-up. The e2e assertion for the user-visible
contract (undo restores editor text) is in
`tests/e2e/editor-history.spec.ts` under the two "reruns search …"
tests.

## Key modules (for agents)

- `src/app/ui/components/views/search-panel/SearchPanel.tsx`
- `src/app/ui/components/views/search-panel/SearchControls.tsx`
- `src/app/ui/components/views/search-panel/SearchResults.tsx`
- `src/app/ui/components/views/search-panel/SearchResultItem.tsx`
- `src/app/ui/hooks/useSearch.tsx`
- `src/app/ui/hooks/search/useSearchExecution.ts`
- `src/app/ui/hooks/search/useSearchNavigation.ts`
- `src/app/ui/hooks/search/useSearchReplace.ts`
- `src/app/ui/hooks/useSearchHighlighter.ts`
- `src/app/state/SearchHighlightStore.ts`
- `src/app/domain/editor/plugins/HighlightSink.tsx`
- `src/app/domain/editor/pipelines/searchRerunPipeline.ts`
- `src/app/domain/search/search.utils.ts`
