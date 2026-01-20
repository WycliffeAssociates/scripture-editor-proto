### 5. Test IDs Refactoring

```markdown:plans/current/2026-01-12-refactor-testing-ids.md
# Refactor Plan: Hardened Test IDs

## Context
Test IDs are currently a mix of constants (`TESTING_IDS`) and ad-hoc string concatenation (e.g., `data-testid={`project-list-item-${name}`} `). This makes tests brittle and refactoring UI components dangerous.

## Objective
Centralize all dynamic Test ID generation in `src/app/data/constants.ts` and enforce usage across the app.

## Proposed Changes

### 1. Update `src/app/data/constants.ts`
Add a `TEST_ID_GENERATORS` object:

```typescript
export const TEST_ID_GENERATORS = {
    projectListItem: (name: string) => 
        `project-list-item-${name.toLowerCase().replace(/\s+/g, "-")}`,
    
    bookChapterBtn: (book: string, chap: number) => 
        `book-control-${book.toLowerCase()}-${chap}`,
    
    // ... add others found during scan
}
```
2. Refactor Components
Scan for template literals in data-testid attributes and replace them.
Targets:
src/app/ui/components/primitives/ProjectList/ProjectList.tsx
src/app/ui/components/blocks/ReferencePicker.tsx
src/app/ui/components/blocks/DiffModal.tsx (if any dynamic IDs)
3. Refactor E2E Tests
Update src/test/e2e/**/*.spec.ts to import and use TEST_ID_GENERATORS instead of reconstructing strings manually.
Implementation Steps
Scan Codebase: Grep for data-testid={.
Identify Patterns: List all dynamic ID patterns.
Update Constants: Implement generators in constants.ts.
Apply to App: Update React components.
Apply to Tests: Update Playwright tests.
