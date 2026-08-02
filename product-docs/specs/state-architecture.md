# Workspace State Architecture

This spec describes how live, in-memory workspace state is organized: where the
truth lives, how mutations are expressed, how subscribers react, and why we
chose the particular shape we did. It is the orientation document for any agent
or contributor touching `src/app/state/**`, `src/app/domain/editor/pipelines/**`,
or hooks that mutate working files.

## Why Effect + a single store (and not Zustand / Redux / context-only)

Two needs collided:

1. **Synchronous React reads.** Components like `useSave` need to compute
   `hasUnsavedChanges` inside a render and stay coherent under React's
   `useSyncExternalStore` semantics.
2. **Async, interruptible, debounced side-effects.** Lint, structure
   maintenance, save status, overlay re-measurement, search highlight repaint
   all need to react to edits, but with different cadences and cancellation
   rules. Lint must be interrupted if a newer edit arrives. Structure
   maintenance must wait for the editor to mount before its first pass.

A plain React store (Zustand or context) gives us (1) cheaply but pushes (2)
back onto each consumer with ad-hoc `setTimeout`s, refs, and broken
interruption. A pull-driven model (`saveCurrentDirtyLexical`) was the legacy
shape — the timing was fragile and clobbered programmatic writes.

We picked **Effect Streams + PubSub** for the async side because:

- `Stream.switchMap` gives free, correct cancellation of in-flight work.
- `Stream.debounce(Duration.millis(n))` is one operator, not a hook + ref.
- `Deferred<LexicalEditor>` cleanly expresses "wait for the editor to mount"
  without polling.
- The Effect runtime is opt-in per-pipeline (`Effect.runFork`) so it doesn't
  bleed into render code or component lifecycle.

Effect adoption is currently scoped to the editor pipelines: pipelines are
plain `Effect.Effect<void>` values forked once in `WorkspaceContext`, and
stores are plain TypeScript classes that happen to expose an Effect
`Stream` for one of their two read channels. We did not also take on an
app-wide Effect service layer (`Context.Tag`, `Layer`, `Effect.Service`)
in this pass — that would have been a much larger refactor on top of an
already substantial PubSub + scheduling change. It's a reasonable
direction to grow into, not a closed door.

## The four-layer mental model

```
   Lexical update                              user action / programmatic flow
        │                                            │
        ▼                                            ▼
   WorkingFilesBridgePlugin               withWorkingFilesDraft seam
        │                                  (recording draft → compute +
        │                                   check out changed chapters →
        │                                   validate → re-check gate → commit
        │                                   → typed result)
        └──────────────► WorkingFilesStore ◄─────────┘
                          │              │
              React subscribe            Effect changes: Stream<CommitEvent>
                          │              │
                          ▼              ▼
                 useSyncExternalStore   pipelines (lint, sous, editorSync,
                                        saveStatus, structureMaintenance,
                                        overlayTick, searchRerun, …)
                                                     │
                                                     ▼
                                       satellite stores (FindingsStore,
                                       SaveStatusStore, LayoutTickStore,
                                       SearchHighlightStore)
```

- **WorkingFilesStore** is the single source of truth for live chapter / book
  state.
- **CommitEvent** is the transport: every mutation publishes one, carrying the
  patch, the post-commit snapshot, and metadata (`kind`, `scope`,
  `dirtyTextContent`, `generation`).
- **Pipelines** subscribe to the commit stream, filter, debounce, and write
  into **satellite stores**. Lint and sous are parallel subscribers — each
  rides `makeFoldedScopePipeline`, which accumulates book scopes across the
  debounce window so no book touched during a burst is silently dropped.
- **Satellite stores** are tiny, single-purpose, and React-readable via
  `useSyncExternalStore`. They never call back into `WorkingFilesStore`.

## WorkingFilesStore — the only file-state truth

File: `src/app/state/WorkingFilesStore.ts`

### Two read channels

- **React side**: `subscribe(listener)` + `getSnapshot()`. Used by
  `useSyncExternalStore` in `useSave` (reactive `hasUnsavedChanges`) and a few
  derived hooks. Synchronous; called inside the same stack frame as
  `commit()` so React snapshots are coherent within a render.
- **Effect side**: `get changes(): Stream<CommitEvent>`. Backed by an
  unbounded `PubSub`. Pipelines pipe it with `Stream.filter`,
  `Stream.debounce`, `Stream.switchMap`.

A component should pick one channel. Using both is a code smell — derive into
a satellite store instead.

### Why unbounded PubSub

Backpressure is per-subscriber, not per-store. Lint relieves pressure with
`switchMap` (newer commit interrupts in-flight work); save status / overlay
tick relieve pressure with `debounce`. A growing queue here means an upstream
subscriber is hanging — that's a bug to fix at the subscriber, not a knob to
tune at the store. The invariant we want is **"every CommitEvent reaches
every subscriber"**.

### Copy-on-Write drafting (`draftWithChapters`)

```ts
const draft = workingFilesStore.draftWithChapters([
  { bookCode: "GEN", chapterNum: 1 },
  { bookCode: "GEN", chapterNum: 2 },
]);
// draft is a new ScriptureBookState[] where GEN, GEN.chapters[0], and
// GEN.chapters[1] are shallow copies; every other book and chapter is the
// same object reference as the store's current state.
// Mutate the copies in place:
const gen1 = findChapterInDraft(draft, "GEN", 1)!;
gen1.currentTokens = newTokens;
gen1.dirty = !tokenSourcesEqual(newTokens, gen1.sourceTokens);
// Then commit synchronously, in the same stack frame:
workingFilesStore.commit(
  { kind: "bulk", files: draft },
  {
    kind: "programmaticFix",
    scope: { bookCode: "GEN", chapter: 1 },
    dirtyTextContent: true,
  },
);
```

**Why structural sharing, not `structuredClone`:** deep-cloning the entire
project tree was ~1.5 s per undo on Psalm 119. Structural sharing produces
exactly the object identities the commit boundary needs — touched paths get
new refs, untouched paths stay stable. That stability is load-bearing for two
reasons:

1. React `useMemo` / `React.memo` downstream stay quiet — only touched
   chapters and their containing book re-render.
2. The pre-draft `read()` is a safe rollback baseline for hooks like
   `useFormatMatching`: nothing the draft mutates ever leaks back into the
   store-owned snapshot.

**Concurrency rule.** A raw `draft → mutate → commit` must stay synchronous in
one stack frame. An `await` between drafting and committing lets a newer commit
land in between; your draft (which still aliases the old untouched paths)
will then overwrite the newer commit on those paths — a lost update. Gather
async results first, then synchronously draft from the latest `read()` and
commit.

**The validated seam (`withWorkingFilesDraft`).** Because most active flows
genuinely need to `await` mid-mutation (re-tokenizing, calling the usfm-onion
service), active mutations don't open-code the synchronous draft-and-commit —
they go through the `withWorkingFilesDraft` seam in
`src/app/domain/project/workingFileCommand.ts`. The seam branches a **recording
draft** off the current `read()`; `mutate` awaits freely on it (it works on the
draft, never the store) and **checks out** a chapter (`chapterForWrite`) or book
(`bookForWrite`) only when its engine actually produces a change. The set of
affected chapters is **measured** from those checkouts — never declared up
front; no checkout ⇒ no commit (`unchanged`). The seam then re-reads latest,
**validates the affected chapters weren't replaced** (object identity),
**re-checks the interaction gate**, and only then commits (overlaying only the
affected chapters onto the latest read, or — when a book was rebuilt wholesale —
committing the draft's books wholesale after a whole-state identity check). It
returns a typed `{ kind: "committed" | "unchanged" | "aborted" }`; the caller
branches on that result for its own follow-through (history capture/record,
notifications, reports), so nothing the caller sequences can run on an abort. It
composes the same identity-CAS primitives as `runIncomingMutation`, so there is
one lost-update contract. Verbs whose entire draft→commit runs in one stack
frame (revert, discard, save mark-clean) use the synchronous sibling
`withWorkingFilesDraftSync` — no `await` between branching and committing means
nothing to validate.

**Discovery flows** (e.g. lint fix-its that don't know which chapters they'll
touch until they walk the data): just read the draft and call `chapterForWrite`
for each chapter the walk actually changes — the seam derives `affected` from
those checkouts, so a discovery flow needs no candidate list. A checkout is
cheap (structural sharing): only checked-out chapters get fresh objects, every
other chapter stays the same reference.

### The four `WorkingFilesPatch` shapes

| `patch.kind`    | Mutation                                                     | Tokens recomputed?      |
| --------------- | ------------------------------------------------------------ | ----------------------- |
| `chapter`       | Bridge sends shaped `lexicalState`; store flattens to tokens | Yes (`lexicalToTokens`) |
| `metadata`      | Flip one chapter's `dirty` flag                              | No                      |
| `bulk`          | Replace the entire `files` array                             | No (caller's job)       |
| `selectionOnly` | No mutation; pure signal                                     | No                      |

`bulk` is the workhorse for programmatic flows: callers build a draft with
the chapters they touched, populate `currentTokens` themselves, and commit.
`chapter` is the bridge's path for editor-driven edits — the shaped
`lexicalState` travels on the wire, but `applyPatch` immediately flattens it
to `currentTokens` via `lexicalToTokens` and re-derives `dirty`. Nothing
stored in `ScriptureChapterState` is shaped; the Lexical display tree is
derived on read by `deriveChapterLexical`.

### `selectionOnly` and `kind: "metadataOnly"`

Selection changes (cursor movement, no text edits) **are** published. The
patch is a no-op (`applyPatch` returns the same array), the `dirtyTextContent`
flag is `false`, and the `CommitKind` is `metadataOnly`. No subscriber today
materializes them, but the invariant **"every Lexical update produces a
CommitEvent"** is what unlocks future features like synced scrolling, action
palette context, and presence — they can subscribe with a filter and not
require a redesign of the bridge.

The cost is bounded: no `toJSON`, no token recompute, no patch materialization.

## CommitMeta — the routing contract

```ts
type CommitMeta = {
  kind: CommitKind; // why this happened
  scope: CommitScope; // chapter scope or project scope
  dirtyTextContent: boolean;
  generation: number; // monotonic, store-assigned
};
```

The eight `CommitKind` values are the contract that drives the pipeline
filters in `src/app/state/commitFilters.ts`:

- `userEdit` — user typed / pasted / deleted.
- `programmaticFix` — fix-it write-back (lint autofix, format-match, prettify).
- `import` — externally-sourced content (USFM paste, version revert, file open).
- `undo` / `redo` — history replay.
- `load` — initial chapter / project population.
- `structuralFixup` — structure-maintenance writeback. The pipeline that
  produced it filters it out, breaking the feedback loop.
- `metadataOnly` — dirty-flag flips and selection-only commits.

`dirtyTextContent: false` is a cheap fast-path: subscribers that care only
about text changes filter on it before they ever look at the patch. A save
clean-mark, for instance, commits `metadata` patches with
`dirtyTextContent: false` so lint and save status correctly skip them. Mode
switching does not commit to the store at all — tokens are mode-independent,
so switching merely flips the setting and lets `syncEditorToVisibleChapter`
re-derive the visible chapter's shape on read.

`generation` is monotonic, store-assigned, and currently used for ordering /
dedupe / dev-mode assertions. It's the right hook for any future
optimistic-concurrency check.

## Commit filters (single source of truth)

File: `src/app/state/commitFilters.ts`

Two shapes of policy live here. **Do not inline filter logic at pipeline call
sites.**

**Scope policies** (`lintScopeFor`, `sousScopeFor`, `editorSyncScopeFor`,
`diffScopeFor`) fuse "is this commit relevant?" and "at what scope do I
react?" into one return value — a `ConsumerBookScope` (or chapter scope).
An empty set means skip; the `"all"` sentinel means react against the full
snapshot. This is the right shape for `makeFoldedScopePipeline`'s scope
accumulator: scopes fold cleanly across a debounce window and `"all"` absorbs
any set.

- `lintScopeFor` — every text change a user could care about: excludes
  `metadataOnly`, `structuralFixup`, `load`. `undo`/`redo` are **included**
  — replay commits carry precise chapter scope, so the pipeline re-lints
  exactly the touched books. (The old post-undo/redo targeted relint hook
  that bypassed the main pipeline no longer exists.)
- `sousScopeFor` — same relevance class as lint today. Action-keyed widening
  belongs here when a sous rule actually needs corpus-level state (e.g. cross-
  book statistics → map `action` to `"all"`).
- `editorSyncScopeFor` — only `programmaticFix` / `import`; `userEdit`
  originates from the editor (writing back would clobber selection/IME), and
  `undo`/`redo` handle their own content restoration.
- `diffScopeFor` — chapter granularity, same exclusions as lint.

**Boolean predicates** (`isSaveStatusRelevant`, `isStructureMaintenanceRelevant`,
`isDirtyBufferRelevant`) cover subscribers whose reaction has no meaningful
scope axis.

- `isSaveStatusRelevant` — all dirty-text events including `undo`/`redo`
  (replay restores prior dirty state).
- `isStructureMaintenanceRelevant` — `userEdit` only; pipeline's own
  writebacks (`structuralFixup`) and all programmatic / load / undo / redo
  commits arrive structurally consistent.
- `isDirtyBufferRelevant` — widest: excludes `load` and `selectionOnly`
  patches only; the save flow's clean-marking commit is `metadataOnly` with
  `dirtyTextContent: false` and must still clear the backup.

`isSearchRerunRelevant` lives in `searchRerunPipeline.ts` — one consumer,
one direct test; promote to `commitFilters.ts` on the third consumer (rule
of three).

## Pipelines

All pipelines live under `src/app/domain/editor/pipelines/`. Each is a
factory returning `Effect.Effect<void>` that `WorkspaceContext` forks via
`useForkedPipeline` and interrupts on unmount or deps change. Seven drive the
in-session editor (lint, sous, editorSync, saveStatus, structureMaintenance,
overlayTick, searchRerun); two drive crash-recovery
(`dirtyBufferPipeline` + `recoveredConflictTrackerSubscriber`, documented
in `crash-recovery-autosave.md`). A dev-only `tokenFixpointPipeline` runs
only in `import.meta.env.DEV`.

### `makeLintPipeline`

```
changes ─► lintScopeFor ─► fold into Ref<FoldedBookScope>
        ─► debounce(100ms) ─► switchMap(drain Ref → lintPass)
```

Built on `makeFoldedScopePipeline`. Scopes accumulate in a `Ref` as
events arrive; the debounce paces the trigger; each pass drains the
accumulated union atomically (`getAndSet`). If `switchMap` interrupts a
pass, the pass restores its taken scope before yielding, so the next
trigger covers `old ∪ new` — no book touched during a burst is silently
dropped.

- One command per pass: the folded scope drains as one `analyzeLint` command
  sent to `MirrorFeed` carrying the book set and the current store generation.
  The mirror reads its resident token replica for those books, runs lint, and
  returns per-book results. The result router (`makeMirrorResultRouter`)
  normalizes and commits each book's results into `FindingsStore`'s `"onion"`
  slice via `commitBookFindings`. A clean book commits `{}` (no merge, clean
  slate). (Linter structure checks span chapters within a book, so chapter
  granularity isn't useful here.)
- The pipeline itself is fire-and-forget at the send site; the mirror result
  fan-out handles the commit, so no `Effect.catch` is needed at the pipeline
  level — mirror errors land at the result router.

### `makeSousPipeline`

```
changes ─► sousScopeFor ─► fold into Ref<FoldedBookScope>
        ─► debounce(100ms) ─► switchMap(drain Ref → sousPass)
```

A parallel subscriber to the same `WorkingFilesStore.changes` stream as
`makeLintPipeline` — not a tee off lint. Uses the same
`makeFoldedScopePipeline` substrate with a 100 ms debounce on its own
clock, so sous traffic doesn't compound lint's cadence.

Each pass drains the folded scope as one `analyzeGalley` command sent to
`MirrorFeed`. The mirror assembles each book's token replica, runs the vref
build and sous analysis mirror-side, and returns per-book results. The result
router commits findings plus the vref segment map into `FindingsStore`'s
`"sous-chef"` slice in one atomic call — findings and the projection they
resolve against are never observed out of step.

### `makeEditorSyncPipeline`

```
changes ─► editorSyncScopeFor ─► (no debounce) ─► mapEffect(awaitEditor + setEditorContent)
```

Keeps the visible editor DOM in sync with programmatic working-files
commits (`programmaticFix`, `import`). No debounce — these events are rare
and any delay widens the window where the user types into pre-fix content.

`userEdit` commits (originate from the editor) and `undo`/`redo` commits
(replay restores its own content + selection) are excluded by
`editorSyncScopeFor`. The pipeline awaits `Deferred<LexicalEditor>` and calls
`setEditorContent`, tagging the write with `programaticIgnore` so the bridge
does not republish the writeback as a fresh commit.

### `makeSaveStatusPipeline`

```
changes ─► filter(isSaveStatusRelevant) ─► tap(setDirty | setCleanFromCommit)
```

No debounce, no disk write. Pure observation: iterate the snapshot's chapters,
any `dirty` ⇒ `setDirty()`, none ⇒ `setCleanFromCommit()`. The save command
itself drives the `saving` / `saved` / `failed` transitions around the actual
write.

### `makeStructureMaintenancePipeline`

```
changes ─► filter(isStructureMaintenanceRelevant) ─► debounce(75ms)
        ─► mapEffect(awaitEditor + runMaintenance)
```

- Awaits `Deferred<LexicalEditor>` resolved by `WorkingFilesBridgePlugin`
  on mount. This is the model we use whenever an Effect needs the editor:
  no polling, no race window between fork and first commit.
- Reads settings + visible book code via getter callbacks (not closure
  capture), so the fiber always sees current values without re-forking on
  every settings change.
- Writebacks tag the Lexical update as `programmaticStructuralFix`. The
  bridge classifies that tag into `kind: "structuralFixup"` (which the
  filter excludes); `HISTORY_MERGE_TAG` is also set so the writeback stays
  out of undo.

### `makeOverlayTickPipeline`

```
changes ─► filter(kind !== "metadataOnly") ─► debounce(16ms) ─► tap(bump)
```

Coalesces a burst of commits into one tick per animation frame. The tick is
data-free; `FindingsOverlayPlugin`, `HighlightSink`, and any other overlay
subscribe to `LayoutTickStore` and re-measure in `useLayoutEffect`. Scroll /
resize / font-load signals bump the store directly (not via this pipeline).

### `makeSearchRerunPipeline`

```
changes ─► filter(isSearchRerunRelevant) ─► debounce(250ms) ─► tap(rerunSearch(currentTerm))
```

- Re-runs the current search query when the working-files store changes
  programmatically — `undo` / `redo` (replay), `programmaticFix` (lint
  apply, prettify), `import` (revert / external apply). `userEdit` is
  intentionally excluded: `useSearchReplace.replaceMatch` already runs
  a scoped rerun synchronously after its own commit, and per-keystroke
  rerun would re-tokenize the project for results nobody is reading
  (the search panel occupies the workspace surface).
- 250 ms debounce coalesces bursts; longer than lint's 100 ms because
  each rerun re-tokenizes the project at full scope.
- Reads the current search term + rerun callback via getters
  (`getSearchTerm`, `rerunSearch`) so the pipeline forks once per
  workspace; the search hook keeps an `executionRef` that the getters
  close over — same pattern as `makeStructureMaintenancePipeline`'s
  `getAppSettings` / `getVisibleBookCode`.
- Not gated on "search pane open": user flow is "open → search →
  replace → close → maybe undo → reopen," and reopening must surface
  fresh results without manual re-submit.

## Satellite stores

Each satellite store is single-purpose, single-writer (per writer rule
documented inline), and exposes `subscribe` + `getSnapshot` for
`useSyncExternalStore`.

| Store                      | Writers                                                                                                                                      | Readers                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `FindingsStore`            | `makeLintPipeline` (`"onion"` slice), `makeSousPipeline` (`"sous-chef"` slice), workspace kernel (`initialFindings` seed before first paint) | `useFindings`, `FindingsOverlayPlugin`, `FindingsPopover`                                               |
| `SaveStatusStore`          | `makeSaveStatusPipeline`, save command                                                                                                       | `useSave`, toolbar                                                                                      |
| `LayoutTickStore`          | `makeOverlayTickPipeline`, workspace resize/scroll listeners                                                                                 | `FindingsOverlayPlugin`, `HighlightSink`                                                                |
| `SearchHighlightStore`     | Search hooks (execution / navigation / replace)                                                                                              | `HighlightSink` (paints in `useLayoutEffect`)                                                           |
| `WorkspaceInteractionGate` | Save command (`open`↔`saving`), recovery decision (`recovery-decision-pending`↔`open`)                                                       | Editor `GateEditablePlugin`, every mutation hook, button surfaces                                       |
| `RecoveredConflictTracker` | Route loader (seed on baseline mismatch), `recoveredConflictTrackerSubscriber` (clear on observed clean), Discard banner (`clearAll`)        | `useSave` (modal routing), external-compare entry control, save command (`reviewedRecoveredWork` check) |
| `WorkspaceBaselineStore`   | Route loader (initial seed from `diskMd5ByBook`), save command (`setPresent` after each successful book write)                               | `dirtyBufferPipeline` (wrapper's `diskBaseline`), recovery classifier                                   |
| `DirtyBufferStore`         | `dirtyBufferPipeline` (`put` / `clear`)                                                                                                      | Route loader at reopen (`list` + classify against current disk)                                         |
| `WorkspaceModalStore`      | `useDecorateFindings` context (`openModal` / `closeModal` passed to decorator context)                                                       | `WorkspaceModalOutlet` (renders the active modal slot)                                                  |

Three design points worth calling out:

- **`FindingsStore` is namespace-partitioned by producer.** `"onion"` and
  `"sous-chef"` are closed keys; adding a producer is a deliberate type edit.
  Writes are path-copy at book granularity, so `useSyncExternalStore`
  consumers' reference-keyed memos skip untouched books. The sous slice
  carries a `segmentsByBook` sidecar (the vref projection) in the same atomic
  commit — findings and their DOM-resolution substrate can never be observed
  out of step.
- **`SearchHighlightStore` exists to fix drift.** The legacy path painted
  highlights imperatively at each call site. When the structure pipeline or
  a chapter swap moved nodes between paints, highlights drifted. `HighlightSink`
  now subscribes to the store **and** the layout tick and repaints both when
  matches change and when the editor DOM reflows. The store is just the bridge.
- **`FindingsStore` has no staleness counter.** Pipeline cancellation via
  `switchMap` inside `makeFoldedScopePipeline` guarantees only the newest pass
  commits; the book-wholesale supersession (`commitBookFindings` replaces the
  whole book node) means there is no merge rule to forget.

### Crash-recovery state primitives

Four stores cooperate to give the editor a Word-style safety net for
unsaved work; full contract in `crash-recovery-autosave.md`.

- **`WorkspaceInteractionGate`** — three states (`open` | `saving` |
  `recovery-decision-pending`). A coarse mutex. While non-open, every
  programmatic mutation entry returns a no-op and the editor's
  `setEditable` is `false`. Single-authority pattern: `GateEditablePlugin`
  in `Editor.tsx` is the only place that calls `editor.setEditable` —
  USFMPlugin used to compete on it and produced an editable-during-banner
  race.
- **`RecoveredConflictTracker`** — a `Set<"${bookCode}:${chapter}">`
  exposed via `subscribe` + `getSnapshot` for `useSyncExternalStore`.
  Made observable (not a plain Set) because UI surfaces — the
  external-compare entry control, the modal-routing decision in
  `useSave` — must re-render when the subscriber clears the last entry.
  Cleared by a small fiber that observes tracked chapters now clean,
  not by enumerating every revert site.
- **`WorkspaceBaselineStore`** — owns the `IMd5Service`. The route
  loader seeds it from `diskMd5ByBook` (hashed by the parser; one IPC
  on Tauri, one in-process hash on web). Save flips entries to the
  newly-persisted MD5 after each successful book write. The dirty-buffer
  pipeline reads these to stamp each backup's `diskBaseline` wrapper.
- **`DirtyBufferStore`** — adapter over `FileSystem.atomicWriteText`
  for per-book USFM backup wrappers at
  `${appDataRoot}/dirty-buffers/${workspaceKey}/${bookCode}.json`. Owns
  the `bodyMd5` torn-write check and the `ReadUnreadableReason` taxonomy.

## Wiring in WorkspaceContext

File: `src/app/ui/contexts/WorkspaceContext.tsx`

- Stores (`workingFilesStore`, `findingsStore`, `saveStatusStore`,
  `layoutTickStore`, `searchHighlightStore`, `workspaceModalStore`) are
  constructed once via `useStableInstance` in the provider. They live for
  the lifetime of the workspace, not per-render. `FindingsStore` is seeded
  synchronously from the kernel's awaited initial findings before first paint
  so the store is never transiently empty on first render.
- The workspace kernel (`WorkspaceKernelHandle`) is claimed on mount and
  released on unmount. It owns the `MirrorFeed`, the seeded mirror worker(s),
  and the awaited initial findings that seed `FindingsStore`.
- `mainEditorDeferred` is created with `Effect.runSync(Deferred.make())` and
  resolved by `WorkingFilesBridgePlugin` on editor mount. Pipelines and
  effects that need the editor `yield* Deferred.await(mainEditorDeferred)`.
- Each pipeline is forked via `useForkedPipeline(factory, deps)` — a thin
  hook that calls `Effect.runFork` on mount and interrupts the fiber on
  unmount or deps change. Getter callbacks (`getAppSettings`,
  `getVisibleBookCode`) are kept in sync via refs so forked fibers always see
  current values.
- The analysis pipelines (lint, sous, dev re-lex alarm, structure
  maintenance) are gated by `analysisDisabledInMode(editorMode)` — when plain
  mode is active these fibers fork as `Effect.void` so no analysis runs.
  The infra pipelines (save-status, overlay-tick, dirty-buffer, editor-sync)
  run in every mode regardless.
- `editorSyncPipeline` wires the programmatic-commit→editor sync chokepoint
  that previously lived as an imperative call in each action hook. The
  pipeline observes `programmaticFix`/`import` commits and calls
  `setEditorContent` for the currently visible chapter.

## Mutability discipline (the rules in one place)

1. **The store owns the snapshot.** A `read()` is shared by reference across
   subscribers — never mutate it directly.
2. **To mutate actively, use the seam.** Active mutations (format, prettify,
   match-formatting, lint-fix) go through `withWorkingFilesDraft`; awaited
   incoming-content applies go through `runIncomingMutation`. Both produce
   their writable copy via `draftWithChapters(refs)` — the only sanctioned way
   to make one. The shallow copies are yours; the untouched refs still alias
   the store and must stay untouched.
3. **A raw draft → commit must be one synchronous stack frame.** If a flow
   open-codes `draftWithChapters` + `commit` (genuinely synchronous flows
   only — history replay, save mark-clean), there must be no `await` in
   between (see the lost-update note above). If you need to await
   mid-mutation, that's exactly what the seam is for.
4. **One channel per consumer.** React-side reads via `useSyncExternalStore`
   on the satellite that's relevant; Effect-side reads via the pipeline.
   Mixing channels in one consumer is a smell — derive into a satellite
   store.
5. **Programmatic writers commit, not push to the editor first.** The old
   "save editor state, then overwrite" path is gone (it was the source of
   the clobber bug `useModeSwitching` used to guard against). Programmatic
   producers build a draft, populate it, and `commit({ kind: "bulk", ... })`.
6. **Tag editor writebacks correctly.** When pushing state back into Lexical
   via `setEditorContent`, tag with `programaticIgnore` so the bridge does
   not re-publish your own output as a fresh commit.

## Code pointers

- `src/app/state/types.ts` — `CommitKind`, `CommitMeta`, `WorkingFilesPatch`,
  `CommitEvent`.
- `src/app/state/WorkingFilesStore.ts` — store, `draftWithChapters`,
  `applyPatch`, `findChapterInDraft`.
- `src/app/domain/project/workingFileCommand.ts` — `withWorkingFilesDraft`,
  the validated active-mutation seam.
- `src/app/domain/project/compare/applyIncomingToStore.ts` —
  `runIncomingMutation` + the shared identity-CAS primitives the seam composes.
- `src/app/state/commitFilters.ts` — `lintScopeFor`, `sousScopeFor`,
  `editorSyncScopeFor`, `diffScopeFor`, `isSaveStatusRelevant`,
  `isStructureMaintenanceRelevant`, `isDirtyBufferRelevant`. The search-rerun
  predicate (`isSearchRerunRelevant`) lives co-located with its pipeline in
  `searchRerunPipeline.ts`.
- `src/app/state/FindingsStore.ts` — unified findings store; `FindingsState`,
  `FindingSource`, `commitBookFindings`, `commitSousFindings`.
- `src/app/state/findingsSelectors.ts` — `flattenFindings`,
  `chapterFindingsAcrossSources`, `sousSegmentsForBook`.
- `src/app/state/SaveStatusStore.ts`, `LayoutTickStore.ts`,
  `SearchHighlightStore.ts`, `WorkspaceModalStore.ts` — other satellite stores.
- `src/app/domain/editor/pipelines/lintPipeline.ts`, `sousPipeline.ts`,
  `editorSyncPipeline.ts`, `foldedScopePipeline.ts`, `saveStatusPipeline.ts`,
  `structureMaintenancePipeline.ts`, `overlayTickPipeline.ts`,
  `searchRerunPipeline.ts` — pipelines. `foldedScopePipeline.ts` is the shared
  debounce-and-accumulate substrate for lint and sous.
- `src/core/domain/sous/sousTypes.ts` — `SousAnalyzeResult`, `SousFinding`.
- `src/core/domain/usfm/vrefTypes.ts` — `Utf16Span`, `Segment`,
  `SegmentsBySid` — the vref projection substrate.
- `src/app/domain/mirror/MirrorFeed.ts` — the command bus lint/sous pipelines
  write to; the result router (`makeMirrorResultRouter`) commits responses back
  into the findings store.
- `src/app/domain/editor/plugins/WorkingFilesBridgePlugin.tsx` — editor →
  store bridge.
- `src/app/domain/editor/plugins/HighlightSink.tsx` — search highlight paint.
- `src/app/ui/contexts/WorkspaceContext.tsx` — store + pipeline wiring.
