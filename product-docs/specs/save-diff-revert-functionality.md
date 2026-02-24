# Save, Diff, and Revert

## What this feature does
- Tracks unsaved chapter edits in working state.
- Generates reviewable diffs before saving.
- Diffs are computed by SID block runs over flattened token streams (not raw paragraph containers).
- Stores diff state in two forms:
  - Flat list for list rendering (`diffs`)
  - Chapter-indexed map for chapter rendering (`diffsByChapter`)
- Classifies diff entries as:
  - Added
  - Deleted
  - Modified
  - Whitespace-only modified
- Supports selective and scoped revert:
  - Revert one diff block
  - Revert one chapter
  - Revert all unsaved changes
- Supports two review modes:
  - List view (SID-block entries)
  - Chapter view (full chapter original/current panes with changed hunk overlays)
- Saves changed content back to project files on disk.

## How to access it in the app
- In a project toolbar, click `Review & Save` (or save icon on smaller screens).
- Diff modal actions:
  - `Save all changes`
  - `Revert all changes`
  - `View options`:
    - `List view` / `Chapter view`
    - `Select chapter` (visible in chapter view)
    - `Show USFM markers`
    - `Hide whitespace-only diffs`
  - List view:
    - Per-entry `Switch to this chapter`
    - Per-entry `Undo Change`
  - Chapter view:
    - `Revert chapter changes`
    - Per-hunk `Undo` overlays in the Current pane

## Typical user flow
1. Make edits.
2. Open `Review & Save`.
3. Choose `List view` for SID-level entries or `Chapter view` for side-by-side chapter context.
4. In chapter view, pick a chapter and inspect highlighted changes.
5. Optionally hide whitespace-only diffs or show USFM markers.
6. Revert specific blocks, revert the selected chapter, or revert all changes.
7. Save all changes to persist to disk.

## Current limits and non-goals
- Saving writes changed books as full USFM book content assembled from chapter state.
- No background autosave; explicit save is required.
- Diff UI only shows chapters currently marked dirty.
- Chapter view is read-only review UI; edits still happen in the editor surface.
- `Hide whitespace-only diffs` only filters what is shown in the modal.
- Revert operations are token-stream based by block/chapter, not character-level patching.
- Diff granularity is SID block based (not character-level persistence units).

## Key modules (for agents)
- `src/app/ui/hooks/useSave.tsx`
- `src/app/ui/components/blocks/DiffModal/DiffViewerModal.tsx`
- `src/app/ui/components/blocks/DiffModal/DiffModalListView.tsx`
- `src/app/ui/components/blocks/DiffModal/DiffModalChapterView.tsx`
- `src/app/ui/components/blocks/DiffModal/chapterDiffViewModel.ts`
- `src/app/domain/project/saveAndRevertService.ts`
- `src/core/domain/usfm/chapterDiffOperation.ts`
- `src/core/domain/usfm/sidBlockDiff.ts`
- `src/core/domain/usfm/sidBlockRevert.ts`
- `src/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts`

## Validation references
- `src/test/e2e/save.spec.ts`
  - List view review + chapter navigation + single-diff revert
  - Save persistence after reload
  - Chapter view rendering and hunk action visibility
