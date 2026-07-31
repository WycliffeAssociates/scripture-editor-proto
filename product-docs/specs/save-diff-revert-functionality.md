# Save and symmetric change review

## What this feature does

Sefer reviews any two addressable scripture sources through one symmetric
surface. Sources may be the current Working copy, its Saved copy, another
project, a ZIP, a folder, a Git checkpoint, or remote latest.

The review model is Onion's frozen `DiffSkeleton`, not a flat list of patches:

- one decision unit may occupy one or two interleave slots;
- a moved unit appears at both positions but has one Left/Right decision;
- choosing a side only updates an in-memory decision map;
- nothing changes in `WorkingFilesStore` until the final Apply;
- Preview and Apply consume the same revision-tagged merge artifact;
- unknown or stale unit IDs fail rather than being fuzzily reapplied.

Exactly one source may be writable, and it must be Working. Two non-Working
sources form a read-only comparison with the same list/chapter projections,
navigation, and filters but no decisions, result preview, or Apply action.

## Opening review

`Review & Save` opens Saved on the left and Working on the right. Every changed
unit initially selects Working, so Apply is immediately available. Choosing
Saved for a unit is the new revert gesture; it remains reversible by changing
that decision before Apply.

External comparisons start unresolved. Apply remains disabled until every
actionable unit and any required chapter-presence decision explicitly selects
Left or Right. Users can:

- review each decision unit once in list/current-read order;
- review one skeleton slot per row in the interleaved chapter view;
- select Left or Right per unit;
- clear a unit back to unresolved;
- stamp Left, Right, or Clear across a chapter or the whole comparison;
- hide whitespace-only, USFM-structure-only, or decided rows;
- reveal unresolved rows hidden by filters;
- show USFM markers;
- navigate to the relevant editor location;
- expand a quiet reading preview for the selected chapter.

Filters affect rendering only. Chapter/global actions always address every
underlying decision unit in their scope, including hidden rows.

## Frozen sessions and staleness

At session creation Sefer reads each full chapter on both sides, explicitly
normalizes both arrays through `usfm-onion-web/token-sids` with the book code,
freezes those exact arrays, and passes them unchanged to diff and merge.
Granular Onion APIs continue to trust caller-supplied SIDs; adapters do not
normalize implicitly.

A writable session watches content commits to `WorkingFilesStore`. If Working
changes while the modal is open, the session becomes stale. The frozen diff,
decisions, filters, preview, and navigation remain visible, but Apply is
disabled. Refresh discards the old decisions and creates a new snapshot. Sefer
never automatically re-diffs or remaps decisions, and the final write still
uses `commitIfNotStale` as a race guard.

## Apply, structural changes, and receipt

Apply is all-or-nothing. A complete decision map is projected once through
Onion's merge-as-projection API, then that exact artifact is committed to
Working and persisted. Selecting an absent side can really remove a chapter;
removing the final chapter removes the book and its container metadata.
Selecting a present external side can add a chapter or book.

The save pipeline receives explicit deleted-book and structurally-changed-book
lists from the committed artifact. It does not infer deletion from empty token
arrays. Container metadata is updated before a file is removed so failures do
not leave metadata pointing at a missing file.

On success, the modal replaces the old diff rows with a localized receipt and
chapter add/update/remove counts. The receipt remains until Close, Refresh, or
new source selection. It is not persisted across modal sessions.

## Save lifecycle

`runSavePipeline` is a UI-free ordered command. Its outcomes keep durable
events separate:

- `saved`: disk persistence succeeded; `checkpoint` and `publish` report their
  own independent outcomes;
- `partial`: some books persisted before a later write failed;
- `failed`: a pre-write preparation failed and nothing was persisted;
- `blocked`: the workspace gate was closed or recovered work lacked review
  attestation.

"Saved to disk", "checkpoint created", and "published" are not synonyms. A
checkpoint or publish failure is surfaced as a warning after the bytes are safe
on disk. Auto-publish remains a post-local-save policy.

LF/CRLF policy remains chapter metadata. Serialization reapplies each chapter's
stored EOL, preventing comparison-only whitespace noise and preserving project
bytes across Apply.

## Incoming cloud reconciliation

Remote latest uses the same Working-vs-external session. External decisions
start unresolved unless the existing safe auto-accept policy succeeds.

Dirty Working overlap is conservatively detected from skeleton semantic
addresses, including baseline/current SIDs, covered-by addresses, and token
SIDs. Safe incoming units are projected together with protected Working units
in one complete decision map; auto-accept never sequentially applies hunks.
Whole-chapter or whole-book removal always requires explicit review.

Diverged committed-history disjointness is modeled by
`AutoAcceptScope = project | book | chapter | verse`. All scopes are tested,
while runtime composition remains hardcoded to `book`. This enum governs Git
history disjointness only; it does not change the verse/SID-grained dirty-buffer
comparison.

When all incoming content is safe and the project is behind-only, Sefer may
fast-forward. If any local content is retained, Working is dirty, or history
diverged, Sefer adopts remote latest as the save base and creates one new local
checkpoint for the reviewed result. Publish remains a later outcome.

## Crash recovery and history

Recovered conflicts force Saved-vs-Working review even when
`Auto Accept My Work on Save` is enabled. Only that review path issues the
`reviewedRecoveredWork` attestation; external source entry remains blocked
while recovered conflicts are unresolved.

Decision changes themselves do not enter document history because they do not
mutate Working. The final artifact commit records one programmatic history
transaction for chapters present before and after Apply. Choosing Saved for a
dirty chapter is therefore undoable as part of the final Apply transaction.

## Print changes

Print comparison is a separate read-only skeleton consumer. It constructs an
explicit pair of non-writable checkpoint/current descriptors, deduplicates moved
units, and retains verse/chunk grouping and word-level markings. It never reads
or adapts the review decision map.

## Deferred projected findings

The projection artifact is the seam for future validation of "what the final
product would be". The intended first surface is chapter preview, using the
existing asynchronous lint service boundary. UI attribution must distinguish
introduced, already-present, and resolved findings and must not claim one row
caused an interacting final-result error without proof. Sous-chef and
cross-book/project presentation remain a separate spike; this migration does
not ship projected-finding badges.

## Key modules

- `src/app/domain/project/compare/CompareSessionController.ts`
- `src/app/domain/project/compare/compareService.ts`
- `src/app/domain/project/compare/decisionState.ts`
- `src/app/domain/project/compare/projection.ts`
- `src/app/domain/project/compare/applyProjection.ts`
- `src/app/domain/project/compare/sourceMaterials.ts`
- `src/app/domain/project/remoteSync/incomingReconciliationPlan.ts`
- `src/app/domain/project/remoteSync/runIncomingReconciliation.ts`
- `src/app/domain/project/savePipeline.ts`
- `src/app/ui/hooks/useSave.tsx`
- `src/app/ui/components/blocks/DiffModal/DiffViewerModal.tsx`
- `src/app/ui/components/blocks/DiffModal/DiffModalListView.tsx`
- `src/app/ui/components/blocks/DiffModal/DiffModalChapterView.tsx`
- `src/core/domain/usfm/IUsfmOnionService.ts`
- `src/web/domain/usfm/WebUsfmOnionService.ts`
- `src/tauri/domain/usfm/TauriUsfmOnionService.ts`
- `src/tauri/rust/src/usfm_onion.rs`

## Verification references

- `tests/unit/usfmOnionDiffProjection.test.ts`
- `tests/unit/compareService.test.ts`
- `tests/unit/compareDecisionProjection.test.ts`
- `tests/unit/compareSessionController.test.ts`
- `tests/unit/applyProjection.test.ts`
- `tests/unit/useSaveOrchestration.test.ts`
- `tests/unit/incomingReconciliationPlan.test.ts`
- `tests/unit/runIncomingReconciliation.test.ts`
- `tests/unit/incomingReconciliation.integration.test.ts`
- `tests/unit/app/ui/components/blocks/DiffModal/optionCReviewViews.test.tsx`
- `tests/e2e/save.spec.ts`
