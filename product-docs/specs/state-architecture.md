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
   WorkingFilesBridgePlugin               draftWithChapters → mutate → commit
        │                                            │
        └──────────────► WorkingFilesStore ◄─────────┘
                          │              │
              React subscribe            Effect changes: Stream<CommitEvent>
                          │              │
                          ▼              ▼
                 useSyncExternalStore   pipelines (lint, saveStatus,
                                        structureMaintenance, overlayTick)
                                                     │
                                                     ▼
                                       satellite stores (LintStore,
                                       SaveStatusStore, LayoutTickStore,
                                       SearchHighlightStore)
```

- **WorkingFilesStore** is the single source of truth for live chapter / book
  state.
- **CommitEvent** is the transport: every mutation publishes one, carrying the
  patch, the post-commit snapshot, and metadata (`kind`, `scope`,
  `dirtyTextContent`, `generation`).
- **Pipelines** subscribe to the commit stream, filter, debounce, and write
  into **satellite stores**.
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
gen1.lexicalState = newSerializedState;
// Then commit synchronously, in the same stack frame:
workingFilesStore.commit(
    { kind: "bulk", files: draft },
    { kind: "programmaticFix", scope: { bookCode: "GEN", chapter: 1 },
      dirtyTextContent: true },
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

**Concurrency rule.** `draft → mutate → commit` must stay synchronous in one
stack frame. An `await` between drafting and committing lets a newer commit
land in between; your draft (which still aliases the old untouched paths)
will then overwrite the newer commit on those paths — a lost update. Gather
async results first, then synchronously draft from the latest `read()` and
commit.

**Discovery flows** (e.g. lint fix-its that don't know which chapters they'll
touch until they walk the data): collect refs in pass 1, then `draftWithChapters`
+ mutate + commit in pass 2. Two cheap passes is preferable to drafting the
whole project speculatively.

### The four `WorkingFilesPatch` shapes

| `patch.kind`     | Mutation                                          | Tokens recomputed? |
| ---------------- | ------------------------------------------------- | ------------------ |
| `chapter`        | Replace one chapter's `lexicalState`              | Yes (`lexicalToTokens`) |
| `metadata`       | Flip one chapter's `dirty` flag                   | No                 |
| `bulk`           | Replace the entire `files` array                  | No (caller's job)  |
| `selectionOnly`  | No mutation; pure signal                          | No                 |

`bulk` is the workhorse for programmatic flows: callers build a draft with
the chapters they touched, populate `currentTokens` themselves if relevant,
and commit. `chapter` is the bridge's path for editor-driven edits — the
store rebuilds `currentTokens` and re-derives `dirty` by comparing source
strings.

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
    kind: CommitKind;       // why this happened
    scope: CommitScope;     // chapter scope or project scope
    dirtyTextContent: boolean;
    generation: number;     // monotonic, store-assigned
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
about text changes filter on it before they ever look at the patch. Mode
switching, for instance, commits `bulk` patches with `dirtyTextContent: false`
because it reshapes the Lexical tree without changing tokens — lint and save
status correctly skip them.

`generation` is monotonic, store-assigned, and currently used for ordering /
dedupe / dev-mode assertions. It's the right hook for any future
optimistic-concurrency check.

## Commit filters (single source of truth)

File: `src/app/state/commitFilters.ts`

Three named predicates encode the per-subscriber policy. **Do not inline
filter shapes at pipeline call sites** — three near-identical copies were the
review finding that produced this module.

- `isLintRelevant` — every text change a user could care about. Excludes
  `metadataOnly`, `structuralFixup`, `load`, `undo`, `redo` (the last two are
  re-linted targeted by the post-undo/redo effect; without this exclusion the
  pipeline would re-lint the entire project because undo commits use project
  scope).
- `isSaveStatusRelevant` — same as lint except `undo` / `redo` **do** count;
  replay restores prior dirty state and the save status should reflect it.
- `isStructureMaintenanceRelevant` — narrowest: `userEdit` only. The
  pipeline's own writebacks are tagged `structuralFixup` and re-entering
  would feedback-loop; programmatic / load / undo / redo arrive structurally
  consistent already.

`isSearchRerunRelevant` lives in `searchRerunPipeline.ts` rather than
`commitFilters.ts` — only one consumer and one direct test
(`searchRerunPipeline.test.ts` predicate matrix); will promote alongside
its siblings on the third consumer (rule of three).

## Pipelines

All five pipelines live under `src/app/domain/editor/pipelines/`. Each is a
factory returning `Effect.Effect<void>` that `WorkspaceContext` forks once
via `Effect.runFork(pipeline)` and interrupts on unmount.

### `makeLintPipeline`

```
changes ─► filter(isLintRelevant) ─► debounce(100ms) ─► switchMap(lintBooks)
```

- `switchMap` is the cancellation primitive. A newer commit interrupts the
  in-flight lint fiber and starts a fresh one. Only the newest pass writes
  to `LintStore`.
- One book per pass: project-scope commits collect every book in the
  snapshot; chapter-scope commits collect just the touched book. (Linter's
  structure checks span chapters within a book, so chapter granularity
  isn't useful here.)
- `Effect.catch` swallows lint errors to a `console.error` — a hung
  remote linter must not take the pipeline fiber down.

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
data-free; `LintDomAnnotatorPlugin`, `HighlightSink`, and any other overlay
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

| Store                    | Writers                                                   | Readers                                         |
| ------------------------ | --------------------------------------------------------- | ----------------------------------------------- |
| `LintStore`              | `makeLintPipeline`, post-undo/redo relint effect          | `useLint` + lint UI                             |
| `SaveStatusStore`        | `makeSaveStatusPipeline`, save command                    | `useSave`, toolbar                              |
| `LayoutTickStore`        | `makeOverlayTickPipeline`, workspace `ResizeObserver`     | `LintDomAnnotatorPlugin`, `HighlightSink`       |
| `SearchHighlightStore`   | Search hooks (execution / navigation / replace)           | `HighlightSink` (paints in `useLayoutEffect`)   |

Two design points worth calling out:

- **`SearchHighlightStore` exists to fix drift.** The legacy path painted
  highlights imperatively at each call site. When the structure pipeline or
  a chapter swap moved nodes between paints, highlights drifted. `HighlightSink`
  now subscribes to the store **and** the layout tick and repaints both when
  matches change and when the editor DOM reflows. The store is just the
  bridge.
- **`LintStore.commitBookLintResults` wipes prior results per book.** Pipeline
  cancellation upstream guarantees only the newest pass writes, so there's no
  in-store staleness check; `requestCounter` exists for downstream UI ordering.

## Wiring in WorkspaceContext

File: `src/app/ui/contexts/WorkspaceContext.tsx`

- All five stores (`workingFilesStore`, `lintStore`, `saveStatusStore`,
  `layoutTickStore`, `searchHighlightStore`) are constructed once via
  `useStableInstance` in the provider. They live for the lifetime of the
  workspace, not per-render.
- `mainEditorDeferred` is created with `Effect.runSync(Deferred.make())` and
  resolved by `WorkingFilesBridgePlugin` on editor mount. Pipelines and
  effects that need the editor `yield* Deferred.await(mainEditorDeferred)`.
- Each pipeline is forked in its own `useEffect`: build the `Effect`, call
  `Effect.runFork`, return cleanup that interrupts the fiber. Getter callbacks
  (`getAppSettings`, `getVisibleBookCode`) are kept in sync via refs so the
  forked fiber always sees current values.
- The post-undo/redo relint effect lives here too: it registers with
  `useCustomHistory.registerPostUndoRedoAction`, collects touched books, and
  writes targeted lint results to `LintStore.commitBookLintResults`. It
  bypasses the main lint pipeline (which excludes `undo` / `redo`) because
  history replay should re-lint exactly what it touched, immediately, without
  the 100ms debounce.

## Mutability discipline (the rules in one place)

1. **The store owns the snapshot.** A `read()` is shared by reference across
   subscribers — never mutate it directly.
2. **To mutate, draft.** `draftWithChapters(refs)` is the only sanctioned way
   to produce a writable copy. The shallow copies are yours; the untouched
   refs still alias the store and must stay untouched.
3. **One stack frame, draft → mutate → commit.** No `await`s in between (see
   the lost-update note above).
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
- `src/app/state/commitFilters.ts` — `isLintRelevant`, `isSaveStatusRelevant`,
  `isStructureMaintenanceRelevant`. The search-rerun predicate
  (`isSearchRerunRelevant`) lives co-located with its pipeline in
  `searchRerunPipeline.ts`.
- `src/app/state/LintStore.ts`, `SaveStatusStore.ts`, `LayoutTickStore.ts`,
  `SearchHighlightStore.ts` — satellite stores.
- `src/app/domain/editor/pipelines/lintPipeline.ts`, `saveStatusPipeline.ts`,
  `structureMaintenancePipeline.ts`, `overlayTickPipeline.ts`,
  `searchRerunPipeline.ts` — pipelines.
- `src/app/domain/editor/plugins/WorkingFilesBridgePlugin.tsx` — editor →
  store bridge.
- `src/app/domain/editor/plugins/HighlightSink.tsx` — search highlight paint.
- `src/app/ui/contexts/WorkspaceContext.tsx` — store + pipeline wiring.
