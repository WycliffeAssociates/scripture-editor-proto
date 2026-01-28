# Lockless Modes Refactor (Plan)

## TL;DR
Remove every trace of token locking/mutability (including `TOKENS_TO_LOCK_FROM_EDITING`, `isMutable`, and input interception) and simplify editor settings to a single `editorMode: "regular" | "usfm" | "plain"` stored on `project.appSettings`.

Editing should behave like a normal text editor: Backspace/Delete/Cut/Paste/typing always work. USFM correctness is supported via:

- Document-structure guardrails (mode-scoped)
- Visual feedback (formatting changes)
- Lint feedback
- Undo/redo

No “peek/ghost markers” UX ships in this refactor.

## Problem
The current locking/mutability model attempts to prevent deletion of hidden USFM structure. In practice it creates surprising cursor behavior (selection and deletion don’t behave like users expect), and it conflicts with the direction of using explicit document structure + lint to keep things correct.

We want predictable editing first, with correctness handled as feedback + lightweight normalization rather than prevention.

## Goals
- Cursor and deletion behavior match user expectations (no custom blocking/interception based on token types).
- Regular mode hides USFM markers entirely; deleting structure is allowed and immediately visible through formatting changes.
- USFM and Plain modes always show markers.
- Remove the “mode matrix” derived from `mode` + `markersViewState` + `markersMutableState`; replace with a single `editorMode`.
- Keep helpful correctness guardrails in Regular + USFM without being janky.
- Plain mode is “hands off” (minimal normalization).

## Non-Goals
- Implement a marker peek/overlay/ghost UX in Regular.
- Perfect migration of prior settings (prototype; default to `editorMode="regular"`).
- Solve/replace the existing `mutWorkingFilesRef` pattern (separate concern).

## Core Decisions

### 1) New setting: `project.appSettings.editorMode`
Replace the old settings:

- Remove: `mode`, `markersViewState`, `markersMutableState`
- Add: `editorMode: "regular" | "usfm" | "plain"`
- Default: `editorMode = "regular"`

UI stays where it is today: the existing segmented control becomes `Regular | USFM | Plain`.

### 2) Delete all “locking/mutability” behavior
Remove end-to-end:

- `TOKENS_TO_LOCK_FROM_EDITING` and any “lockable token type” checks
- `isMutable` state in `USFMTextNode` and in serialized nodes
- Input interception logic that modifies selection/deletes to avoid locked nodes
  - Delete `src/app/domain/editor/listeners/lockImmutableMarkers.ts`
  - Remove all wiring from `src/app/domain/editor/hooks/useEditorInput.ts`
- Caret traversal helpers that avoid locked nodes (or simplify them to generic traversal)

Editing becomes universal: all content is editable, deletable, cuttable, and pasteable.

### 3) Mode behavior (marker visibility + guardrails)

#### Regular
- Markers hidden.
- Formatting and structure are the primary feedback.
- Guardrails:
  - Tier A (safety) + Tier B (correctness).

#### USFM
- Markers visible.
- Guardrails:
  - Tier A (safety) + Tier B (correctness).

#### Plain
- Markers visible.
- Guardrails:
  - Tier A only (hands off).

## Guardrails: Split Maintain Document Structure
The existing `maintainDocumentStructure` bundle mixes “keep the editor stable” with “repair USFM sequences.” To support Plain mode and remove locks safely, split into two tiers.

### Tier A: Safety invariants (all modes)
Purpose: prevent selection loss / stuck cursor / illegal node shapes.

Properties:
- Minimal; no USFM-specific repairs unless required for stability.
- May still perform non-semantic merges if they prevent runaway DOM growth, but avoid aggressive merging in Plain.

Examples (illustrative):
- Ensure there is always at least one editable position in required containers.
- Prevent malformed states that Lexical cannot represent stably.

### Tier B: Correctness assists (Regular + USFM only)
Purpose: keep users in a reasonable USFM shape while typing, without blocking edits.

Existing candidates from `maintainDocumentStructure`:
- Ensure numberRange always follows markers that expect numbers (chapter/verse)
- Ensure plain text follows verse numberRange
- Ensure char open/close pairs have editable adjacent siblings
- Split combined marker+number tokens
- Attempt to split known error tokens into marker/text

Key constraint:
- Tier B must be conservative to avoid cursor jank. Prefer small, local repairs.

## CSS + Visual Feedback
- Regular mode hides markers; deleting paragraph/poetry markers should immediately affect indentation/spacing.
- USFM/Plain show markers, so deletions are inherently visible.
- Lint highlights remain the main correctness feedback in all modes.

## Data Representation Notes (Deferrable)
Internally, Regular may become tree-based (paragraph containers) while USFM/Plain may remain flat. This refactor only requires that:

- Modes control visibility/guardrails (not editability)
- Downstream operations can consume a canonical representation (e.g. via the adapter planned in `plans/usfm-as-tree-refactor/plan-usfm-as-tree-refactor.md`)

## Impacts / Likely Call Sites
This refactor is broad and subtractive. Expect changes in:

- Settings types/defaults (`src/app/data/settings.ts`, project appSettings shape)
- Mode toggle UI (`src/app/ui/components/blocks/ProjectSettings/EditorModeToggle.tsx`)
- Mode switching logic (`src/app/ui/hooks/useModeSwitching.tsx`, potentially removed/replaced)
- Input handlers (`src/app/domain/editor/hooks/useEditorInput.ts`)
- Locking listener deletion (`src/app/domain/editor/listeners/lockImmutableMarkers.ts`)
- Node model + serialization (`src/app/domain/editor/nodes/USFMTextNode.ts`, serialized helpers)
- Document structure + metadata listeners (`src/app/domain/editor/listeners/maintainDocumentStructure.ts`, `src/app/domain/editor/listeners/maintainMetadata.ts`)
- Marker display helpers and DOM dataset wiring (`src/app/ui/hooks/utils/domUtils.ts`, plugins reading it)

## Testing Strategy
- Unit tests:
  - Settings defaults: `editorMode` defaults to `regular`.
  - Serialized node creation no longer includes `isMutable`.
  - Mode switching (if retained) does not mutate editability flags.

- Integration tests:
  - Editing operations across markers do not throw and behave normally (backspace/delete/cut/paste).
  - Plain mode does not run Tier B repairs.
  - Regular mode hides markers but formatting reacts to structure changes.

## Risks
- Removing locking may expose latent issues where Tier A safety fixes were previously avoided due to locks.
- Tier B repairs may cause cursor “jumps” if too aggressive; constrain repairs and add regression tests around selection stability.
- Broad callsite churn as `markersViewState/markersMutableState/mode` are removed.

## Open Questions
- Exact boundary between Tier A vs Tier B in the existing `maintainDocumentStructure` rules.
- Whether `useModeSwitching` should become a small `setEditorMode` helper or be deleted entirely in favor of render-time styling.
