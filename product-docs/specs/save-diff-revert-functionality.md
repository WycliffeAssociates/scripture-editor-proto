# Save, Diff, and Revert

## What this feature does
- Tracks unsaved chapter edits in working state.
- Generates reviewable diffs before saving.
- Diffs are computed by SID block runs over flattened token streams (not raw paragraph containers).
- Classifies diff entries as:
  - Added
  - Deleted
  - Modified
  - Whitespace-only modified
- Supports selective revert:
  - Revert one diff block
  - Revert all unsaved changes
- Saves changed content back to project files on disk.

## How to access it in the app
- In a project toolbar, click `Review & Save` (or save icon on smaller screens).
- Diff modal actions:
  - `Save all changes`
  - `Revert all changes`
  - Per-entry `Switch to this chapter`
  - Per-entry `Undo Change`

## Typical user flow
1. Make edits.
2. Open `Review & Save`.
3. Inspect SID-level changes.
4. Optionally hide whitespace-only diffs.
5. Revert specific blocks if needed.
6. Save all changes to persist to disk.

## Current limits and non-goals
- Saving writes changed books as full USFM book content assembled from chapter state.
- No background autosave; explicit save is required.
- Diff UI only shows chapters currently marked dirty.
- Diff granularity is SID block based (not character-level persistence units).

## Key modules (for agents)
- `src/app/ui/hooks/useSave.tsx`
- `src/app/ui/components/blocks/DiffModal.tsx`
- `src/core/domain/usfm/sidBlocks.ts`
- `src/core/domain/usfm/sidBlockDiff.ts`
- `src/core/domain/usfm/sidBlockRevert.ts`
- `src/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts`
- `src/app/domain/editor/serialization/lexicalToUsfm.ts`
