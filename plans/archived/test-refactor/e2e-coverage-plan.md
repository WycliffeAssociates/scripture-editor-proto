# E2E Test Coverage Plan

This document outlines E2E test coverage by feature area, tracking what's covered vs gaps.

## Current E2E Test Files (After Consolidation)
- `editor.spec.ts` - Navigation, reference picker, search, reference project
- `home.spec.ts` - Home page, project import (ZIP/folder), Language API import
- `save.spec.ts` - Save, diff, revert functionality
- `settings.spec.ts` - Settings page (theme, font, language)
- `project-list.spec.ts` - Project listing in drawer
- `context-menu.spec.ts` - Ctrl+K menu, search action
- `lint-popover.spec.ts` - Linting warnings display
- `responsive.spec.ts` - Viewport checks

---

## Feature: Project Import & Management
**Spec**: `product-docs/specs/project-import-and-management.md`

### Critical Flows
- [x] **Import from Language API**: `home.spec.ts` - Language API Importer tests
- [x] **Import from ZIP file**: `home.spec.ts` - "loads project from zip"
- [x] **Import from directory**: `home.spec.ts` - "loads project from unzipped folder"
- [ ] **Naming conflict resolution**: Import project with same name → gets "(1)" suffix
- [x] **Project rename**: `home.spec.ts` - "delete Project removes from ui" (includes rename)
- [x] **Project delete**: `home.spec.ts` - "delete Project removes from ui"
- [x] **Open project**: `project-list.spec.ts` - "navigates to project when clicking project item button"

### Edge Cases
- [ ] Import invalid/corrupted ZIP → shows error, no crash
- [ ] Import empty directory → shows error
- [ ] Import while another import in progress → prevented or queued
- [ ] Delete project while it's open → handled gracefully

---

## Feature: USFM Editor
**Spec**: `product-docs/specs/usfm-editing-modes.md`

### Critical Flows
- [x] **Load chapter**: `editor.spec.ts` - "editor page loads correctly"
- [x] **Edit verse text**: `save.spec.ts` - modifying text flow
- [x] **Navigate chapters**: `editor.spec.ts` - "prev and next buttons update reference picker"
- [x] **Reference picker**: `editor.spec.ts` - Reference Picker Search tests
- [ ] **Regular mode**: Markers hidden, verse text editable, markers locked
- [ ] **USFM mode**: Markers visible, all content editable
- [ ] **Mode switching**: Toggle mode → display updates without losing content

### Navigation Edge Cases
- [x] First chapter of first book → prev button hidden: `editor.spec.ts`
- [x] Last chapter of last book → next button hidden: `editor.spec.ts`
- [x] First chapter of non-first book → prev shows previous book name: `editor.spec.ts`

### Cursor Behavior (Regular Mode)
- [ ] Click on locked marker → cursor moves to nearest editable node
- [ ] Arrow key into locked marker → cursor skips to editable content

---

## Feature: Find & Replace
**Spec**: `product-docs/specs/find-and-replace-functionality.md`

### Critical Flows
- [x] **Basic search**: `editor.spec.ts` - "search shows results for common word"
- [x] **Navigate results**: `editor.spec.ts` - "next button advances match counter"
- [x] **Next/prev buttons**: `editor.spec.ts` - "prev button goes back"
- [x] **Replace single**: `editor.spec.ts` - "replace button replaces text"
- [x] **Replace all in chapter**: `editor.spec.ts` - "replace all button replaces all text"
- [x] **Match case toggle**: `editor.spec.ts` - "match case checkbox toggles"
- [x] **Whole word toggle**: `editor.spec.ts` - "whole word checkbox filters"

### Edge Cases
- [ ] Search with no results → "No results found" message
- [ ] Search with special regex characters → treated as literal text
- [ ] Replace with empty string → text deleted
- [ ] Close search → highlights cleared

---

## Feature: Save, Diff & Revert
**Spec**: `product-docs/specs/save-diff-revert-functionality.md`

### Critical Flows
- [x] **View changes**: `save.spec.ts` - comprehensive save test
- [x] **Diff display**: `save.spec.ts` - checks diff items count
- [x] **Revert single change**: `save.spec.ts` - revert button test
- [x] **Save all**: `save.spec.ts` - save all button test
- [x] **Navigate from diff**: `save.spec.ts` - go to chapter button
- [ ] **Empty state**: No changes → "No changes detected" message

### Edge Cases
- [ ] Out-of-order verses → warning displayed in diff
- [ ] Footnote changes → shown as separate items
- [ ] Revert all changes → diff list empty
- [ ] Save failure (disk full, etc.) → error shown, data not lost

---

## Feature: Reference Text

### Critical Flows
- [x] **Load reference project**: `editor.spec.ts` - "selecting reference project updates reference editor"
- [x] **Sync with editor**: `editor.spec.ts` - verifies book code/chapter sync
- [ ] **Clear reference**: Click clear → reference pane hidden
- [x] **Multiple reference projects**: `editor.spec.ts` - "shows both projects in reference project dropdown"

---

## Feature: Linting & Validation
**Current**: `lint-popover.spec.ts`

### Critical Flows
- [x] **Show lint errors**: `lint-popover.spec.ts` - "opens and closes when clicking trigger button"
- [x] **View lint details**: `lint-popover.spec.ts` - "displays error items with correct structure"
- [x] **Navigate to error**: `lint-popover.spec.ts` - "navigates to DOM element when clicking error item"

---

## Feature: Context Menu
**Current**: `context-menu.spec.ts`

### Critical Flows
- [~] **Right-click in editor**: SKIPPED - browser inconsistency with contenteditable
- [x] **Ctrl+K shortcut**: `context-menu.spec.ts` - "opens on Ctrl+K keyboard shortcut"
- [x] **Find selected text**: `context-menu.spec.ts` - "shows search action when text is selected"
- [x] **Close menu**: `context-menu.spec.ts` - escape key, click outside tests

---

## Feature: Settings
**Current**: `settings.spec.ts`

### Critical Flows
- [x] **Theme toggle**: `settings.spec.ts` - "theme toggle switches between light and dark modes"
- [x] **Font size control**: `settings.spec.ts` - increment/decrement/input/clamp tests
- [x] **Language selector**: `settings.spec.ts` - "language selector changes interface language"
- [ ] **Settings persistence**: Change settings → close/reopen app → settings retained

---

## Feature: Responsive / Mobile
**Current**: `responsive.spec.ts`

### Critical Flows
- [x] **Mobile viewport**: `responsive.spec.ts` - "viewport size matches expected mobile / desktop profile"
- [x] **Page loads**: `responsive.spec.ts` - "homepage loads and returns OK response"
- [ ] **Drawer navigation**: Hamburger menu → drawer opens with project list
- [ ] **Touch interactions**: Buttons/controls work with touch

---

## Feature: Onboarding Tour
**Status**: Not yet implemented

---

## Coverage Summary

### P0 - Critical Path ✅
1. ✅ Full import → edit → save → verify persistence flow (covered by home.spec.ts + save.spec.ts)
2. ✅ Search & replace across project (covered by editor.spec.ts)
3. ✅ Diff, revert, save workflow (covered by save.spec.ts)

### P1 - Important Features (Partial)
4. ✅ Reference text loading and sync
5. ❌ Mode switching (Regular ↔ USFM) - NOT COVERED
6. ✅ Project rename and delete

### P2 - Edge Cases & Polish (Minimal)
7. ❌ Naming conflict resolution on import
8. ❌ Error handling for failed imports
9. ✅ Lint error display
10. ⚠️ Mobile responsive layouts (basic viewport check only)

---

## Gaps for Future Work

### High Priority
- [ ] USFM mode switching tests
- [ ] Settings persistence after reload
- [ ] Search edge cases (no results, special characters)

### Medium Priority
- [ ] Import error handling (invalid ZIP, empty folder)
- [ ] Naming conflict resolution
- [ ] Save failure handling

### Low Priority
- [ ] Cursor behavior with locked markers
- [ ] Mobile drawer navigation
- [ ] Reference clear button
