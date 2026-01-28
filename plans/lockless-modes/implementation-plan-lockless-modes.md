# Implementation Plan: Lockless Modes

## Goal
Remove all marker locking/mutability behavior so editing behaves like a normal text editor, and simplify editor settings to a single `project.appSettings.editorMode: "regular" | "usfm" | "plain"` (default: `regular`).

## Success Criteria
- No `TOKENS_TO_LOCK_FROM_EDITING`, no `isMutable` on nodes/serialized nodes, no locked-node traversal helpers, and no `lockImmutableMarkers` input interception.
- Settings: `project.appSettings` contains `editorMode` and does not contain legacy `mode`, `markersViewState`, or `markersMutableState`.
- Mode UX:
  - `regular`: markers hidden.
  - `usfm`: markers visible.
  - `plain`: markers visible, minimal auto-normalization.
- Guardrails:
  - Tier A safety runs in all modes.
  - Tier B correctness assists run only in `regular` and `usfm`.
- Tests updated to reflect lockless editing.

## Execution Strategy
Small, verifiable slices. Keep the app building after each slice. Prefer deleting code over adapting it.

## Slice 1: Settings + UI Toggle

### 1.1 Update settings/appSettings shape
- Touch `src/app/data/settings.ts`
  - Remove `mode`, `markersViewState`, `markersMutableState`.
  - Add `editorMode`.
  - Default `editorMode` to `"regular"`.
- Update where `project.appSettings` is typed/initialized (likely `src/app/ui/hooks/useWorkspaceState.tsx` and any project-load code).
  - Do not migrate old fields; ignore them.
  - Ensure a missing value falls back to `"regular"`.

### 1.2 Convert the existing toggle
- Touch `src/app/ui/components/blocks/ProjectSettings/EditorModeToggle.tsx`
  - Replace derived matrix logic with direct `editorMode` reads/writes.
  - Options: `Regular | USFM | Plain`.
  - Keep component location/styling.

### 1.3 Update callsites to compile
- Replace usages of `appSettings.mode`, `markersViewState`, `markersMutableState` with `editorMode`.
- Remove legacy editor types/constants from `src/app/data/editor.ts` when no longer referenced.

### Verification
- App boots.
- Toggle updates `project.appSettings.editorMode` and persists per project.

## Slice 2: Remove Locking Input Layer

### 2.1 Delete lock listener
- Delete `src/app/domain/editor/listeners/lockImmutableMarkers.ts`.
- Touch `src/app/domain/editor/hooks/useEditorInput.ts`
  - Remove registrations/imports.

### 2.2 Remove any remaining code that assumes locking behavior
- Search for `lockImmutableMarkers` / `Locked` / `isMutable` / `TOKENS_TO_LOCK_FROM_EDITING`.
- Remove or rewrite to be mode-agnostic.

### Verification
- Backspace/Delete/Cut/Paste behave normally across markers.

## Slice 3: Remove Node/Serialized Mutability

### 3.1 USFMTextNode state
- Touch `src/app/domain/editor/nodes/USFMTextNode.ts`
  - Remove `isMutableState`, `getMutable/setMutable`.
  - Remove `remove()` override checks and `canInsertTextBefore/After` gating.
  - Remove lock-related type guards.

### 3.2 Serialized state
- Touch any serialized node creators/adjusters:
  - `src/app/domain/editor/nodes/USFMTextNode.ts` (serialized creator)
  - `src/app/domain/editor/utils/modeAdjustments.ts`
  - `src/app/domain/editor/serialization/fromSerializedToLexical.ts`
- Remove `isMutable` from serialized JSON and all logic that toggles it.

### Verification
- Serialization/deserialization still works.
- No code branches on mutability.

## Slice 4: Marker Visibility Driven by editorMode

### 4.1 Replace marker-view-state logic
- Update any “marker view state” logic to simple `editorMode` checks:
  - `regular` => hide markers
  - `usfm/plain` => show markers

Likely touch points:
- `src/app/domain/editor/plugins/UsfmStylesPlugin.tsx`
- `src/app/ui/hooks/utils/domUtils.ts`
- `src/app/domain/editor/listeners/manageUsfmMarkers.ts`
- `src/app/domain/editor/listeners/livePreviewToggleableNodes.ts`
- `src/app/ui/effects/usfmDynamicStyles/calcStyles.ts` (if it reads old view-state)

### Verification
- Regular hides markers.
- USFM and Plain show markers.

## Slice 5: Guardrails Tiering

### 5.1 Split maintainDocumentStructure
- Touch `src/app/domain/editor/listeners/maintainDocumentStructure.ts`
  - Extract Tier A (safety) vs Tier B (correctness assists).
  - Gate Tier B off when `editorMode === "plain"`.

### 5.2 Wire structure hooks
- Touch `src/app/domain/editor/hooks/useEditorStructure.ts` (and any other callers)
  - Always run Tier A.
  - Run Tier B only in `regular` and `usfm`.

### Verification
- Plain is hands-off (no correctness auto-fixes).
- Regular/USFM still help with stranded marker cases.

## Slice 6: Cleanup + Tests

### 6.1 Delete obsolete mode-switch plumbing
- Remove/replace:
  - `src/app/ui/hooks/useModeSwitching.tsx` (or reduce to `setEditorMode` only)
  - `src/app/domain/editor/actions/modeActions.ts`
  - Any legacy DOM dataset plumbing for marker view/mutability.

### 6.2 Tests
- Update existing tests that reference legacy settings or `isMutable`.
- Add regression coverage:
  - Editing across markers (delete/cut/paste) does not throw.
  - Tier B fixes run in regular/usfm but not in plain.

### Suggested commands
- `pnpm test:unit` (scoped to touched tests/files if possible)
