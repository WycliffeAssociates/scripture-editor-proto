# Progress - usfm-as-tree-refactor

## 2026-01-28
- Intent: refactor paragraph structure handling so Regular mode is structurally correct and visually consistent.
- Replace the current flat token + forward-scanned flags approach (inPara / data-in-para) with real top-level paragraph containers.
- Regular mode invariant: Lexical root children are only USFMParagraphNode blocks (type: usfm-paragraph-node) storing a paragraph marker (p, q1, etc.).
- USFM/Raw modes may remain a flat token stream, but should not force downstream code to become mode-aware.
- Add a canonical adapter materializeFlatTokensFromSerialized(rootChildren) that produces a reading-order flat token view for both shapes, including nested editors.
- Update mode switching to use deterministic, reversible transforms between flat and tree representations.
- Migrate export, lint, prettify, formatting matching, and search utilities to consume the adapter output.
- Keep Enter semantics: Enter inserts a LineBreakNode inside the current paragraph container (not a paragraph split).
- Note: PRD tasks were converted from the existing markdown PRD into plans/usfm-as-tree-refactor/prd-usfm-as-tree-refactor.json.

- Completed Task 1: renamed USFMElementNode -> USFMParagraphNode, updated serialized type to usfm-paragraph-node, and updated registrations/guards/imports.

- Completed Task 2: on initial parse, group flat parsed token nodes into top-level USFMParagraphNode containers based on paragraph markers (defaulting leading content to p).

- Completed Task 3: created materializeFlatTokensFromSerialized adapter in src/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts. The adapter handles both flat token streams and paragraph-tree structures, emitting synthetic paragraph marker tokens for containers. Added walkFlatTokensSlidingWindow helper for linting. 9 unit tests passing.

- Completed Task 4: updated serializeToUsfmString in src/app/domain/editor/serialization/lexicalToUsfm.ts to use the flat token adapter. Removed manual recursive traversal; now iterates over adapter output. Works for both flat and tree structures without branching.

- Completed Task 5: implemented explicit tree↔flat transforms for mode switching. Added `flattenParagraphContainersToFlatTokens` (tree→flat for Source mode) and `groupFlatTokensIntoParagraphContainers` (flat→tree for Regular mode) in modeAdjustments.ts. Updated useModeSwitching.tsx to use these transforms. Node IDs preserved where possible.

- Completed Task 6: added Regular-mode structural enforcement in maintainDocumentStructure.ts. New `enforceRegularModeParagraphStructure` function ensures root children are USFMParagraphNode containers, wraps stray nodes, and ensures paragraphs have editable fallback children. Added `$createUSFMParagraphNode` factory function.

- Completed Task 7: implemented paragraph insertion split-and-move for Regular mode. `$insertPara` now checks mode and dispatches to `$insertParaRegularMode` or `$insertParaSourceMode`. Regular mode finds parent paragraph container, splits anchor node if mid-text, creates new USFMParagraphNode with inserted marker, moves remainder children into new paragraph. Updated callers (markerActions.ts, ParagraphingPlugin.tsx, manageUsfmMarkers.ts) to pass `mode` in `BaseInsertArgs`.

- Completed Task 9: updated paragraphingUtils to use the flat token adapter. `extractMarkersFromSerialized` now uses `materializeFlatTokensArray` instead of `walkNodes`, which properly handles both flat and tree structures including synthetic paragraph markers from containers. `stripMarkersFromSerialized` now flattens paragraph containers (doesn't preserve the container, just the stripped children). Updated tests to reflect new behavior where tree structure produces synthetic markers for each container.

- Completed Task 8: removed Regular-mode reliance on `data-in-para` by styling poetry/paragraph visuals off the paragraph container marker (`data-marker`). Dynamic poetry indentation helpers are now scoped to USFM mode only.
