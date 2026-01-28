# USFM As Tree Refactor (Plan)

## TL;DR
We will stop faking paragraph structure with `inPara` flags in a flat token stream.

In Regular mode, paragraph markers become real Lexical block containers (`usfm-paragraph-node`), improving WYSIWYG consistency (especially poetry). USFM/Raw modes can remain a flat token stream. All downstream logic (export, lint, prettify, search/NLP) will consume a single canonical *flat token view* produced by an adapter (`materializeFlatTokensFromSerialized(...)`) so callsites are not mode-aware.

## Problem
The current approach flattens the USFM tree and "reads paragraph markers forward" as flags (`inPara` / `data-in-para`). This makes:

- Poetry indentation and paragraph visuals inconsistent.
- Paragraphing brittle across edits (structure is implied rather than represented).
- Features that need stable structure (serialization, prettify, large transforms) harder to reason about.

## Goals
- Regular mode is structurally stable and matches WYSIWYG expectations.
- Paragraph/poetry visuals are consistent by construction.
- Avoid spreading mode-awareness across serialization/linting/prettify/search.
- Preserve the "compare adjacent tokens" mental model for linting and similar logic.
- Keep `Enter` semantics: `Enter` inserts a `LineBreakNode` (not a paragraph split).
- Keep nested editors (notes/footnotes) supported.

## Non-Goals
- Re-design Paragraphing Mode stamping UX (prototype; can be reworked later).
- Make typed `\\p` etc. auto-restructure in Regular mode (avoid jank).
- Solve token locking / mutability issues (separate refactor).

## Core Decisions
### 1) Regular mode uses paragraph containers
In Regular mode, Lexical root children are *only* `USFMParagraphNode` blocks.

- Node `type`: `usfm-paragraph-node`.
- Stores paragraph marker on the container (e.g. `p`, `q1`, `m`).
- Contains existing inline/token nodes (`USFMTextNode`, `LineBreakNode`, `USFMNestedEditorNode`, etc.).
- `Enter` inserts `LineBreakNode` inside the current paragraph container.

We will rename/re-scope the current `USFMElementNode` to reflect this role (new file/class name), and update the `USFM_ELEMENT_NODE_TYPE` constant accordingly.

### 2) Remove `inPara` as a styling/logic dependency
`USFMTextNode.inPara` and UI styling that relies on `data-in-para` become obsolete in Regular mode. Paragraph context is derived from the nearest paragraph container ancestor (or from the flat token view adapter).

### 3) One adapter prevents mode-awareness from leaking
Introduce a single canonical adapter:

`materializeFlatTokensFromSerialized(rootChildren): SerializedLexicalNode[]`

This returns a flat list of token-like nodes in reading order:

- In USFM/Raw (already flat): DFS traversal yields tokens.
- In Regular (tree): for each paragraph container, emit a synthetic paragraph marker token (`\\<marker>`) then DFS-yield paragraph children (including nested editor contents).

All downstream operations consume this flat list.

On-demand computation is the default (no caching until perf demands it).

## Editing / Structural Operations
### Paragraph insertion (Action Palette)
In Regular mode, paragraph insertion is an explicit structural operation.

When inserting a paragraph marker at the cursor:

- If there is content after the caret within the current paragraph, split and move the remainder into a new `USFMParagraphNode(marker)`.
- Otherwise insert a new empty `USFMParagraphNode(marker)` adjacent to the current one.

Typed marker parsing should not auto-reparent content in Regular mode (avoid cursor/DOM jumpiness).

### Regular-mode invariants
Enforce in Regular mode via `maintainDocumentStructure` (or a mode-scoped equivalent):

- Root children must be `USFMParagraphNode`.
- No stray inline nodes at root (wrap into a paragraph container, likely default marker `p`).
- Paragraph containers must contain at least one editable child (e.g. a single-space `USFMTextNode`) to keep selection stable.

## Mode Switching (Lossless)
We maintain two representations:

- Flat token stream representation (USFM/Raw).
- Tree representation with paragraph containers (Regular).

Transforms:

- Flat -> Regular: scan left-to-right; each paragraph marker token starts a new paragraph container; subsequent tokens belong to that container until the next paragraph marker token.
  - Edge case: content before the first paragraph marker should be wrapped into a default `p` paragraph.
- Regular -> Flat: for each paragraph container emit a paragraph marker token then DFS emit its children.

These transforms should be deterministic and reversible.

## Impacts / Likely Call Sites
This refactor will touch most of the editor pipeline:

- Node definitions/registration (`Editor.tsx`, `ReferenceEditor.tsx`, `NestedEditor.tsx`).
- Serialization and export (`src/app/domain/editor/serialization/lexicalToUsfm.ts`).
- Marker insertion operations (`src/app/domain/editor/utils/insertMarkerOperations.ts`).
- Structural normalization (`src/app/domain/editor/listeners/maintainDocumentStructure.ts`).
- Lint and lint-fixing flows (`src/app/domain/editor/listeners/lintChecks.ts`, hooks, UI).
- Prettify and serialized transforms (`src/app/domain/editor/utils/prettifySerializedNode.ts`).
- Paragraphing mode utilities (queue building, stamping) (can be partially deferred).
- Styling that currently reads `data-in-para` (`src/app/ui/effects/usfmDynamicStyles/calcStyles.ts`).

## Testing Strategy
- Unit tests for `materializeFlatTokensFromSerialized`:
  - Regular tree -> flat emits paragraph marker tokens correctly.
  - Nested editors are traversed correctly.
  - Deterministic ordering and stable output.
- Unit tests for mode transforms (flat<->regular) proving reversibility (round-trip equality up to expected synthetic metadata).
- Integration tests for USFM export that run in both representations but share the same serializer entrypoint.

## Risks
- Lexical selection quirks with custom top-level blocks: ensure `USFMParagraphNode` implements block behavior correctly.
- Metadata stability for synthetic nodes (ids/sids): adapter should avoid inventing values that accidentally get persisted.
- Large diff / broad callsite changes: prefer incremental tasks with frequent verification.

## Open Questions (To Resolve During PRD)
- Exact synthetic marker node shape (minimal required fields for existing downstream logic).
- Default paragraph marker for orphaned content (`p` assumed).
- Whether some operations (prettify/autofix) should operate directly on tree in Regular mode vs. always round-tripping through flat.
