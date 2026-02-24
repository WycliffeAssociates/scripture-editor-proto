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

## Key modules (for agents)
- `src/app/ui/components/blocks/Search.tsx`
- `src/app/ui/components/blocks/SearchTrigger.tsx`
- `src/app/ui/hooks/useSearch.tsx`
- `src/app/domain/search/search.utils.ts`
- `src/app/ui/hooks/useSearchHighlighter.ts`
