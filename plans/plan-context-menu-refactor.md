# Plan: Context Menu & Action Palette Refactor

## Overview
Rework the existing `NodeContextMenuPlugin` to separate editor logic from UI concerns, improve accessibility/UX, and support complex multi-step actions (like structural editing). The goal is to move toward a "programmatic" editor where all operations are pure functions that can be invoked via this context menu or a Cmd+K palette.

## Architecture

### 1. Action Registry (`src/app/domain/editor/actions/`)
- Extract logic from `ContextMenuPlugin.tsx` into standalone functions.
- **Action Interface**:
  ```typescript
  interface EditorAction {
    id: string;
    label: string;
    category: string;
    icon?: ReactNode;
    isVisible: (context: EditorContext) => boolean;
    execute: (editor: LexicalEditor, context: EditorContext) => void | ActionStep;
  }
  ```
- **ActionStep**: For multi-step flows, an action can return a "step" definition which the UI uses to transition (e.g., showing a "pill" for the current context and an input for the next value).

### 2. Editor Context
- A single `editor.read()` call when the menu opens to gather:
  - Current selection (Lexical and Native).
  - Node hierarchy at the cursor.
  - Metadata (current verse, paragraph marker, etc.).
  - Selected text for search suggestions.

### 3. UI Layer
- **Component**: Use Mantine `Combobox` for the searchable list.
- **Styling**: Vanilla Extract for custom "palette" look.
- **Positioning**: 
  - Desktop: Near cursor/selection.
  - Mobile: Centered on screen.
- **Keyboard**: Full support for Arrow keys, Enter (execute/next), and Escape (close/back).

## Data Flow
1. User triggers menu (Right-click or Cmd+K).
2. Plugin gathers `EditorContext`.
3. `useContextMenuActions` hook filters the Registry based on context.
4. UI renders the filtered list.
5. User searches/selects an action.
6. Action executes (or transitions to next step).

## Success Criteria
- [ ] Logic is separated from UI (no USFM node manipulation inside the React component).
- [ ] Menu is searchable and keyboard-navigable.
- [ ] Supports multi-step actions (e.g., changing a verse number) with "pilled" UI.
- [ ] Mobile-friendly positioning and interaction.
- [ ] **E2E Tests Pass**:
    - [ ] Opens on Right-click.
    - [ ] Opens on Cmd+K.
    - [ ] Search input is automatically focused on open.
    - [ ] Major actions (Insert Marker, Mode Switch) work as expected.
    - [ ] Multi-step actions correctly transition to the "pilled" state.
