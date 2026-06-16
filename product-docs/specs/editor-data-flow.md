# Editor Data Flow

This spec describes how a single keystroke (or programmatic action) travels
through the system: Lexical → bridge plugin → `WorkingFilesStore` →
pipelines → satellite stores → React. It is the companion to
`state-architecture.md`, which describes _what_ the pieces are; this one
describes _how data moves between them_.

## The three producers

Anything that mutates `WorkingFilesStore` is one of these:

1. **The editor itself** (Lexical updates), via
   `WorkingFilesBridgePlugin`. The bridge translates every Lexical update
   into one `CommitEvent`.
2. **Hooks running programmatic flows** (format, prettify, lint-fix,
   match-formatting, external-compare apply, save mark-clean, mode switch,
   revert). Active mutations go through the `withWorkingFilesDraft` seam
   (recording draft → compute + check out changed chapters → validate →
   re-check gate → commit → typed result); incoming-content applies go
   through the sibling `runIncomingMutation` boundary. Both are built on the
   recording draft (`makeRecordingDraft` / `chapterForWrite`) → `commit`.
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
  ├── lintPipeline           filter(lintScopeFor)              → debounce(100) → switchMap → MirrorFeed.analyzeLint command → (result router) → FindingsStore (onion slice)
  │                          // gated off (Effect.void) in plain mode via analysisDisabledInMode
  ├── sousPipeline           filter(sousScopeFor)              → debounce(100) → switchMap → MirrorFeed.analyzeSous command → (result router) → FindingsStore (sous slice)
  │                          // gated off in plain mode; parallel to lint on its own clock
  ├── saveStatusPipeline     filter(isSaveStatusRelevant)      → tap → SaveStatusStore
  ├── structureMaintenancePipeline  filter(userEdit && dirtyTextContent) → debounce(16) → mapEffect → editor writeback (metadata: sid/inPara/structural-empty + residual char repair)
  │                          // gated off at fire time in plain mode
  ├── overlayTickPipeline    filter(kind ≠ metadataOnly)       → debounce(16)  → LayoutTickStore.bump
  ├── searchRerunPipeline    filter(isSearchRerunRelevant)     → debounce(250) → tap → rerunSearch(currentTerm)
  │                          // undo/redo/programmaticFix/import only — userEdit excluded
  │                          // (replace already re-runs synchronously)
  ├── dirtyBufferPipeline    filter(isDirtyBufferRelevant)     → MirrorFeed.writeBackup command → (result router) → DirtyBufferStore
  │                          // crash-recovery; see crash-recovery-autosave.md
  ├── tokenFixpointPipeline  filter(lintScopeFor) → debounce(250) → re-lex bytes → console.error on I2 divergence
  │                          // DEV only (import.meta.env.DEV && !analysisDisabled); never mutates state
  └── recoveredConflictTrackerSubscriber
                             → for each tracked chapter still in tracker, clear if post-commit `dirty === false`
```

Latency budget (typical chapter):

| Stage                            | Cost                          |
| -------------------------------- | ----------------------------- |
| `editorState.toJSON()`           | ~2-6 ms (Psalm 119, measured) |
| `applyPatch` (`lexicalToTokens`) | ~5 ms                         |
| React listener fan-out           | synchronous, sub-ms           |
| `PubSub.publish` fork            | sub-ms                        |

Selection-only commits skip everything but the no-op patch and PubSub
publish (no `toJSON`, no token recompute).

## Path 2: A programmatic (active) flow

Every active mutation — format, prettify, match-formatting, lint-fix — goes
through one validated seam, `withWorkingFilesDraft` in
`src/app/domain/project/workingFileCommand.ts`. The call site supplies a
`mutate` that computes on a **recording draft** (it may `await` freely — the
draft is not the store) and **checks out** only the chapters it actually
changes; the seam measures `affected` from those checkouts and returns a typed
result the caller branches on:

```ts
const result = await withWorkingFilesDraft({
  workingFilesStore,
  interactionGate,
  commitMeta: {
    kind: "programmaticFix",
    dirtyTextContent: true,
    // scope is MEASURED from checkouts (the affected chapter list). Opt into
    // { project: true } only for genuine whole-snapshot semantics (a version
    // switch / import, where books may be added or removed).
  },
  // Compute ONLY — no UI/lint/editor side effects (the commit is not validated
  // yet). May `await` freely (the draft is not the store). Check out a chapter
  // with `chapterForWrite` ONLY when actually changing it; the seam derives
  // `affected` from those checkouts. Return the business value only.
  mutate: async (draft) => {
    for (const ref of candidates) {
      const next = await transform(ref);
      if (!next) continue; // unchanged — don't check out
      const chapter = draft.chapterForWrite(ref); // checkout ⇒ affected
      if (chapter) chapter.currentTokens = next;
    }
    return report;
  },
});
// result.kind: "committed" | "unchanged" | "aborted"
if (result.kind === "committed") {
  // Follow-through (history record, diff/lint refresh, editor sync, toast)
  // sequences on the result here — it never runs on an abort.
}
```

Internally the seam does: branch a recording draft → run `mutate` (compute,
awaits ok, checks out the chapters it changes) → if nothing was checked out,
`unchanged` → re-read latest and **validate** the checked-out chapters weren't
replaced underneath (identity, not text) → **re-check the interaction gate** →
**commit** by overlaying only the affected chapters onto the latest read, or —
when a book was rebuilt wholesale — committing the draft's books wholesale
(validated by whole-state identity) → return a typed result. On a stale or
gate-closed abort, the result is `aborted` and no caller follow-through fires.

The seam composes the **same** validated primitives
(`captureChapterIdentities` / `chapterIdentitiesUnchanged` /
`overlayAffectedChapters`) as the incoming-reconciliation boundary below, so
there is one lost-update contract in the codebase, not two. The history
capture/record pair (`captureHistory` before the mutation, `recordHistory` with
the measured `affected` after it commits), notifications, and per-action reports
stay at the call site — they're genuinely per-action UX, sequenced on the
returned result.

### The underlying primitive: `draftWithChapters`

`draftWithChapters(refs)` only shallow-copies the chapters in `refs`;
everything else in the draft **aliases** the store's array. The seam never
mutates the aliased entries, so the pre-draft `read()` stays a valid rollback
baseline. This is why we replaced `structuredClone` rollback baselines (the
old "deep-copy before, mutate in place, restore on undo" pattern): the deep
clone was ~1.5 s per project on Psalm 119; structural sharing is O(books) ×
O(chapters-per-book) plus the chapters you actually touch.

The reason the seam validates rather than just drafting-and-committing in one
stack frame: `mutate` is allowed to `await`. A raw `draft → mutate → commit`
that awaited between draft and commit would let another commit (a keystroke, a
structure-maintenance writeback, an incoming apply) land in the store, and the
draft — still aliasing the _old_ untouched chapters — would clobber it on
bulk-commit. The seam's identity re-check after the await is what makes the
async mutator safe.

### Validated incoming-mutation boundary

Awaited computations against incoming remote / external-compare content commit
through the sibling boundary `runIncomingMutation` in
`src/app/domain/project/compare/applyIncomingToStore.ts`, which is the same
shape:

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
2. For each chapter, write `canonicalSnapshotToTokens(targetSnapshot)` into
   `chapter.currentTokens`, then `markChapterDirty` to re-derive the dirty
   flag. No mode parameter — tokens are mode-independent.
3. Bulk-commit with `kind: "undo"` (or `"redo"`).
4. If the visible chapter was touched, `setEditorContent` re-derives the
   shaped display tree from the new tokens and pushes it into Lexical (tagged
   `programaticIgnore` so the bridge does not re-publish), then schedules a
   deferred restore fiber: sleep 50 ms → focus the editor, restore selection
   by `data-id`, restore scroll position.
5. `lintScopeFor` in `commitFilters.ts` **includes** `undo`/`redo` — replay
   commits carry precise chapter scope, so the main lint pipeline re-lints
   exactly the touched books automatically. No separate post-undo relint hook
   is needed or wired.

The deferred restore exists because pushing content into Lexical, focusing,
and scrolling all fight each other if they happen in one frame. The 50 ms
pause lets Lexical reconcile before we touch focus / selection / scroll.
Back-to-back undos interrupt the in-flight restore fiber and reschedule —
only the last entry's restore actually runs.

See `custom-history.md` for the full history model.

## Editor tag taxonomy

`WorkingFilesBridgePlugin` classifies a Lexical update by inspecting tags on
the update. The taxonomy is defined in `src/app/data/editor.ts`:

| Tag                              | Set by                                   | Bridge behavior                                                                                         |
| -------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `programatic-ignore`             | Any code calling `setEditorContent`      | Skip — the store produced this state                                                                    |
| `programmatic-do-run-changes`    | Fix-it / autofix write-backs             | Classify as `programmaticFix`                                                                           |
| `programmatic-structural-fix`    | Structure-maintenance pipeline writeback | Classify as `structuralFixup` (still published — co-occurs with `HISTORY_MERGE_TAG` for undo exclusion) |
| `HISTORY_MERGE_TAG` (Lexical)    | History glue, structural-fixup           | Skip _unless_ structural-fixup is also set                                                              |
| `HISTORIC_TAG` (Lexical)         | Undo/redo replay                         | Classify as `undo`                                                                                      |
| (none of the above, dirty)       | User typing / paste                      | Classify as `userEdit`                                                                                  |
| (none, no dirty elements/leaves) | Cursor movement                          | Publish `selectionOnly` / `metadataOnly`                                                                |

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
- `src/app/domain/project/workingFileCommand.ts` — `withWorkingFilesDraft`
  (the active-mutation seam)
- `src/app/domain/project/compare/applyIncomingToStore.ts` —
  `runIncomingMutation` (the incoming-content boundary)
- `src/app/domain/editor/pipelines/*.ts`
  - `structureMaintenancePipeline.ts` — metadata pass (sid/inPara/structural-empty) + residual char repair, 16 ms
  - `sousPipeline.ts` — sends `analyzeSous` to MirrorFeed, 100 ms debounce
  - `lintPipeline.ts` — sends `analyzeLint` to MirrorFeed, 100 ms debounce
  - `tokenFixpointPipeline.ts` — dev-only I2 re-lex alarm, 250 ms
- `src/app/ui/contexts/WorkspaceContext.tsx` — pipeline forks + store wiring
- `src/app/ui/hooks/useCustomHistory.ts` — replay path
- `src/app/ui/hooks/utils/editorUtils.ts` — `setEditorContent`,
  `collectFileTokens`
