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
