# Editor Modes

## What this feature does
- Provides four editor modes for different editing needs:
  - `Regular`: reader-friendly editing with markers hidden and protected
  - `View`: read-only regular layout
  - `Plain`: underlying markup view with fewer editor helpers
  - `USFM`: metadata-visible mode where markers are shown and editable
- Keeps content mode-switchable without changing persisted source-of-truth semantics.

## How to access it in the app
- Open project drawer.
- Go to `Settings`.
- Use the `Editor Mode` segmented control.
- Quick toggle for read-only is available from the toolbar lock/unlock button.

## Typical user flow
1. Work in `Regular` for text-focused editing.
2. Switch to `USFM` when you need direct marker edits.
3. Switch to `Plain` for source-like inspection/editing.
4. Use `View` when reviewing without editing.

## Current limits and non-goals
- `Plain` mode intentionally reduces structure helpers; lint/update behaviors differ from regular/usfm flows.
- Mode switching changes editor presentation/projection and interaction rules; it does not auto-save changes.
- This mode system is not a substitute for full USFM semantic validation.

## Key modules (for agents)
- `src/app/ui/components/blocks/ProjectSettings/EditorModeToggle.tsx`
- `src/app/ui/hooks/useModeSwitching.tsx`
- `src/app/domain/editor/utils/modeTransforms.ts`
- `src/app/domain/editor/serialization/fromSerializedToLexical.ts`
- `src/app/domain/editor/listeners/manageUsfmMarkers.ts`
- `src/app/domain/editor/hooks/useEditorLinter.ts`
