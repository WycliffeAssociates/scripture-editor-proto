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