### 6. Search Logic Separation

```markdown:plans/current/2026-01-12-refactor-search-logic.md
# Refactor Plan: Separate Search Logic from UI

## Context
`useProjectSearch.tsx` is bloated (~400 lines). It mixes:
1.  **Algorithm**: Iterating files, extracting text, regex matching (`findMatch`).
2.  **DOM Interaction**: Scrolling, CSS Highlights API (`highlightAndScrollToMatch`).
3.  **State Management**: React state for results, inputs, etc.

## Objective
Extract pure search logic and DOM manipulation into separate modules.

## Proposed Changes

### 1. Extract Pure Logic (`src/core/domain/search/searchService.ts`)
Move `findMatch`, `escapeRegex`, and `reduceSerializedNodesToText` (and the loop logic if possible) here.

```typescript
export function searchProjectFiles(
    files: ParsedFile[], 
    query: string, 
    options: SearchOptions
): SearchResult[] {
    // Pure function logic
}


Note: Since ParsedFile and SerializedLexicalNode are currently in app types, we might need to place this service in src/app/domain/search/ instead of core to adhere to Hexagonal boundaries, unless we define generic interfaces in core. -> Decision: Put in src/app/domain/search/search.utils.ts to avoid boundary issues for now.
2. Extract DOM Logic (src/app/ui/hooks/useSearchHighlighter.ts)
Move highlightAndScrollToMatch and CSS.highlights management here.

```typescript
export function useSearchHighlighter(editor: LexicalEditor) {
    const clearHighlights = () => CSS.highlights.clear();
    const highlightMatch = (match: MatchInNode, term: string) => { ... };
    return { clearHighlights, highlightMatch };
}
```
3. Simplify useProjectSearch.tsx
Import utils.
Use useSearchHighlighter.
Function should focus on State (inputs, results array) and Orchestration.
Implementation Steps
Create src/app/domain/search/search.utils.ts: Move findMatch, reduceSerializedNodesToText, escapeRegex.
Create src/app/ui/hooks/useSearchHighlighter.ts: Move DOM logic.
Refactor useProjectSearch.tsx:
Remove moved code.
Import and use new modules.
Verification
pnpm test:unit: Verify search utils.
pnpm test.e2e: Verify search functionality works in the UI.