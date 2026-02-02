# TABLE OF CONTENTS
## HIGH LEVEL OVERVIEW
## GOALS
## NON GOALS
## TECHNICAL CONSTRAINTS
### TASKS
#### TASK 1: Introduce `editorMode` Setting (Global)
#### TASK 2: Update Settings Manager Callers
#### TASK 3: Replace Editor Mode Toggle UI
#### TASK 4: Refactor Mode Switching API to `setEditorMode(...)`
#### TASK 5: Replace Root Dataset/Class Wiring
#### TASK 6: Remove Locking Input Layer
#### TASK 7: Remove Per-Node Mutability (`isMutable`) and Lock Helpers
#### TASK 8: Remove Per-Node Visibility (`show`) and Live Preview
#### TASK 9: Update Mode Adjustment / Serialization Utilities
#### TASK 10: Update Marker Insertion to be Lockless
#### TASK 11: Update Visual Styles + Dynamic Styling Hooks
#### TASK 12: Split Guardrails Tier A vs Tier B
#### TASK 13: Update Editor View Hooks (Remove Cursor Correction)
#### TASK 14: Update Action Palette Context + Mode Actions
#### TASK 15: Update Reference + Nested Editors
#### TASK 16: Tests + Cleanup

## HIGH LEVEL OVERVIEW
Replace the old editor “mode matrix” and marker locking/visibility system with a simple 3-mode global setting: `editorMode = regular | usfm | plain`. Editing should feel normal in all modes (no input interception, no locked markers). Markers are shown/hidden by CSS based on `editorMode`, and `plain` disables Tier B correctness assists as an escape hatch.

## GOALS
- `appSettings.editorMode` is the only persisted editor-mode setting (global app preferences).
- No input interception for locked markers; all cut/copy/paste/type works normally.
- Remove all per-node `isMutable` and `show` state and any code that depends on them.
- Marker visibility is driven only by `editorMode` via root dataset/class + CSS.
- Guardrails are tiered: Tier A always on; Tier B off only in `plain`.
- Existing tree/flat representation split remains (Regular=tree, USFM/Plain=flat).

## NON GOALS
- Reintroduce selection-based “peek” behavior.
- Change the USFM-as-tree representation/conversion logic.
- Add new lint rules or new UX surfaces beyond adapting existing ones.

## TECHNICAL CONSTRAINTS
- Global settings persistence stays in `localStorage` (`app_preferences`) via `SettingsManager` (`src/app/domain/settings/settings.ts`).
- Do not add schema migrations; missing `editorMode` defaults to `"regular"`.
- Keep changes surgical: delete obsolete code rather than preserving compatibility layers.

### TASKS

#### TASK 1: Introduce `editorMode` Setting (Global)
----
passes: false
complexity: low

details:
- Update `src/app/data/settings.ts`:
  - Remove `mode`, `markersViewState`, `markersMutableState` from `Settings`.
  - Add `editorMode: "regular" | "usfm" | "plain"`.
  - Set default to `"regular"` in `settingsDefaults`.
- Decide where the new type lives:
  - Preferred: define `export type EditorModeSetting = "regular" | "usfm" | "plain"` in `src/app/data/editor.ts` (or adjacent) and re-use it in `src/app/data/settings.ts`.
- Notes for builder:
  - Existing persisted `app_preferences` may still contain old keys; they can be ignored at runtime.
  - Do not rename persistence keys.
----

#### TASK 2: Update Settings Manager Callers
----
passes: false
complexity: medium

details:
- Update any code that reads/writes `Settings.mode`, `Settings.markersViewState`, `Settings.markersMutableState` to use `Settings.editorMode`.
- Key callsites to update:
  - `src/app/ui/hooks/useWorkspaceState.tsx` (loads settings + exposes them via workspace/project context).
  - Any `project.updateAppSettings(...)` payloads that currently write old keys.
- Expected end state:
  - TypeScript compiles with the new `Settings` type.
  - App still boots.
----

#### TASK 3: Replace Editor Mode Toggle UI
----
passes: false
complexity: low

details:
- Update `src/app/ui/components/blocks/ProjectSettings/EditorModeToggle.tsx`:
  - Replace the current 3-preset matrix logic (`regular/raw/usfm`) with direct `editorMode` reads/writes (`regular/usfm/plain`).
  - Rename “Raw” label/tooltip to “Plain” (this is the escape hatch).
  - Remove all references to `EditorModes`, `EditorMarkersViewStates`, `EditorMarkersMutableStates`.
  - Prefer calling a workspace action (to be added in Task 4) like `actions.setEditorMode("plain")`.
  - Keep styling and component structure intact.
----

#### TASK 4: Refactor Mode Switching API to `setEditorMode(...)`
----
passes: false
complexity: high

details:
- Refactor `src/app/ui/hooks/useModeSwitching.tsx`:
  - Replace `toggleToSourceMode(...)` + `adjustWysiwygMode(...)` with a single API:
    - `setEditorMode(next: "regular" | "usfm" | "plain", args?: { isInitialLoad?: boolean; editor?: LexicalEditor })`.
    - Keep `initializeEditor(editor)` but key it off `appSettings.editorMode`.
  - Preserve existing conversion behavior (assumed already correct from USFM-as-tree work):
    - `regular` -> tree (paragraph containers).
    - `usfm/plain` -> flat tokens wrapped in a Lexical `paragraph`.
  - Remove all `show/isMutable` adjustment logic from conversions; conversions should only reshape the tree.
  - Update `updateAppSettings(...)` calls to write `{ editorMode: next }`.
- Update any callers expecting old action names.
  - Workspace actions likely come from `useWorkspaceContext` / actions hook; update those to expose `setEditorMode`.
----

#### TASK 5: Replace Root Dataset/Class Wiring
----
passes: false
complexity: medium

details:
- Replace `src/app/ui/hooks/utils/domUtils.ts`:
  - Remove `updateDomClassListWithMarkerViewState(...)`.
  - Add `updateDomForEditorMode({ editorMode }: { editorMode: "regular" | "usfm" | "plain" })`.
  - Set `#root.dataset.editorMode = editorMode`.
  - If `source-mode` body class is still needed for other styling, keep it but derive from `editorMode !== "regular"` (or remove entirely if unused after CSS update).
- Update all callsites to use the new function (notably `src/app/ui/hooks/useModeSwitching.tsx`).
- Update `src/app/ui/components/blocks/NestedEditor.tsx` initialization logic that copies `root.dataset` into the nested editor wrapper.
----

#### TASK 6: Remove Locking Input Layer
----
passes: false
complexity: low

details:
- Delete `src/app/domain/editor/listeners/lockImmutableMarkers.ts`.
- Update `src/app/domain/editor/hooks/useEditorInput.ts`:
  - Remove imports and registrations for:
    - `lockImutableMarkersOnType` (KEY_DOWN_COMMAND)
    - `lockImmutableMarkersOnCopy`
    - `lockImmutableMarkersOnCut`
    - `lockImmutableMarkersOnPaste`
  - Remove dependencies on `markersMutableState`, `markersViewState`, `mode` (replace with `editorMode` only if still needed for other transforms).
----

#### TASK 7: Remove Per-Node Mutability (`isMutable`) and Lock Helpers
----
passes: false
complexity: high

details:
- Update `src/app/domain/editor/states.ts`:
  - Remove `isMutableState` export.
- Update `src/app/domain/editor/nodes/USFMTextNode.ts`:
  - Remove serialized field `isMutable` from `SerializedUSFMTextNode`.
  - Remove `getMutable()/setMutable()` and any behavior gates based on mutability:
    - `remove()` override.
    - `canInsertTextBefore/After()` overrides.
    - `$isLockedUSFMTextNode`, `$isLockableUSFMTextNode`, and any other lock-related type guards.
  - Remove dataset population for `data-is-mutable`.
- Update `src/app/data/editor.ts`:
  - Remove `TOKENS_TO_LOCK_FROM_EDITING` and any other lock-related constants.
- Delete traversal/cursor helpers that depend on locking:
  - `src/app/domain/editor/utils/lexicalTreeTraversal.ts`
  - `src/app/domain/editor/utils/cursorCorrection.ts`
  (or leave as no-ops if deletion causes collateral issues, but deletion is preferred.)
----

#### TASK 8: Remove Per-Node Visibility (`show`) and Live Preview
----
passes: false
complexity: high

details:
- Update `src/app/domain/editor/states.ts`:
  - Remove `showState` export.
- Update `src/app/domain/editor/nodes/USFMTextNode.ts`:
  - Remove serialized field `show` from `SerializedUSFMTextNode`.
  - Remove `getShow()/setShow()`.
  - Remove dataset population for `data-show`.
  - Remove `TOKEN_TYPES_CAN_TOGGLE_HIDE` and any “toggleable” type guards.
- Delete `src/app/domain/editor/listeners/livePreviewToggleableNodes.ts`.
- Update `src/app/domain/editor/listeners/maintainMetadata.ts`:
  - Remove `monitorMutabilityAndVisibility(...)` entirely.
  - Keep `adjustSidsAsNeededOnTextTokens(...)` and `maintainInPara(...)` (or whatever is still needed).
- Update hooks that registered live preview:
  - `src/app/domain/editor/hooks/useEditorView.ts` (remove preview listener)
  - `src/app/ui/components/blocks/NestedEditor.tsx` (remove nested preview listener)
----

#### TASK 9: Update Mode Adjustment / Serialization Utilities
----
passes: false
complexity: high

details:
- Update `src/app/domain/editor/utils/modeAdjustments.ts`:
  - Refactor/remove `adjustSerializedLexicalNodes(...)` option parameters `{ show, isMutable }`.
  - Ensure any “flatten nested editor” behavior still works without adding marker visibility/mutability.
  - Update `flattenParagraphContainersToFlatTokens(...)` signature to remove `{ show, isMutable }`.
  - Ensure `createSerializedUSFMTextNode(...)` no longer writes `show/isMutable`.
- Update all callsites:
  - `src/app/ui/hooks/useModeSwitching.tsx`
  - `src/app/ui/components/blocks/ReferenceEditor.tsx`
  - Any tests that construct serialized nodes expecting `show/isMutable`.
----

#### TASK 10: Update Marker Insertion to be Lockless
----
passes: false
complexity: medium

details:
- Update `src/app/domain/editor/utils/insertMarkerOperations.ts`:
  - Remove `markersViewState` + `markersMutableState` from `BaseInsertArgs`.
  - Remove any logic that sets `show` or `isMutable` on newly created nodes.
  - Replace `mode` usage with `editorMode` (tree vs flat decision: `editorMode === "regular"` => regular insertion behavior).
- Update dependent callsites:
  - `src/app/domain/editor/plugins/ParagraphingPlugin.tsx`
  - `src/app/domain/editor/actions/markerActions.ts`
  - Any other insertion callers.
----

#### TASK 11: Update Visual Styles + Dynamic Styling Hooks
----
passes: false
complexity: medium

details:
- Update `src/app/ui/styles/usfm.css`:
  - Replace selectors that depend on:
    - `#root[data-marker-view-state=...]`
    - `#root[data-markers-mutable-state=...]`
    - `[data-show]`, `[data-is-mutable]`
  - New rule of thumb:
    - `#root[data-editor-mode="regular"]` hides `marker/endMarker/...` token elements.
    - `#root[data-editor-mode!="regular"]` shows them.
  - Keep existing styling for verse/chapter numbers (`numberRange`) as visible in all modes.
- Update `src/app/domain/editor/plugins/UsfmStylesPlugin.tsx`:
  - Replace `isUsfmMode` condition with `project.appSettings.editorMode === "usfm"`.
  - Stop reading `data-marker-view-state` from root; if `getPoetryStylesAsCssStyleSheet(...)` still expects it, simplify the signature or pass a constant appropriate for USFM mode.
----

#### TASK 12: Split Guardrails Tier A vs Tier B
----
passes: false
complexity: medium

details:
- Update `src/app/domain/editor/listeners/maintainDocumentStructure.ts`:
  - Replace `appSettings.mode === EditorModes.WYSIWYG` with `appSettings.editorMode === "regular"` for paragraph-container enforcement.
  - Identify Tier B “correctness assists” that should not run in `plain`.
    - Concrete known candidate: `ensureNumberRangeAlwaysFollowsMarkerExpectingNum` deletes orphaned markers in “regular+immutable” today.
  - Add an explicit gate: if `appSettings.editorMode === "plain"`, skip Tier B fixes.
  - Keep Tier A safety fixes (the ones that prevent malformed/unstable editing states) running in all modes.
----

#### TASK 13: Update Editor View Hooks (Remove Cursor Correction)
----
passes: false
complexity: low

details:
- Update `src/app/domain/editor/hooks/useEditorView.ts`:
  - Remove cursor correction update listener (it was only needed to escape locked markers).
  - Remove references to `EditorModes`, `markersMutableState` checks.
- Delete/update any imports that referenced `cursorCorrection.ts`.
----

#### TASK 14: Update Action Palette Context + Mode Actions
----
passes: false
complexity: medium

details:
- Update `src/app/domain/editor/actions/types.ts`:
  - Replace `mode/markersViewState/markersMutableState` with `editorMode`.
- Update `src/app/domain/editor/hooks/useEditorContext.ts`:
  - Populate `context.editorMode` from settings.
  - Remove the old context fields.
- Update `src/app/domain/editor/actions/modeActions.ts`:
  - Replace the 3 actions with:
    - Switch to Regular (`setEditorMode("regular")`)
    - Switch to USFM (`setEditorMode("usfm")`)
    - Switch to Plain (`setEditorMode("plain")`)
  - Update `isVisible` predicates to compare against `context.editorMode`.
----

#### TASK 15: Update Reference + Nested Editors
----
passes: false
complexity: medium

details:
- Update `src/app/ui/components/blocks/ReferenceEditor.tsx`:
  - Remove `adjustSerializedLexicalNodes(..., { show, isMutable })` usage.
  - Ensure reference editor displays consistent with `editorMode` (at minimum: uses the same root dataset so CSS hides/shows markers correctly).
- Update `src/app/ui/components/blocks/NestedEditor.tsx`:
  - Remove “when editing” marker preview wiring.
  - Ensure the nested editor wrapper still mirrors root dataset/classes (now `data-editor-mode`).
----

#### TASK 16: Tests + Cleanup
----
passes: false
complexity: high

details:
- Update/delete tests that depend on locking/visibility:
  - Delete or rewrite `src/test/unit/cursorCorrection.test.ts` (locking removed).
  - Update `src/test/unit/modeSwitching.test.ts` to reflect the new serialization helpers (no `show/isMutable`).
  - Update `src/test/unit/maintainDocumentStructure.test.ts`:
    - Replace the `mode: "wysiwyg" | "source"` helper arg with `editorMode`.
    - Add a new assertion that Tier B does not run in `plain` (e.g. the orphan-marker deletion case is skipped).
- Grep cleanup:
  - Remove dead exports/constants in `src/app/data/editor.ts` once no longer referenced.
  - Ensure no code references `markersViewState`, `markersMutableState`, `TOKENS_TO_LOCK_FROM_EDITING`, `TOKEN_TYPES_CAN_TOGGLE_HIDE`, `data-marker-view-state`, `data-show`, or `data-is-mutable`.
----
