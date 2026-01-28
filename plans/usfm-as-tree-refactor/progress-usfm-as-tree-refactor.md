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
