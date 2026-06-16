# Regular-Mode Structured Nodes

In regular (WYSIWYG) mode, chapter and verse markers are **structured nodes**
whose USFM token emission derives from node shape — not hidden editable bytes.
This makes the byte-corruption failure class (caret reaching marker bytes the
user cannot see) unrepresentable rather than repaired. The old async repair
sweep (`maintainDocumentStructure`) and the chapter/verse interactive
interceptors are gone; what remains is a small set of synchronous,
deterministic node behaviors plus a metadata pass.

## `USFMNumberedMarkerNode`

Extends `USFMTextNode` (normal text mode; never nests). It models the
`payload: "numberRange"` marker family — `\c`, `\v`, and later `\cp`/`\ca`/
`\va`/`\vp` — which the catalog distinguishes by `payload` and
`closingBehavior`, never by a marker-name list.

- **State:** `openBytes` (marker + its absorbed delimiter, e.g. `"\v "`),
  `closeBytes` (`null`, or the endMarker bytes as the lexer gave them),
  `marker`, `sid`, and the original token ids (`openId`, `numberId`,
  `closeId?`) retained across pairing/splitting so findings stay anchored.
- **Text content** is the Number token source verbatim — including any excess
  leading whitespace and the number's own trailing argument-terminator space.
  May be `""` (a transient bad state surfaced by lint, never silently
  repaired).
- **Token type** is `"numberedMarker"`; emission is
  `open marker · Number · [endMarker]`, the close branch firing iff
  `closeBytes != null`.

## Node behaviors (`registerNumberedMarkerBehaviors`)

Self-gating — they act only when the selection is inside a numbered node.

- **Direction-agnostic boundary stops** (RTL-capable): both the number's end
  and the adjacent prose edge (`text@0`) are reachable, with the
  canonicalization defenses that keep `text@0` from collapsing onto the
  previous sibling.
- **Two-stage delete:** a backspace that would empty the node empties it (caret
  stays, the missing-number finding appears); a second backspace removes the
  whole node. At the prose edge, the node's _sole_ trailing space is onion's
  argument delimiter and is protected (deleting it would strand the digits and
  diverge model from bytes); disk _excess_ whitespace deletes one char at a
  time as ordinary content.
- **Space-at-end caret jump** — required whitespace already exists, so a space
  at the node end just moves the caret to where typing belongs.

## Serialization — two waists

- **Tree → flat** (lint, save, diff, mode-switch out):
  `materializeFlatTokensFromSerialized` emits each numbered node's 2–3 tokens.
- **Flat → tree** (load, mode-switch in, paste): a pairing pass
  (`modeTransforms.ts`) folds adjacent `marker(payload-set)` + `number`
  (+ following `endMarker`) into one node. The rule is total — an unpaired
  payload marker becomes a numbered node with empty content, the same
  representation as the edit-time bad state.

Mode switches are therefore **1 node ⇄ 2–3 tokens**, ids stable. A dev-only
fixpoint pipeline (`tokenFixpointPipeline.ts`) re-lexes and `console.error`s if
`tokens ≢ lex(join(sources))`.

## Clipboard

Internal copy/paste round-trips natively via Lexical's
`application/x-lexical-editor` flavor. `text/plain` export assembles USFM bytes
through the token waist. Paste detection is **catalog-driven** (membership-check
against known markers → `parseUsfm` → the same pairing pass), not a regex.

## Not yet structured

- **Char markers** (`\add`, `\nd`, `\w`, …) still use hidden editable flat text
  nodes; the residual char-open/close repair in `structureMaintenancePipeline`
  persists until char-element nodes ship.
- **Milestones** are deferred (point decorators, per the design).

## Key files

- `src/app/domain/editor/nodes/USFMNumberedMarkerNode.ts`
- `src/app/domain/editor/serialization/materializeFlatTokensFromSerialized.ts`
- `src/app/domain/editor/utils/modeTransforms.ts` — pairing pass
- `src/app/domain/editor/pipelines/structureMaintenancePipeline.ts`,
  `tokenFixpointPipeline.ts`
