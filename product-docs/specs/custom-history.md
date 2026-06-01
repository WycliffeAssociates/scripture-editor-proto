# Custom History (Mode-Agnostic Undo/Redo)

## What this feature does
- Replaces Lexical-only chapter history with a workspace-wide history stack.
- Stores history using canonical flat-token chapter snapshots so undo/redo
  does not depend on editor mode (`regular`/`usfm`/`plain`/`form`).
- Supports mixed edit sources:
  - Direct typing in the current chapter
  - Programmatic chapter/book/project operations (format, find/replace,
    lint autofix, revert, mode switch)
- Allows user-facing labels per entry (`Format Project`, `Replace
  (Inline Match)`, etc.) for better undo/redo intent.
- Restores cursor position across undo/redo by stable `data-id`, surviving
  Lexical key regeneration.

## Core abstraction
- Canonical snapshot is `direction + flatNodes` (flattened token stream from
  Lexical root children).
- History entry contains:
  - `label`, `source`, `timestamp`
  - `changes[]` where each change has `{ chapterRef, before, after }`
  - captured `selectionBefore` / `selectionAfter` (data-id–keyed) for the
    current chapter so the cursor can land naturally on replay.
- This keeps core history independent of chapter projection and editor mode
  wrappers.

## Capture model
- **Typing**: `CustomHistoryPlugin` listens to editor updates and records
  chapter diffs through `history.captureEditorUpdate`. Typing entries are
  coalesced within a 2500 ms window so a continuous typing run is a single
  entry.
- **Programmatic actions**: features must opt in by wrapping mutations in
  `history.runTransaction({ label, candidates, run })`.
- **Merge path**: programmatic guardrail updates tagged with
  `HISTORY_MERGE_TAG` merge into the latest typing entry so undo does not
  discard guardrail work.
- **Ignore path**: `programaticIgnore` changes are not pushed as new
  entries, but baselines still update so later diffs remain correct.

## Replay path

Replay is the only path in the codebase outside the bridge that commits a
`bulk` patch with project scope. The shape is:

```
HistoryManager.undo() / redo()
  ▼
applyEntry(action, direction, …)
  ├── workingFilesStore.draftWithChapters([…every chapter the entry touches…])
  ├── for each touched chapter:
  │       canonicalSnapshotToChapterState(snapshot, currentMode)
  │       markChapterDirty                                      // re-derives dirty flag
  ├── workingFilesStore.commit({ kind: "bulk", files: draft },
  │                            { kind: "undo" | "redo",
  │                              scope: { project: true },
  │                              dirtyTextContent: true })
  ├── (if visible chapter touched) refreshVisibleEditorIfTouched
  │       setEditorContent(editor, …, tag = programaticIgnore)
  │       schedule restore fiber (50 ms sleep) → focus, restore selection,
  │                                              restore scroll
  └── notify post-undo/redo listeners
```

**Why `draftWithChapters` and not `structuredClone`:** Project-scope
deep-clone was ~1.5 s per undo on Psalm 119. Structural sharing produces
the exact identities needed at the commit boundary: touched chapters get
new refs (so `React.memo` / `useMemo` invalidate where they should), every
other chapter stays the same reference (so they don't re-render at all).
See `state-architecture.md` for the full Copy-on-Write contract.

**Why a deferred restore fiber:** Pushing content into Lexical via
`setEditorContent`, focusing the editor, restoring selection, and
restoring scroll position all happen synchronously. Doing them in one
frame produces a visible scroll jump (Lexical reconciliation re-flows
the editor before our scroll restore runs). A 50 ms `Effect.sleep` lets
Lexical reconcile first; then focus → selection → scroll lands cleanly.
The fiber is held in a ref; rapid back-to-back undos interrupt the
in-flight restore (`Fiber.interrupt`) and reschedule, so only the last
entry's restore actually runs.

**Cursor restoration by `data-id`:** Lexical regenerates node keys on
every `parseEditorState`, so any selection captured by `NodeKey` cannot
survive replay. The history layer captures selection by walking the
selection's anchor / focus nodes and reading their `data-id` attributes
(`USFMTextNode.__dataId`), plus offsets. On restore, a DFS over the
fresh Lexical tree finds the matching node by id, clamps the offset to
the text length, and applies a `RangeSelection`. If the node was
deleted by the change being replayed, restore falls back to the editor's
default cursor.

## Notification rules
- No toast when only the current chapter is affected (normal local edit
  UX).
- Toast when exactly one non-current chapter is affected (`Undid/Redid
  last edit in <Book> <Chapter>`).
- Aggregate toast for multi-chapter operations (`Affected N chapters`).
- Current chapter keeps immediate typing continuity after undo/redo
  (editor stays ready for input).

## Instrumentation contract (manual opt-in)
- Any feature that commits across chapters must use `runTransaction` (the
  hook captures the before-snapshot of `candidates`, runs the
  programmatic flow, and records the diff as one history entry).
- Supply the smallest accurate candidate set (`chapter` / `book` /
  `project`) to avoid over-capturing.
- Set explicit labels:
  - `setNextTypingLabel(...)` for the next typing-derived entry (e.g.
    find/replace).
  - `runTransaction({ label: ... })` for programmatic batches.
- If a mutator is not wrapped, undo/redo will not represent that
  operation.

## Post undo/redo hook
- `useCustomHistory` exposes `registerPostUndoRedoAction(listener)`.
- Listener receives:
  - `action`: `"undo" | "redo"`
  - `label`: the history entry label
  - `touchedChapters`: deduped chapter refs `{ bookCode, chapterNumber }`
- Return value is an unsubscribe function; register inside `useEffect`
  and return cleanup.
- This is the supported way for dependent UI to react after stack
  replay. Two consumers in-tree today:
  - `WorkspaceContext` re-lints just the touched books (the main lint
    pipeline filters `undo`/`redo` out, so this is how lint stays in
    sync after replay).
  - Search panel re-runs the query so the result list / highlights
    aren't stale after undo/redo.

### Example usage pattern
- In a consumer hook/component:
  - `useEffect(() => history.registerPostUndoRedoAction((event) => { ... }), [history])`
  - Gate work with local UI state (`isPanelOpen`, `searchTerm`, etc.) before
    re-running expensive logic.

## Performance notes
- Replay cost is dominated by `canonicalSnapshotToChapterState`
  (re-parsing the snapshot into Lexical state). The bulk-commit itself
  is O(touched chapters), and React rerender is O(touched chapters)
  because untouched chapter references are preserved.
- Dev-only perf tracing (gated by `import.meta.env.DEV`) logs the
  draft+commit phase and the restore phase. Tree-shaken in prod.

## Testing scope
- Unit:
  - `HistoryManager` coalescing, merge behavior, transaction entries,
    metadata propagation.
  - Undo/redo notification target selection logic.
- Integration:
  - Canonical snapshot mode-agnostic equivalence and round-trip
    expectations.
- E2E:
  - Typing undo/redo smoke path.
  - Off-screen chapter undo notification behavior.
  - Post-undo immediate typing continuity.
  - Cursor restoration after undo (data-id resolution).

## Key modules (for agents)
- `src/app/domain/history/HistoryManager.ts`
- `src/app/domain/history/canonicalChapterState.ts`
- `src/app/domain/history/historyUndoRedoNotifications.ts`
- `src/app/domain/editor/plugins/CustomHistoryPlugin.tsx`
- `src/app/ui/hooks/useCustomHistory.ts`
- `src/app/ui/components/primitives/HistoryButton.tsx`
