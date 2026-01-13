# E2E Test Coverage Plan

This document outlines the high-level E2E flows that should be tested, organized by feature area. Based on specs in `product-docs/specs/` and current E2E tests in `src/test/e2e/`.

## Current E2E Test Files
- `editor.spec.ts` - Navigation, reference picker, search
- `home.spec.ts` - Home page
- `save.spec.ts` - Save functionality
- `settings.spec.ts` - Settings page
- `project-list.spec.ts` - Project listing
- `context-menu.spec.ts` - Right-click context menu
- `lint-popover.spec.ts` - Linting warnings
- `responsive.spec.ts` - Mobile/responsive layouts
- `language-importer.spec.ts` - Language API import

---

## Feature: Project Import & Management
**Spec**: `product-docs/specs/project-import-and-management.md`

### Critical Flows
- [ ] **Import from Language API**: Search language → select repo → download → project appears in list
- [ ] **Import from ZIP file**: Select ZIP → import → project appears in list
- [ ] **Import from directory**: Select folder → import → project appears in list
- [ ] **Naming conflict resolution**: Import project with same name → gets "(1)" suffix
- [ ] **Project rename**: Click edit → change name → save → name persists
- [ ] **Project delete**: Click delete → confirm → project removed from list and disk
- [ ] **Open project**: Click project → navigates to editor with correct book/chapter

### Edge Cases
- [ ] Import invalid/corrupted ZIP → shows error, no crash
- [ ] Import empty directory → shows error
- [ ] Import while another import in progress → prevented or queued
- [ ] Delete project while it's open → handled gracefully

---

## Feature: USFM Editor
**Spec**: `product-docs/specs/usfm-editing-modes.md`

### Critical Flows
- [ ] **Load chapter**: Open project → select book/chapter → content displays correctly
- [ ] **Edit verse text**: Click in verse → type → text appears
- [ ] **Navigate chapters**: Click next/prev → chapter changes, content updates
- [ ] **Reference picker**: Click picker → select book → select chapter → navigates
- [ ] **Regular mode**: Markers hidden, verse text editable, markers locked
- [ ] **USFM mode**: Markers visible, all content editable
- [ ] **Mode switching**: Toggle mode → display updates without losing content

### Navigation Edge Cases
- [ ] First chapter of first book → prev button hidden
- [ ] Last chapter of last book → next button hidden
- [ ] First chapter of non-first book → prev shows previous book name

### Cursor Behavior (Regular Mode)
- [ ] Click on locked marker → cursor moves to nearest editable node
- [ ] Arrow key into locked marker → cursor skips to editable content

---

## Feature: Find & Replace
**Spec**: `product-docs/specs/find-and-replace-functionality.md`

### Critical Flows
- [ ] **Basic search**: Type term → results appear across project
- [ ] **Navigate results**: Click result → editor navigates to that verse
- [ ] **Next/prev buttons**: Cycle through matches in current chapter
- [ ] **Replace single**: Enter replacement → click replace → text updated
- [ ] **Replace all in chapter**: Click replace all → all matches in chapter updated
- [ ] **Match case toggle**: Enable → only exact case matches shown
- [ ] **Whole word toggle**: Enable → partial word matches excluded

### Edge Cases
- [ ] Search with no results → "No results found" message
- [ ] Search with special regex characters → treated as literal text
- [ ] Replace with empty string → text deleted
- [ ] Close search → highlights cleared

---

## Feature: Save, Diff & Revert
**Spec**: `product-docs/specs/save-diff-revert-functionality.md`

### Critical Flows
- [ ] **View changes**: Edit text → open Review & Save → changes listed
- [ ] **Diff display**: Modified verses show before/after with highlighting
- [ ] **Revert single change**: Click revert → that verse restored, others remain
- [ ] **Save all**: Click save → all changes persisted to disk
- [ ] **Navigate from diff**: Click verse in diff list → editor navigates there
- [ ] **Empty state**: No changes → "No changes detected" message

### Edge Cases
- [ ] Out-of-order verses → warning displayed in diff
- [ ] Footnote changes → shown as separate items
- [ ] Revert all changes → diff list empty
- [ ] Save failure (disk full, etc.) → error shown, data not lost

---

## Feature: Reference Text
**Spec**: `product-docs/plans/current/2026-01-08-reference-text-search-design.md`

### Critical Flows
- [ ] **Load reference project**: Select reference from dropdown → reference pane shows content
- [ ] **Sync with editor**: Navigate in editor → reference pane updates to same verse
- [ ] **Clear reference**: Click clear → reference pane hidden
- [ ] **Multiple reference projects**: Switch between different reference texts

### Future (per spec)
- [ ] Search in reference text → results show reference matches
- [ ] Navigate from reference result → editor goes to that verse in target

---

## Feature: Linting & Validation
**Current**: `lint-popover.spec.ts`

### Critical Flows
- [ ] **Show lint errors**: Content with issues → lint icon appears
- [ ] **View lint details**: Click lint icon → popover shows error details
- [ ] **Multiple errors**: Multiple issues → all shown in popover

---

## Feature: Context Menu
**Current**: `context-menu.spec.ts`

### Critical Flows
- [ ] **Right-click in editor**: Context menu appears with actions
- [ ] **Find selected text**: Select text → right-click → "Find" → search opens with term
- [ ] **Copy/paste**: Standard clipboard operations work

---

## Feature: Settings
**Current**: `settings.spec.ts`

### Critical Flows
- [ ] **Open settings**: Click settings → settings page/modal opens
- [ ] **Editor mode toggle**: Switch mode → persists, editor updates
- [ ] **Font size control**: Adjust size → editor text resizes
- [ ] **Zoom control**: Adjust zoom → UI scales
- [ ] **Settings persistence**: Change settings → close/reopen app → settings retained

---

## Feature: Responsive / Mobile
**Current**: `responsive.spec.ts`

### Critical Flows
- [ ] **Mobile viewport**: UI adapts to narrow width
- [ ] **Drawer navigation**: Hamburger menu → drawer opens with project list
- [ ] **Touch interactions**: Buttons/controls work with touch
- [ ] **Search on mobile**: Search panel works in mobile layout

---

## Feature: Onboarding Tour
**Spec**: `product-docs/plans/current/2025-01-07-onboarding-tour-design.md`
**Status**: May not be implemented yet

### Critical Flows (when implemented)
- [ ] **First launch**: Fresh install → tour prompt appears
- [ ] **Accept tour**: Click "Yes" → tour starts, steps highlight elements
- [ ] **Decline tour**: Click "No" → tour dismissed, app usable
- [ ] **Complete tour**: Navigate all steps → tour completes with success message
- [ ] **Skip tour**: Click skip at any point → tour dismissed
- [ ] **Restart tour**: Settings → "Retake Tour" → tour restarts

---

## Priority for New E2E Tests

### P0 - Critical Path (Must Have)
1. Full import → edit → save → verify persistence flow
2. Search & replace across project
3. Diff, revert, save workflow

### P1 - Important Features
4. Reference text loading and sync
5. Mode switching (Regular ↔ USFM)
6. Project rename and delete

### P2 - Edge Cases & Polish
7. Naming conflict resolution on import
8. Error handling for failed imports
9. Lint error display
10. Mobile responsive layouts

---

## Notes for Implementation

- Use existing fixtures pattern from `src/test/e2e/fixtures.ts`
- Prefer `getByRole`, `getByText` over `getByTestId` where possible
- Use `TESTING_IDS` constants for stable selectors
- Each test should be independent (no shared state between tests)
- Consider creating page object pattern for complex pages (Editor, Search)
