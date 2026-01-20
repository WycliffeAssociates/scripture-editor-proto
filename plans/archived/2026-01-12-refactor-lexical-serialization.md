4. Lexical Serialization Decomposition
Markdown:plans/current/2026-01-12-refactor-lexical-serialization.md
# Refactor Plan: Decompose lexicalToUsfm.ts

## Context
`src/app/domain/editor/serialization/lexicalToUsfm.ts` contains `buildSidContentMapForChapter`, a complex function with a dense loop handling multiple responsibilities (footnotes, verses, duplicate SIDs, ordering).

## Objective
Refactor the loop in `buildSidContentMapForChapter` into distinct handler functions to improve readability and maintainability.

## Proposed Refactoring

### 1. Create Helper Functions
Extract logic inside the `for` loop into:

```typescript
function handleNestedEditorNode(
    node: SerializedLexicalNode,
    state: TraversalState
): void { ... }

function handleUSFMTextNode(
    node: SerializedLexicalNode,
    state: TraversalState
): void { ... }

function handleElementNode(
    node: SerializedLexicalNode,
    state: TraversalState
): void { ... }
2. Define TraversalState
Encapsulate the mutable state passed between iterations:
code
TypeScript
type TraversalState = {
    map: SidContentMap;
    activeVerseKey: string | null;
    previousBlockKey: string | null;
    duplicateSidCounters: Map<string, number>;
    footnoteCounters: Map<string, number>;
    blockCounter: number;
    chapterNodeList: SerializedLexicalNode[]; // context
}
3. Simplify buildSidContentMapForChapter
The main function should look like:
code
TypeScript
export function buildSidContentMapForChapter(chapterNodeList: ...): SidContentMap {
    const state: TraversalState = initializeState(chapterNodeList);

    for (let i = 0; i < chapterNodeList.length; i++) {
        const node = chapterNodeList[i];
        if (isSerializedUSFMNestedEditorNode(node)) {
            handleNestedEditorNode(node, i, state);
            continue;
        }
        if (isSerializedUSFMTextNode(node) && node.sid) {
            handleVerseNode(node, i, state);
            continue;
        }
        // ... handle other cases
    }
    return state.map;
}
```
Implementation Steps
Analyze lexicalToUsfm.ts: Identify closure variables used in the loop.
Define State Interface: Create the TraversalState type.
Extract Methods: Move logic for Footnotes and Verses into separate functions within the same file (or a new lexicalToUsfm.handlers.ts if it's too large).
Refactor Loop: Replace inline logic with calls to handlers.
Verification
pnpm test:unit: Crucial, as is logic affects Diffing and Save.
Focus on useSave.test.ts or lexicalToUsfm.test.ts.



I've cleared the ticket queue and reworked the ticket script ot make clearer the conventions for epics/plans: Please redo the tickets with update tk script