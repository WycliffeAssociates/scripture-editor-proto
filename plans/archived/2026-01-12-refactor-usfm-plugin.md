# Refactor Plan: Decompose USFMPlugin

## Context
The `USFMPlugin.tsx` component has become a "God Object" responsible for too many distinct concerns: linting, document structure maintenance, input handling, view updates, and cleanup coordination. This makes it hard to read, test, and maintain.

## Objective
Split `USFMPlugin` into smaller, focused custom hooks that manage their own Lexical listeners.

## Proposed Structure
Create a new directory: `src/app/domain/editor/hooks/`

### 1. `src/app/domain/editor/hooks/useEditorLinter.ts`
**Responsibility:** Handling linting logic.
**Logic to Move:**
- `debouncedLint`
- `editor.registerUpdateListener` call that triggers linting.
- Dependencies: `lint`, `editor`, `actions.getFlatFileTokens`.

### 2. `src/app/domain/editor/hooks/useEditorStructure.ts`
**Responsibility:** Maintaining document structure (schema enforcement) and metadata.
**Logic to Move:**
- `debouncedStructuralUpdates`
- `throttledEditorChangeListener`
- `editor.registerUpdateListener` calls for `maintainMetadata` and `maintainDocumentStructure`.
- Dependencies: `project.pickedFile.bookCode`.

### 3. `src/app/domain/editor/hooks/useEditorInput.ts`
**Responsibility:** Handling keyboard commands and transforms.
**Logic to Move:**
- `redirectParaInsertionToLineBreak`
- `KEY_DOWN_COMMAND` listener (`lockImutableMarkersOnType`).
- `KEY_DOWN_COMMAND` listener (`moveToAdjacentNodesWhenSeemsAppropriate`).
- `PASTE_COMMAND` (`lockImmutableMarkersOnPaste`).
- `CUT_COMMAND` (`lockImmutableMarkersOnCut`).
- Node Transforms (`textNodeTransform`, `inverseTextNodeTransform`).

### 4. `src/app/domain/editor/hooks/useEditorView.ts`
**Responsibility:** Handling visual-only updates (WYSIWYG preview toggling).
**Logic to Move:**
- `markersInPreview` ref.
- `editor.registerUpdateListener` for `toggleShowOnToggleableNodes`.
- `syncRefScrollUnregister` (Reference Pane Sync).
- `cursorCorrectionUnregister` (Cursor Correction).

## Implementation Steps

1.  **Create Directory:** `mkdir -p src/app/domain/editor/hooks/`
2.  **Extract `useEditorLinter`**:
    - Copy logic.
    - Export `function useEditorLinter(editor: LexicalEditor)`.
    - Use `useWorkspaceContext` inside the hook or pass deps as props (prefer context for cleaner plugin signature).
3.  **Extract `useEditorStructure`**:
    - Copy throttling/debouncing logic.
    - Export `function useEditorStructure(editor: LexicalEditor)`.
4.  **Extract `useEditorInput`**:
    - Copy command registers and transforms.
    - Export `function useEditorInput(editor: LexicalEditor)`.
5.  **Extract `useEditorView`**:
    - Copy view-related listeners.
    - Export `function useEditorView(editor: LexicalEditor)`.
6.  **Update `USFMPlugin.tsx`**:
    - Remove extracted logic.
    - Call the new hooks.
    - Ensure `useEffect` cleanup is handled correctly (Hooks typically use `useEffect` internally, so the main plugin just calls them).

## Verification
- Run `pnpm test:unit`
- Run `pnpm test.e2e` (specifically editor tests).
- Manual: Verify Linting still appears.
- Manual: Verify markers hide/show correctly.
- Manual: Verify Reference pane scrolls with editor.