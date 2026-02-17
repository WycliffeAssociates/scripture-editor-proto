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
1. In app hook/action: resolve scope (`chapter | book | project`) from `mutWorkingFilesRef`.
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
