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
- **Programmatic actions**: features opt in by bracketing the mutation with
  `history.captureHistory()` (call it *before* the verb — it retains the
  pre-commit files array as pre-images) and `history.recordHistory(token,
  { label, affected })` (*after* the verb commits — it diffs the `affected`
  chapters the commit measured against the captured pre-images and pushes one
  entry). No candidate set is declared up front; `recordHistory` records exactly
  the measured `affected` chapters.
- **Merge path**: programmatic guardrail updates tagged with
  `HISTORY_MERGE_TAG` merge into the latest typing entry so undo does not
  discard guardrail work.
- **Ignore path**: `programaticIgnore` changes are not pushed as new
  entries, but baselines still update so later diffs remain correct.

## Replay path

Replay is the only path in the codebase outside the bridge that commits a
`bulk` patch scoped to exactly the chapters the entry touches. The shape is:

```
HistoryManager.undo() / redo()
  ▼
applyEntry(action, direction, …)
  ├── workingFilesStore.draftWithChapters([…every chapter the entry touches…])
  ├── for each touched chapter:
  │       chapter.currentTokens = canonicalSnapshotToTokens(targetSnapshot)
  │       markChapterDirty                                      // re-derives dirty flag
  ├── workingFilesStore.commit({ kind: "bulk", files: draft },
  │                            { kind: "undo" | "redo",
  │                              scope: { chapters: dedupeChapterRefs(touched) },
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

- Any feature that commits across chapters must bracket the mutation with
  `captureHistory()` / `recordHistory(token, { label, affected })` (capture
  retains the pre-commit pre-images, record diffs the measured `affected`
  chapters against them and pushes one entry).
- No candidate set is declared: `recordHistory` records exactly the chapters
  the commit measured as `affected`, so the entry can never over-capture.
- Set explicit labels:
  - `setNextTypingLabel(...)` for the next typing-derived entry (e.g.
    find/replace).
  - `recordHistory(token, { label })` for programmatic batches.
- If a mutation is not bracketed by capture/record, undo/redo will not
  represent that operation.

## Post undo/redo reactions

Undo/redo commits carry `kind: "undo"` or `kind: "redo"` in their
`CommitEvent.meta`. Dependent pipelines subscribe to
`WorkingFilesStore.changes` and react in the normal way:

- **Lint** (`lintScopeFor` in `commitFilters.ts`) does **not** exclude
  `undo`/`redo` — replay commits carry precise chapter scope so the lint
  pipeline re-lints exactly the touched books automatically.
- **Search** (`searchRerunPipeline`) includes `undo`/`redo` in its
  `isSearchRerunRelevant` check, so the search panel re-runs the current
  query whenever replay restores prior content.

## Performance notes

- Replay cost is dominated by `canonicalSnapshotToTokens` (converting each
  touched chapter's snapshot back to its token stream) plus the visible
  chapter's read-time shape derivation in `setEditorContent`. The bulk-commit itself
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
