# Editor Data Flow

This spec describes how a single keystroke (or programmatic action) travels
through the system: Lexical → bridge plugin → `WorkingFilesStore` →
pipelines → satellite stores → React. It is the companion to
`state-architecture.md`, which describes *what* the pieces are; this one
describes *how data moves between them*.

## The three producers

Anything that mutates `WorkingFilesStore` is one of these:

1. **The editor itself** (Lexical updates), via
   `WorkingFilesBridgePlugin`. The bridge translates every Lexical update
   into one `CommitEvent`.
2. **Hooks running programmatic flows** (format, prettify, lint-fix,
   match-formatting, external-compare apply, save mark-clean, mode switch,
   revert). They use the `draftWithChapters` → mutate → `commit` pattern.
3. **History replay** (`useCustomHistory.undo` / `redo`). Replays canonical
   chapter snapshots through the same draft + bulk-commit path.

There is no fourth path. Anything that wants to change file state must
commit. Anything that wants to read file state must subscribe (React side)
or pipe `changes` (Effect side).

## Path 1: A user keystroke

```
keypress
  ▼
Lexical reconciliation → registerUpdateListener
  ▼
WorkingFilesBridgePlugin.updateListener
  ├── tags.has(programaticIgnore)?           → return  (own writeback)
  ├── !structuralFixup && HISTORY_MERGE_TAG? → return  (pure replay glue)
  ├── dirtyElements.size === 0 && dirtyLeaves.size === 0?
  │       commit({ kind: "selectionOnly", … },
  │              { kind: "metadataOnly", dirtyTextContent: false, … })
  │       return
  └── kind = getCommitKind(tags)  // userEdit | undo | programmaticFix
                                  // | structuralFixup
      lexicalState = editorState.toJSON()
      commit({ kind: "chapter", … },
             { kind, dirtyTextContent: true, … })
  ▼
WorkingFilesStore.commit
  ├── applyPatch                 // re-derives currentTokens + dirty
  ├── ++generation
  ├── notify React listeners     // synchronous
  └── Effect.runFork(PubSub.publish)
  ▼
Stream<CommitEvent>
  │
  ├── lintPipeline           filter(isLintRelevant)            → debounce(100) → switchMap → LintStore
  ├── saveStatusPipeline     filter(isSaveStatusRelevant)      → tap → SaveStatusStore
  ├── structurePipeline      filter(userEdit)                  → debounce(75)  → mapEffect → editor writeback
  ├── overlayTickPipeline    filter(kind ≠ metadataOnly)       → debounce(16)  → LayoutTickStore.bump
  ├── searchRerunPipeline    filter(isSearchRerunRelevant)     → debounce(250) → tap → rerunSearch(currentTerm)
  │                          // undo/redo/programmaticFix/import only — userEdit excluded
  │                          // (replace already re-runs synchronously)
  ├── dirtyBufferPipeline    filter(isDirtyBufferRelevant)     → groupByKey(book) → debounce(2000)/ceiling(30000)
  │                          → atomicWriteText|clear (DirtyBufferStore) — crash-recovery; see crash-recovery-autosave.md
  └── recoveredConflictTrackerSubscriber
                             → for each tracked chapter still in tracker, clear if post-commit `dirty === false`
```

Latency budget (typical chapter):

| Stage                            | Cost      |
| -------------------------------- | --------- |
| `editorState.toJSON()`           | ~2-6 ms (Psalm 119, measured) |
| `applyPatch` (`lexicalToTokens`) | ~5 ms     |
| React listener fan-out           | synchronous, sub-ms |
| `PubSub.publish` fork            | sub-ms    |

Selection-only commits skip everything but the no-op patch and PubSub
publish (no `toJSON`, no token recompute).

## Path 2: A programmatic flow (Option D)

Every hook that mutates files uses the same shape:

```ts
// 1. (Optional) snapshot the pre-mutation state for rollback.
const previous = workingFilesStore.read();

// 2. Discover the chapters you'll touch.
const refs = collectRefs(...);

// 3. Build a draft. Touched paths are shallow copies; everything else
//    aliases the store.
const draft = workingFilesStore.draftWithChapters(refs);

// 4. Mutate the draft synchronously.
for (const ref of refs) {
    const chapter = findChapterInDraft(draft, ref.bookCode, ref.chapterNum)!;
    chapter.lexicalState = transform(chapter.lexicalState);
    chapter.currentTokens = recompute(chapter);
    chapter.dirty = ...;
}

// 5. Commit. Stack frame must not have awaited since step 3.
workingFilesStore.commit(
    { kind: "bulk", files: draft },
    { kind: "programmaticFix", scope: { project: true }, dirtyTextContent: true },
);
```

The pattern is the same whether the scope is one chapter, one book, or the
whole project. Discovery flows (you don't know targets up-front) walk first,
then draft + mutate + commit in a second synchronous pass.

### Why a snapshot is a safe rollback

`draftWithChapters` only shallow-copies the chapters in `refs`. Everything
else in the draft still **aliases** the store's array. But the hook never
mutates those aliased entries — it only mutates the shallow copies it asked
for. The pre-draft `read()` therefore stays untouched and is a valid undo
target.

This is why we replaced `structuredClone` rollback baselines (the old
"deep-copy before, mutate in place, restore on undo" pattern). The deep
clone was ~1.5 s per project on Psalm 119; structural sharing is O(books) ×
O(chapters-per-book) plus the chapters you actually touch.

### Sequencing rule

`draft → mutate → commit` must stay synchronous. If you `await` between
steps 3 and 5:

1. Another commit (a user keystroke, a structure-maintenance writeback, an
   incoming external apply) may land in the store.
2. Your draft still aliases the *old* untouched chapters. When you bulk-
   commit, the store accepts your `files` array wholesale — the newer commit's
   changes vanish on the paths your draft aliased.

Gather async results first, then synchronously draft from the latest
`read()` and commit.

### Validated incoming-mutation boundary

When the source of a commit is an **awaited** computation against incoming
remote / external-compare content (i.e. you can't keep `draft → mutate →
commit` synchronous because the data has to come back from the network or
a file pick), the commit goes through `runIncomingMutation` in
`src/app/domain/project/compare/applyIncomingToStore.ts`:

1. Capture the affected chapters' **object identities** from `read()`
   before the await.
2. Compute on a private scratch — no writable store draft held across
   the await.
3. Re-read latest after the await.
4. Abort if any affected chapter was **replaced** (identity, not text —
   catches a text edit AND a save-rebase that changes
   `sourceTokens`/`dirty` but not `currentTokens`).
5. Recheck the workspace gate.
6. Commit synchronously from latest, with `draftWithChapters` aliasing
   untouched chapters (so concurrent commits to other chapters survive).
7. Remote-accept / status side effects fire only after a validated commit.

The `IncomingMutationScope` argument tells the boundary what to validate:

- `chapters` scope (hunk / full-chapter overlay) validates the named
  chapters' identities only — concurrent edits to other chapters must
  not abort the apply.
- `workspace` scope (`applyVersionSnapshotToWorkingFiles`, which marks
  every chapter clean against an incoming snapshot) validates the
  `read()` **array identity**. The store replaces the array on any
  state-changing commit and preserves it on `selectionOnly` — array
  identity is the exact "did anything change during my await" signal,
  and it catches a chapter added during the await that chapter scope
  would miss.

Full discussion of why and the failure modes this replaces is in
`crash-recovery-autosave.md` (the recovery feature is what surfaced the
need to formalize this boundary).

## Path 3: History replay

`useCustomHistory.applyEntry(action, direction, …)` is the replay path. For
each chapter the entry touched:

1. `draftWithChapters` with every chapter in the entry's `changes`.
2. For each chapter, materialize the canonical snapshot
   (`canonicalSnapshotToChapterState(snapshot, currentMode)`), then
   `markChapterDirty` to re-derive the dirty flag.
3. Bulk-commit with `kind: "undo"` (or `"redo"`).
4. If the visible chapter was touched, schedule a deferred restore fiber:
   sleep 50 ms, then push the new state into Lexical via `setEditorContent`
   (tagged `programaticIgnore` so the bridge does not re-publish), focus
   the editor, restore selection by `data-id`, and restore scroll position.
5. Notify post-undo/redo listeners. `WorkspaceContext` registers one that
   re-lints touched books targeted (the main lint pipeline filters undo/redo
   out, so this is how lint stays in sync after replay).

The deferred restore exists because pushing content into Lexical, focusing,
and scrolling all fight each other if they happen in one frame. The 50 ms
pause lets Lexical reconcile before we touch focus / selection / scroll.
Back-to-back undos interrupt the in-flight restore fiber and reschedule —
only the last entry's restore actually runs.

See `custom-history.md` for the full history model.

## Editor tag taxonomy

`WorkingFilesBridgePlugin` classifies a Lexical update by inspecting tags on
the update. The taxonomy is defined in `src/app/data/editor.ts`:

| Tag                              | Set by                                  | Bridge behavior                            |
| -------------------------------- | --------------------------------------- | ------------------------------------------ |
| `programatic-ignore`             | Any code calling `setEditorContent`     | Skip — the store produced this state       |
| `programmatic-do-run-changes`    | Fix-it / autofix write-backs            | Classify as `programmaticFix`              |
| `programmatic-structural-fix`    | Structure-maintenance pipeline writeback | Classify as `structuralFixup` (still published — co-occurs with `HISTORY_MERGE_TAG` for undo exclusion) |
| `HISTORY_MERGE_TAG` (Lexical)    | History glue, structural-fixup          | Skip *unless* structural-fixup is also set |
| `HISTORIC_TAG` (Lexical)         | Undo/redo replay                        | Classify as `undo`                         |
| (none of the above, dirty)       | User typing / paste                     | Classify as `userEdit`                     |
| (none, no dirty elements/leaves) | Cursor movement                         | Publish `selectionOnly` / `metadataOnly`   |

The order of checks in `getCommitKind` matters: `programmaticStructuralFix`
first (it's the only one that publishes despite `HISTORY_MERGE_TAG`), then
`HISTORIC_TAG` (replay), then `programmaticDoRunChanges` (fix-it), then
default `userEdit`.

## Why we don't push the editor state to consumers

The old shape was pull-based: consumers called `saveCurrentDirtyLexical()`
which serialized current editor state into `mutWorkingFilesRef`. Two
problems:

1. **Timing was opaque.** Different consumers pulled at different moments;
   programmatic flows could read stale state that hadn't been pulled yet.
2. **Clobbering.** A programmatic writer that called `setEditorContent`
   first, then mutated `mutWorkingFilesRef` "alongside," could race a pull
   triggered later by a keystroke and lose the programmatic write.

The push model fixes both. Every Lexical update produces exactly one commit,
synchronously, before any subsequent React render. Programmatic writers
never push to the editor first and mutate later; they commit, and the
editor catches up only when the visible chapter changes (chapter swap) or
when `setEditorContent` is called explicitly (history restore, navigation).

## Effect primitives in use

We use a deliberately small subset of Effect:

- `Effect.Effect<void>` / `Effect.gen` — pipeline bodies.
- `Effect.runFork` — start a pipeline fiber; returned `Fiber` is
  interrupted on `useEffect` cleanup.
- `Effect.runSync` — only for boot-time `Deferred.make()` and the
  `PubSub.unbounded()` call in `WorkingFilesStore`'s constructor.
- `Effect.sync` — wrap synchronous side-effects inside `tap` / `mapEffect`.
- `Effect.tryPromise` — wrap the lint service's Promise-returning method.
- `Effect.catch` — pipeline-local error recovery (log and continue).
- `Stream.fromPubSub` / `Stream.filter` / `Stream.debounce` /
  `Stream.switchMap` / `Stream.mapEffect` / `Stream.tap` /
  `Stream.runDrain`.
- `Deferred.make` / `Deferred.succeed` / `Deferred.await` — one-shot
  signal for the main editor reference.
- `Fiber.interrupt` — pipeline cleanup.
- `Duration.millis` — debounce inputs.
- `PubSub.unbounded` / `PubSub.publish` — the commit fan-out.

**Not yet in use:** `Context.Tag`, `Layer`, `Effect.Service`, `Schedule`,
`Ref`, `Queue`, `STM`. The current pass took on PubSub + scheduling for
the editor pipelines; a broader Effect service layer was out of scope.
Reach for plain TypeScript first; if a flow genuinely needs one of these
primitives, that's a reasonable escalation, not a banned move.

## Adding a new subscriber

If you want to react to commits:

1. Decide whether you need React-side reactivity or Effect-side. If you
   need debouncing, cancellation, or async work — Effect side. If you
   only need to render — React side, via a satellite store the Effect
   side writes into.
2. If a satellite store doesn't yet exist for your concern, add one
   under `src/app/state/`. Single-purpose, exposes `subscribe` +
   `getSnapshot`, plus narrow writer methods.
3. Add a pipeline factory under
   `src/app/domain/editor/pipelines/` that consumes
   `workingFilesStore.changes`, applies the right filter from
   `commitFilters.ts` (or add a new one — keep the predicates centralized),
   and writes to your store.
4. Fork the pipeline in `WorkspaceContext` and interrupt on cleanup.

If you only need React reactivity to existing satellite state, subscribe
via `useSyncExternalStore`. Don't subscribe directly to
`workingFilesStore.changes` from a component — that mixes the two channels
and is the smell we explicitly avoid.

## Code pointers

- `src/app/domain/editor/plugins/WorkingFilesBridgePlugin.tsx`
- `src/app/data/editor.ts` — `EDITOR_TAGS_USED`
- `src/app/state/types.ts` — `CommitEvent`, `CommitKind`
- `src/app/state/commitFilters.ts`
- `src/app/state/WorkingFilesStore.ts` — `commit`, `draftWithChapters`
- `src/app/domain/editor/pipelines/*.ts`
- `src/app/ui/contexts/WorkspaceContext.tsx` — pipeline forks +
  post-undo/redo relint
- `src/app/ui/hooks/useCustomHistory.ts` — replay path
- `src/app/ui/hooks/utils/editorUtils.ts` — `setEditorContent`,
  `collectFileTokens`
