# Plan: Lockless Modes

## Context
The editor previously used a matrix of settings (`mode`, `markersViewState`, `markersMutableState`) plus per-node state (`isMutable`, `show`) to:

- Hide/show USFM markers.
- Lock certain tokens from editing.
- Provide a “peek while editing” behavior.

This created a non-standard editing experience (blocked delete/cut/paste/type across markers), plus a lot of cross-cutting complexity.

Separately, the project recently introduced a representation split via the “USFM-as-tree” work:

- Regular mode uses a paragraph-container tree representation.
- USFM and Plain modes use a flat token stream wrapped in a single Lexical paragraph.

Lockless Modes should not redo that work; it should only remove locking/visibility/mutability while keeping the representation split and mode transforms.

## Goals
- Make editing behave like a normal text editor: no interception of backspace/delete/cut/paste/type around markers.
- Replace the old mode matrix with a single global setting:
  - `appSettings.editorMode: "regular" | "usfm" | "plain"` (default: `"regular"`).
- Make marker visibility purely a function of `editorMode` (CSS/root dataset), not per-node `show`.
- Remove all marker locking/mutability concepts (no per-node `isMutable`, no “locked traversal” helpers).
- Keep guardrails, but tier them:
  - Tier A safety/stability runs in all modes.
  - Tier B correctness assists run in `regular` + `usfm`, and are disabled in `plain` (escape hatch).

## Non-Goals
- Reintroduce “peek while editing” (selection-based visibility) in this iteration.
- Change the already-landed tree/flat conversion behavior from the USFM-as-tree work.
- Redesign the UI/UX of linting or marker insertion beyond what’s needed to compile.

## Decisions (Validated)
- Persistence: `editorMode` is global app preferences (existing localStorage settings manager), not per-project.
- Representation: keep dual structure (tree in Regular; flat in USFM/Plain). This is assumed to already exist.
- Visibility: remove per-node `show` and any live preview toggling. Marker visibility is driven only by `editorMode`.
- Locking: remove per-node `isMutable`, locking token sets, cursor correction logic that avoids locked nodes, and input interception.

## UX Definition
- `regular`:
  - WYSIWYG: markers hidden.
  - Lint + helpers run.
  - Representation: tree.
- `usfm`:
  - Markers visible.
  - Lint + helpers run.
  - Representation: flat.
- `plain`:
  - Markers visible.
  - Tier B correctness assists disabled (minimal normalization).
  - Representation: flat.

## Main Risks
- Cross-cutting churn: many callsites reference `mode/markersViewState/markersMutableState`, and CSS relies on `data-marker-view-state` and `data-show`.
- Persistence/data shape: serialized Lexical content currently includes `show/isMutable`; removing them changes JSON shape. NodeState parsers currently default missing to `true`, but we intend to delete the states entirely.
