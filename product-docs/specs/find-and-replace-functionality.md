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
  - Replace all matches in the current chapter
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
5. Enter replacement text and use `Replace` or `Replace all in this chapter`.
6. Use `Review & Save` to persist changes to disk.

## Current limits and non-goals
- `Replace all` is chapter-scoped, not project-wide.
- Search runs against working in-memory content; changes are not written to disk until save.
- Replacement is literal text replacement in matched text nodes (no regex replace workflow).
- This is not a linguistic concordance or morphology search tool.

## Highlight architecture (drift-free)

Highlight painting was previously imperative: each search call site called
the highlighter directly. When the structure-maintenance pipeline or a
chapter swap moved Lexical nodes between paints, the painted decorations
drifted away from where matches actually lived.

The current architecture decouples *what should be highlighted* from
*when to repaint*:

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

Replace operations mutate Lexical directly in `editor.update()`, then
re-run `runSearchLogic()` so the result list and highlights stay
consistent with the new content. After undo/redo, the search panel
re-runs its query via the `useCustomHistory` post-replay hook so results
don't go stale.

## Key modules (for agents)
- `src/app/ui/components/blocks/Search.tsx`
- `src/app/ui/components/blocks/SearchTrigger.tsx`
- `src/app/ui/hooks/useSearch.tsx`
- `src/app/ui/hooks/search/useSearchExecution.ts`
- `src/app/ui/hooks/search/useSearchNavigation.ts`
- `src/app/ui/hooks/search/useSearchReplace.ts`
- `src/app/ui/hooks/useSearchHighlighter.ts`
- `src/app/state/SearchHighlightStore.ts`
- `src/app/domain/editor/plugins/HighlightSink.tsx`
- `src/app/domain/search/search.utils.ts`
