# Agent Learnings
The purpose of this file is for agent to document learnings and patterns that emerge during development or things that might trip up the agent in the future.

# Lexical: 
## Async Lexical editor.update
```ts
editor.update(() => {
  // ...
})
```
is async in that the closure is a callback.  Doing an update, setting a variable inside that closure, and then doing an immediate read of that varianble, or trying to immediately read any updates made in that editor state will not be reflected.  Either a task must be enqeueued, or a small timeout can be added. For actual usfm loop, this is usually, fine, but a sort sleep timeout may be needed in vitest tests. For example:
```ts
 editor.update(() => {
        // psuedo code
        newNode.select();
      });

      // Check that cursor moved away from locked node
      await new Promise((resolve) => setTimeout(resolve, 100));
      // editor read execute after await the proimse pushed to task queue above.  An immediate read would not reflect the updated selection
      editor.getEditorState().read(() => {})
```

# USFM Pipeline Boundaries (Important)
When building new USFM actions (formatting, matching, lint autofix, etc), do **not** create new abstraction layers for App <-> Core or Paragraph <-> Flat transforms unless absolutely required.

## Preferred pipeline (same shape as prettify/format)
1. In app hook/action: resolve scope (`chapter | book | project`) by
   reading `workingFilesStore.read()` (or `workingFilesStore.draftWithChapters([...])` if you plan to mutate and commit).
2. For each chapter in scope: flatten from lexical state using existing utilities.
3. Run pure core transform on flat token stream.
4. Convert back to app shape using existing rehydrate utilities.
5. Update chapter state, dirty flags, diffs/lint, and editor content.

## Reuse these existing utilities
- `materializeFlatTokensArray(...)` for flattening serialized lexical nodes, though prefer the two bottom functions that include additional wrapping logic. 
- Existing paragraph/group/wrap helpers in `modeTransforms.ts` for rebuilding lexical shape.
- Existing token-stream adapter functions in `prettifySerializedNode.ts` (extend there if needed, do not fork).
  - `lexicalRootChildrenToUsfmTokenStream` for converting lexical shape to flat token stream.
  - `usfmTokenStreamToLexicalRootChildren` for converting flat token stream to lexical shape.

## Anti-patterns to avoid
- Adding new alias/duplicate adapter functions that do the same flatten/rehydrate job with different names.
- Creating new one-off root-shape/direction detection logic in multiple places.
- Building a separate conversion pipeline for each feature (prettify/match/lint should share the same conversion boundary).

## Rule of thumb
If a new feature needs flat tokens, plug into the current conversion boundary and core pass.  
Prefer improving one shared adapter over creating another parallel adapter.

# Editor scheduling (Lexical)

## Single-authority `editor.setEditable`

Only **one** plugin should drive `editor.setEditable()`. Multiple plugins
each running their own `useEffect` that flips editability — even if they
happen to agree most of the time — produce races where which call landed
last decides the on-screen state. The shipping pattern:
`GateEditablePlugin` in `Editor.tsx` ANDs the workspace
gate (`requireGateOpen(gate)`) with the mode (`mode !== view`) and is the
sole caller of `setEditable`. `NestedEditor` mirrors the same gate-AND-mode
read locally so nested forms don't escape the gate.

Smell to watch for: two plugins both `useEffect`-ing on overlapping
conditions and both calling `editor.setEditable`. Pick one as the
authority, route everything through it.

# Validated incoming-mutation boundary

When a working-state commit derives from an **awaited** computation
(remote fetch, file pick, external-compare load, post-apply diff
recompute), normal "draft → mutate → commit in one stack frame" can't
hold. The boundary is `runIncomingMutation` in
`src/app/domain/project/compare/applyIncomingToStore.ts`:

1. Capture **object identities** of affected chapters (or the `read()`
   array identity for workspace-scope writes) before the await.
2. Compute on a private scratch — no draft held across the await.
3. After the await: re-read, abort if identities have been replaced
   (catches text edits AND save-rebases that change
   `sourceTokens`/`dirty` but not `currentTokens`; `selectionOnly`
   doesn't replace the object so it doesn't false-abort).
4. Recheck the workspace gate.
5. Commit synchronously from latest with `draftWithChapters` aliasing
   the untouched paths.

The `IncomingMutationScope` must match the write's scope: hunk / chapter
overlays validate chapter identities; whole-workspace writes
(`applyVersionSnapshotToWorkingFiles`) validate the array identity
instead, because a chapter added during the await would slip past a
chapter-scope check and get clobbered.

Rule of thumb: every `workingFilesStore.commit` in an incoming flow
either has no intervening `await` since its `read()`, or passes
through this boundary.

# Observable trackers (useSyncExternalStore + Effect subscriber)

A `Set<key>` or simple state primitive that drives **UI** reactivity
(disabling controls, changing routing) AND is mutated by an **Effect-side
subscriber** must be observable, not a plain class. The asymmetry trips
people: `WorkingFilesStore.commit()` notifies React synchronously and
publishes to the PubSub asynchronously. A naive Set the subscriber clears
won't notify React — the gating UI stays stale.

Pattern that works: the tracker exposes `subscribe(listener)` +
`getSnapshot()`, replaces a `snapshotCache` reference on every mutation,
and notifies listeners. UI reads via
`useSyncExternalStore(tracker.subscribe, tracker.getSnapshot)`. The
Effect-side subscriber's `clear()` notifies, React renders the
now-empty state, and the disabled controls re-enable.

`RecoveredConflictTracker` is the canonical example.

# Observe state, don't enumerate actions

When you find yourself adding `tracker.clear(...)` (or any equivalent
"this state is now stale, fix it") at every callsite of every revert /
save / programmatic-clean path, swap to a small subscriber that watches
the underlying truth and clears on observed match.
`recoveredConflictTrackerSubscriber` is `Stream.runForEach` over
`WorkingFilesStore.changes` that asks "is this tracked chapter clean
now?" on each commit. Catches every revert path uniformly, including
ones added later, without each path remembering the clear.

The reverse is also true: if your subscriber needs to distinguish "now
clean" from "transitioned to clean on this commit", you probably don't —
idempotent `clear()` + populate-only-on-initial-state means
post-state observation is sufficient.

# Cloud Publishing And Reconciliation
## State ownership split
- Cloud session is app-local and install-global.
- Per-project cloud status is app-local and keyed by project path.
- Export/share/import portability only strips project artifacts, not app-local cloud state, because session and mutable cloud status never live inside the project tree.

## Portable project boundary
- Use `src/core/persistence/portableProjectSanitization.ts` as the single rule for what should be stripped when a project crosses export/share/import boundaries.
- Today that means Git internals such as `.git`.
- Do not scatter new `.git` or portability checks across import/export adapters; extend the shared helper instead.

## Cloud orchestration logging
- The useful debug boundaries are:
  - open-time remote classification in `gitRemoteOpenStatus.ts`
  - save-time publish outcome in `gitRemotePublishCoordinator.ts`
  - replay planning/application in the Git provider adapters
- If a future cloud bug is hard to diagnose, add logs at those orchestration seams before adding UI-level logging.
