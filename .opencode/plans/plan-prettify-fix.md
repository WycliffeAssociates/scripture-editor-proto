# Plan - Fix Prettify Diff Tracking & Performance

## Context
The "Prettify" feature (Book and Project scopes) allows users to apply formatting rules to USFM files. Currently, when running Prettify against multiple chapters/books, the Diff Modal (Save & Review Changes) only shows one chapter as modified. Additionally, running this on a whole project freezes the UI for several seconds (~6.2s for a whole Bible).

## Root Cause
1. **Consistency**: Stale state in synchronous loops during `prettifyProject`.
2. **UI Freeze**: `batchUpdateChaptersInDiffMap` is a heavy synchronous operation that blocks the main thread.
3. **Rendering Performance**: The Diff Modal renders all changed blocks at once without virtualization, which causes significant lag or crashes for large diff sets.

## Proposed Changes

### 1. Loading Feedback & Unfreezing (`useSave.tsx`, `useWorkspaceState.tsx`)
- Introduce `isProcessing` state in `useWorkspaceState` and expose it via `WorkspaceContext`.
- Refactor `updateDiffMapForChapters` in `useSave.tsx` to:
    - Set `isProcessing(true)`.
    - Use `setTimeout` to defer the calculation, allowing the UI to render a loader.
    - Set `isProcessing(false)` when the batch is finished.

### 2. Virtualization in Diff Modal (`DiffModal.tsx`)
- Implement `@tanstack/react-virtual` in the `DiffViewerModal` to handle large lists of diffs efficiently.
- Use `estimateSize` for variable row heights.

### 3. UI Updates (`Toolbar.tsx`)
- Update the Prettify Project button to show a loading indicator or disable it while `isProcessing` is true.

## Constraints & Tradeoffs
- Complexity: Virtualization adds complexity to the modal implementation.
- Responsiveness: `setTimeout` ensures the browser can paint between the action start and the heavy work.

## Verification Plan
- **Manual Test**:
    1. Open a project with many chapters.
    2. Run "Prettify Project".
    3. Verify that a loader appears.
    4. Verify that the UI does not freeze (main thread stays responsive).
    5. Open "Save & Review Changes" and scroll through many changes smoothly.
