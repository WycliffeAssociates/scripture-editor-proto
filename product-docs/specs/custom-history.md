# Custom History (Mode-Agnostic Undo/Redo)

## What this feature does
- Replaces Lexical-only chapter history with a workspace-wide history stack.
- Stores history using canonical flat-token chapter snapshots so undo/redo does not depend on editor mode (`regular`/`usfm`/`plain`).
- Supports mixed edit sources:
  - Direct typing in the current chapter
  - Programmatic chapter/book/project operations (format, find/replace, lint autofix, revert)
- Allows user-facing labels per entry (`Format Project`, `Replace all`, etc.) for better undo/redo intent.

## Core abstraction
- Canonical snapshot is `direction + flatNodes` (flattened token stream from lexical root children).
- History entry contains:
  - `label`, `source`, `timestamp`
  - `changes[]` where each change has `{ chapterRef, before, after }`
  - optional current-chapter cursor/editor metadata for better UX on undo/redo
- This keeps core history independent of chapter projection and editor mode wrappers.

## Capture model
- **Typing**: `CustomHistoryPlugin` listens to editor updates and records chapter diffs through `history.captureEditorUpdate`.
- **Programmatic actions**: features must opt in by wrapping mutations in `history.runTransaction({ label, candidates, run })`.
- **Merge path**: programmatic guardrail updates tagged with `historyMerge` merge into the latest typing entry so undo does not discard guardrail work.
- **Ignore path**: `programaticIgnore` changes are not pushed as new entries, but baselines still update so later diffs remain correct.

## Undo/redo behavior
- Undo/redo applies chapter `before`/`after` snapshots back to `mutWorkingFilesRef`.
- Current chapter editor view is refreshed from updated working chapter state.
- Notification rules:
  - No toast when only the current chapter is affected (normal local edit UX).
  - Toast when exactly one non-current chapter is affected (`Undid/Redid last edit in <Book> <Chapter>`).
  - Aggregate toast for multi-chapter operations (`Affected N chapters`).
- Current chapter keeps immediate typing continuity after undo/redo (editor stays ready for input).

## Instrumentation contract (manual opt-in)
- Any feature that mutates `mutWorkingFilesRef` across scope must use `runTransaction`.
- Supply the smallest accurate candidate set (`chapter` / `book` / `project`) to avoid over-capturing.
- Set explicit labels:
  - `setNextTypingLabel(...)` for the next typing-derived entry (e.g. find/replace).
  - `runTransaction({ label: ... })` for programmatic batches.
- If a mutator is not wrapped, undo/redo will not represent that operation.

## Post undo/redo hook
- `useCustomHistory` exposes `registerPostUndoRedoAction(listener)`.
- Listener receives:
  - `action`: `"undo" | "redo"`
  - `label`: the history entry label
  - `touchedChapters`: deduped chapter refs `{ bookCode, chapterNum }`
- Return value is an unsubscribe function; register inside `useEffect` and return cleanup.
- This is the supported way for dependent UI to react after stack replay (example: search panel re-runs query so result list/highlights are not stale after undo/redo).

### Example usage pattern
- In a consumer hook/component:
  - `useEffect(() => history.registerPostUndoRedoAction((event) => { ... }), [history])`
  - Gate work with local UI state (`isPanelOpen`, `searchTerm`, etc.) before re-running expensive logic.

## Testing scope
- Unit:
  - `HistoryManager` coalescing, merge behavior, transaction entries, metadata propagation.
  - Undo/redo notification target selection logic.
- Integration:
  - Canonical snapshot mode-agnostic equivalence and round-trip expectations.
- E2E:
  - Typing undo/redo smoke path.
  - Off-screen chapter undo notification behavior.
  - Post-undo immediate typing continuity.

## Key modules (for agents)
- `src/app/domain/history/HistoryManager.ts`
- `src/app/domain/history/canonicalChapterState.ts`
- `src/app/domain/history/historyUndoRedoNotifications.ts`
- `src/app/domain/editor/plugins/CustomHistoryPlugin.tsx`
- `src/app/ui/hooks/useCustomHistory.ts`
- `src/app/ui/components/primitives/HistoryButton.tsx`
