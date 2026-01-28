# USFM As Tree Refactor (PRD)

## Table Of Contents
- Context & Goals
- Design Snapshot (What We Are Building)
- Invariants & Data Shapes
- Adapter: Flat Token View
- Mode Transforms (Flat <-> Tree)
- Regular-Mode Editing Operations
- Downstream Call Sites (What Breaks)
- Testing & Verification
- Rollout / Migration Notes

---

## Context & Goals
We are refactoring paragraph structure handling in the editor.

Current state: paragraphing/poetry visuals are derived from a flat token stream using forward-scanned flags like `inPara` / `data-in-para`. This is proving visually inconsistent and brittle.

Goal state:

- Regular mode is structurally stable and WYSIWYG-correct: paragraphs/poetry are represented as real top-level block containers.
- USFM/Raw modes may remain a flat token stream representation.
- Downstream logic (serialize/export, linting, prettify, search/NLP) should not become mode-aware.
- Preserve the "adjacent token" mental model for linting by providing a flat token view adapter.
- `Enter` semantics remain: `Enter` inserts a `LineBreakNode` inside the paragraph container (not a paragraph split).
- Nested editor nodes (notes/footnotes) continue to work.

Non-goals:

- Fix token locking/mutability correctness (separate epic).
- Perfect Paragraphing Mode stamping UX (prototype; can be reworked later).
- Auto-convert typed `\\p` markers into paragraph containers in Regular mode (avoid jank).

---

## Design Snapshot (What We Are Building)
Regular mode uses a tree shape:

- Lexical root children are only `USFMParagraphNode` blocks.
- Paragraph marker (`p`, `q1`, etc.) is stored on the block container.
- Child content is still token-like nodes (`USFMTextNode`, `LineBreakNode`, `USFMNestedEditorNode`, etc.).

USFM/Raw modes can continue to use the existing flat token stream shape.

To avoid mode-awareness leaking into every callsite, we introduce an adapter:

`materializeFlatTokensFromSerialized(rootChildren) -> SerializedLexicalNode[]`

This returns an on-demand, flat, reading-order list of token nodes.

- If input is already flat: DFS yields the same tokens.
- If input is tree paragraphs: emit a synthetic `\\<paraMarker>` token per paragraph block, then DFS-yield the paragraph's children.

Everything downstream consumes the flat list (export, lint, prettify, search).

Styling direction by mode:

- Regular: paragraph/poetry visuals are driven by the paragraph container DOM + CSS (no runtime DOM scanning for indentation).
- USFM: we keep best-effort dynamic styling where needed (e.g. current poetry indentation logic), but keep it scoped to this mode.
- Raw: no helpers; do not apply poetry indentation helpers.

---

## Invariants & Data Shapes

Regular mode invariants (enforced):

- Root children are only `USFMParagraphNode`.
- No inline nodes directly under root.
- Each `USFMParagraphNode` contains at least one editable child (typically a single-space `USFMTextNode`).

Node type changes:

- Replace `USFMElementNode` with `USFMParagraphNode`.
- Serialized node `type` becomes `usfm-paragraph-node` (preferred).
- Update `src/app/data/editor.ts` constant(s) accordingly.

Deprecations:

- `USFMTextNode.inPara` no longer needed for styling/logic in Regular mode.
- UI styling should derive paragraph/poetry styling from paragraph container marker, not `data-in-para`.

Nested editors:

- Continue using `USFMNestedEditorNode` as a decorator node.
- DFS traversal should still recurse into nested editor state when materializing the flat token view.

---

## Adapter: Flat Token View
We will add an adapter module that provides:

- `materializeFlatTokensFromSerialized(nodes): SerializedLexicalNode[]`
- (optional) `walkFlatTokensSlidingWindow(tokens, { before, after })` to make linting "adjacent token" comparisons trivial.

Synthetic paragraph marker token emission:

- For each `USFMParagraphNode(marker)`, emit a `SerializedUSFMTextNode` that represents `\\<marker>`.
- The synthetic node must be marked/identified so it is never persisted back into Regular-mode DOM unless explicitly converting modes.
- Keep synthetic fields minimal; avoid inventing ids/sids that later get saved.

Downstream callsites should accept a `SerializedLexicalNode[]` and be fed the adapter output.

---

## Mode Transforms (Flat <-> Tree)
We need lossless transforms between representations.

Flat -> Regular:

- Scan tokens in reading order.
- Start a new paragraph block at each valid paragraph marker token.
- Tokens after a paragraph marker belong to that paragraph until the next paragraph marker.
- Content before the first paragraph marker is wrapped into a default `p` paragraph.

Regular -> Flat:

- For each paragraph block, emit a real paragraph marker token (not synthetic) then emit the paragraph children tokens.
- Output should match what current USFM export expects.

Mode switching should be deterministic and reversible (round-trip tests).

---

## Regular-Mode Editing Operations
Regular mode should keep edits discrete to avoid WYSIWYG jank.

Paragraph insertion (Action Palette):

- If there is content after the caret within the current paragraph, split and move the remainder into a new paragraph block with the inserted marker.
- If caret is at end (or effectively no remainder), insert an empty new paragraph block adjacent to the current paragraph.

Typed marker insertion:

- In Regular mode, typing `\\p` etc. should not trigger structural reparenting.

Structural enforcement:

- `maintainDocumentStructure` (or a mode-scoped sibling) enforces the root-children paragraph invariant in Regular mode.

---

## Downstream Call Sites (What Breaks)
This refactor touches most flows that assume root children include a single Lexical `paragraph` wrapper or that rely on `inPara`.

Known areas:

- Node registration: `src/app/ui/components/blocks/Editor.tsx`, `src/app/ui/components/blocks/ReferenceEditor.tsx`, `src/app/ui/components/blocks/NestedEditor.tsx`.
- Parsing/initial lexical state wrapper currently uses `type: "paragraph"`: `src/app/domain/editor/serialization/fromSerializedToLexical.ts`.
- Mode switching / serialized adjustments: `src/app/ui/hooks/useModeSwitching.tsx`, `src/app/domain/editor/utils/modeAdjustments.ts`.
- Export: `src/app/domain/editor/serialization/lexicalToUsfm.ts` should consume flat token adapter output.
- Styling: `src/app/ui/effects/usfmDynamicStyles/calcStyles.ts` currently reads `data-in-para`.
  - New expectation: this runs only in USFM mode; Regular uses container DOM + CSS; Raw does not run it.
- Lint flows: `src/app/domain/editor/listeners/lintChecks.ts`, hooks like `src/app/ui/hooks/useLint.tsx`, `src/app/ui/hooks/useLintFixing.tsx`.
- Prettify: `src/app/domain/editor/utils/prettifySerializedNode.ts` and tests.
- Paragraphing mode: `src/app/domain/editor/plugins/ParagraphingPlugin.tsx`, `src/app/domain/editor/utils/paragraphingUtils.ts`.
- Format matching: `src/app/domain/editor/utils/matchFormatting.ts`.
- Search plain-text serialization: `src/app/domain/search/search.utils.ts`.

---

## Testing & Verification
Unit:

- `materializeFlatTokensFromSerialized` for both shapes.
- Round-trip tests for flat<->regular transforms.
- Sliding window iterator tests (if added).

Integration:

- Ensure USFM export output matches previous for a representative set (chapters/verses/poetry/nested notes).
- Ensure linting still finds expected issues across paragraph boundaries.

Manual:

- Regular mode: insert paragraph via Action Palette; verify split-and-move behavior.
- Poetry: verify consistent indentation/visual grouping.
- Enter: verify it inserts linebreak within paragraph, not new paragraph.

---

## Rollout / Migration Notes
- Implement in small, verifiable steps; broad refactor expected.
- Prefer central adapter changes first, then migrate callsites to use adapter.
- Defer Paragraphing Mode UX polishing; ensure it remains functional or feature-flagged.

--------------------------------------------------------------------------------

## task: 1 - Introduce USFMParagraphNode (rename USFMElementNode)

```yaml
id: 1
category: core
complexity: high
depends_on: []
touches:
  - src/app/domain/editor/nodes/USFMElementNode.ts
  - src/app/data/editor.ts
  - src/app/ui/components/blocks/Editor.tsx
  - src/app/ui/components/blocks/ReferenceEditor.tsx
  - src/app/ui/components/blocks/NestedEditor.tsx
  - src/test/helpers/testEditor.ts
  - (all imports/guards referring to USFMElementNode)
passes_when:
  - Editor loads with the node registered
  - Serialized type is "usfm-paragraph-node"
  - isSerializedElementNode/isSerializedParagraphNode guards updated everywhere
```

Steps:

1. Rename `src/app/domain/editor/nodes/USFMElementNode.ts` to `src/app/domain/editor/nodes/USFMParagraphNode.ts`.
2. Rename class `USFMElementNode` -> `USFMParagraphNode` and exported type guard helpers accordingly.
3. Change node type constant in `src/app/data/editor.ts` from `USFM_ELEMENT_NODE_TYPE = "usfm-element-node"` to `USFM_PARAGRAPH_NODE_TYPE = "usfm-paragraph-node"`.
4. Update all imports and node registration arrays to reference `USFMParagraphNode`.
5. Update serialized type unions `USFMNodeJSON` to use `USFMParagraphNodeJSON`.
6. Ensure `createDOM` returns block-ish DOM (existing uses `p` for marker `p`, otherwise `span`; adjust to always block container in Regular mode).
7. Run unit tests that cover editor creation helpers.

Notes:

- Avoid making styling decisions here beyond stable DOM element type and `data-marker` / `data-token-type` attributes.

--------------------------------------------------------------------------------

## task: 2 - Regular-mode root shape and wrapping during parse

```yaml
id: 2
category: core
complexity: high
depends_on: [1]
touches:
  - src/app/domain/editor/serialization/fromSerializedToLexical.ts
passes_when:
  - Regular-mode lexical root children are USFMParagraphNode(s)
  - No Lexical built-in "paragraph" wrapper is required
```

Steps:

1. Replace the current wrapper in `parsedUsfmTokensToJsonLexicalNode` that creates `{ type: "paragraph" }`.
2. For Regular-mode initial load, build root children as one or more `usfm-paragraph-node` nodes.
3. Implement the flat->regular scan behavior: start new paragraph node on paragraph marker tokens.
4. Default paragraph marker for leading content: `p`.
5. Ensure nested editor tokens are handled as-is.
6. Add tests for parse output shape for a simple doc with `\\p`, `\\q1` markers.

--------------------------------------------------------------------------------

## task: 3 - Flat token adapter (materializeFlatTokensFromSerialized)

```yaml
id: 3
category: core
complexity: high
depends_on: [1]
touches:
  - src/app/domain/editor/utils/(new) materializeFlatTokensFromSerialized.ts
  - src/app/domain/editor/utils/serializedTraversal.ts
  - unit tests (new)
passes_when:
  - Adapter returns correct flat order for both flat and paragraph-tree shapes
  - Nested editor content is included in correct order
  - Synthetic paragraph marker tokens emitted for paragraph containers
```

Steps:

1. Create `src/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts`.
2. Detect paragraph container nodes (`usfm-paragraph-node`).
3. Emit a synthetic paragraph marker `SerializedUSFMTextNode` (minimal fields) per paragraph container.
4. DFS-walk paragraph children using existing traversal utilities.
5. Add unit tests:
   - Flat input: output equals DFS tokens (no synthetic marker duplication).
   - Tree input: output begins with synthetic marker, then children tokens.
   - Nested editor nodes: output includes nested children in-order.
6. (Optional) Add `walkFlatTokensSlidingWindow` helper for linting.

--------------------------------------------------------------------------------

## task: 4 - Update serialization/export to consume adapter

```yaml
id: 4
category: core
complexity: medium
depends_on: [3]
touches:
  - src/app/domain/editor/serialization/lexicalToUsfm.ts
  - any other "serialize to plain text" utilities
passes_when:
  - serializeToUsfmString works for both shapes without branching
```

Steps:

1. Update `serializeToUsfmString` entrypoint to call adapter on root children.
2. Keep `traverseForUsfmString` recursive but feed it the flat list.
3. Add/adjust tests to cover Regular-mode paragraph container shape.

--------------------------------------------------------------------------------

## task: 5 - Mode switching: Regular <-> Source uses tree<->flat transforms

```yaml
id: 5
category: core
complexity: high
depends_on: [2, 3]
touches:
  - src/app/ui/hooks/useModeSwitching.tsx
  - src/app/domain/editor/utils/modeAdjustments.ts
passes_when:
  - Switching to Source produces a flat stream (including nested flatten)
  - Switching back to Regular produces paragraph containers
  - No destructive USFM round-trip required
```

Steps:

1. Replace current `adjustSerializedLexicalNodes(... flattenNested: true)` flow with explicit tree->flat conversion using the adapter and a "persistable" version of paragraph marker tokens.
2. Implement flat->regular rebuild on switching back.
3. Preserve node ids where possible; do not generate new ids unnecessarily.
4. Ensure DOM class toggles remain correct.

--------------------------------------------------------------------------------

## task: 6 - Regular-mode structural enforcement (maintainDocumentStructure)

```yaml
id: 6
category: core
complexity: high
depends_on: [1, 2]
touches:
  - src/app/domain/editor/listeners/maintainDocumentStructure.ts
passes_when:
  - In Regular mode, root children remain paragraph nodes
  - Stray nodes are wrapped into a default paragraph
  - Paragraph nodes are not accidentally deleted/merged
```

Steps:

1. Add Regular-mode-only checks: root children must be paragraph nodes.
2. If a root child is not a paragraph node, wrap/move it into a new paragraph node with marker `p`.
3. Ensure each paragraph has an editable fallback child.
4. Verify existing verse/numberRange invariants still apply inside paragraph containers.

--------------------------------------------------------------------------------

## task: 7 - Paragraph insertion in Regular mode (split-and-move)

```yaml
id: 7
category: core
complexity: high
depends_on: [1, 6]
touches:
  - src/app/domain/editor/utils/insertMarkerOperations.ts
  - src/app/domain/editor/plugins/ContextMenu/ActionPalette.tsx (if needed)
passes_when:
  - Inserting a paragraph marker splits current paragraph at caret
  - Content after caret moves into new paragraph until next paragraph boundary
```

Steps:

1. Add a Regular-mode code path for paragraph insertions.
2. Determine current paragraph container from selection anchor.
3. If caret is mid-paragraph, split the child list at the caret position (may require splitting a `USFMTextNode`).
4. Move remainder children into a newly created paragraph node with the inserted marker.
5. Place selection at the beginning of the moved content.

--------------------------------------------------------------------------------

## task: 8 - Remove `inPara` dependencies in UI styling

```yaml
id: 8
category: ui
complexity: high
depends_on: [1, 6]
touches:
  - src/app/ui/effects/usfmDynamicStyles/calcStyles.ts
  - any CSS expecting data-in-para
passes_when:
  - Regular mode poetry/paragraph visuals are handled by container DOM + CSS (no data-in-para)
  - USFM mode keeps best-effort dynamic indentation as needed
  - Raw mode does not apply poetry dynamic indentation helpers
```

Steps:

1. Restrict `calcStyles` / dynamic poetry stylesheet behavior to USFM mode only.
2. Regular mode: derive indentation/styling from paragraph container marker (`data-marker` on `usfm-paragraph-node` DOM) using CSS.
3. Raw mode: ensure no poetry indentation helper runs.
4. Remove Regular-mode reliance on `data-in-para`.
5. Ensure both main editor and reference editor still look correct.

--------------------------------------------------------------------------------

## task: 9 - Update paragraphing utilities to use adapter

```yaml
id: 9
category: core
complexity: medium
depends_on: [3]
touches:
  - src/app/domain/editor/utils/paragraphingUtils.ts
  - src/app/domain/editor/utils/paragraphingUtils.test.ts
passes_when:
  - Marker extraction works in both shapes
  - Tests no longer assume a built-in "paragraph" wrapper
```

Steps:

1. Replace `walkNodes(nodes)` usage where it assumes top-level paragraph wrapper.
2. Use the adapter output to extract markers.
3. Update tests to locate the correct paragraph nodes (new type).

--------------------------------------------------------------------------------

## task: 10 - Update lint flows to consume adapter + sliding window

```yaml
id: 10
category: core
complexity: high
depends_on: [3]
touches:
  - src/core/data/usfm/lint.ts
  - src/app/domain/editor/listeners/lintChecks.ts
  - src/app/ui/hooks/useLint.tsx
  - src/app/ui/hooks/useLintFixing.tsx
passes_when:
  - Linting sees correct token adjacency across paragraph boundaries
  - Autofix operations still apply safely
```

Steps:

1. Provide a `prev/curr/next` iterator over the flat token view.
2. Ensure paragraph boundaries are represented by explicit paragraph marker tokens.
3. Verify lint checks that depend on `inPara` are refactored to use paragraph marker tokens.
4. Update any autofix functions that assumed flat siblings.

--------------------------------------------------------------------------------

## task: 11 - Prettify + format matching + search use adapter

```yaml
id: 11
category: core
complexity: high
depends_on: [3]
touches:
  - src/app/domain/editor/utils/prettifySerializedNode.ts
  - src/app/domain/editor/utils/matchFormatting.ts
  - src/app/domain/search/search.utils.ts
passes_when:
  - These utilities accept either representation via adapter
```

Steps:

1. Prettify: operate on flat token view; if called in Regular mode, rehydrate into paragraph tree.
2. Match formatting: ensure `sourceNodes` / `targetNodes` are fed adapter output.
3. Search plain-text serialization: ensure paragraph markers are included/excluded consistently via the adapter.

--------------------------------------------------------------------------------

## task: 12 - Cleanup: remove/ignore USFMTextNode.inPara in Regular mode

```yaml
id: 12
category: core
complexity: medium
depends_on: [6, 8]
touches:
  - src/app/domain/editor/nodes/USFMTextNode.ts
  - insertion ops that set inPara
passes_when:
  - Regular-mode features do not read/write inPara
  - Source mode may still populate it if needed for legacy flows
```

Steps:

1. Stop writing `inPara` during Regular-mode operations.
2. Remove DOM dataset usage that relies on `inPara`.
3. Keep the field temporarily if other flows still serialize it, but mark as deprecated in code.

--------------------------------------------------------------------------------

## task: 13 - Full regression pass

```yaml
id: 13
category: qa
complexity: high
depends_on: [1,2,3,4,5,6,7,8,9,10,11,12]
touches: []
passes_when:
  - pnpm test:unit passes
  - Key manual flows validated (mode switching, export, poetry visuals)
```

Steps:

1. Run unit tests.
2. Manually test:
   - Switch Regular <-> Source, edit in both, verify no corruption.
   - Insert paragraph markers via Action Palette in Regular mode; verify split.
   - Poetry indentation stable.
   - Nested footnotes still serialize.
