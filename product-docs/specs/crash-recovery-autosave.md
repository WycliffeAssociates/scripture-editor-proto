# Crash-Recovery Autosave (Dirty-Buffer Backups)

## What this feature does

While the user edits, a background pipeline writes a per-book USFM backup for
every book that has unsaved changes. On reopen, the route loader classifies
each backup against current disk and layers genuine recovery candidates back
in as the user's latest working state. The user then chooses **Keep** (accept
the restored work) or **Discard** (revert to the last saved state). If the
disk underneath a backup had moved since the user's last edits, the affected
chapters are tracked for **forced review** — the first save of those chapters
is routed through the diff modal even when `Auto Accept My Work on Save` is
on.

The on-disk project files **are never autosaved**. The feature is a safety
net for the dominant crash / quit-without-saving case; explicit save remains
the only thing that changes the project on disk.

Word-style UX: silent during the session, banners only at reopen.

## Goals and bounds

- **Recovery for the dominant cases:** app crash, browser tab close, OS
  reboot, power loss — anything that loses unflushed work between two
  explicit saves.
- **Loss budget:** ≤2 seconds of un-flushed keystrokes after typing pauses;
  ≤30 seconds during sustained typing, per book.
- **No mid-session UI surface.** No "saving…" indicators for the safety
  net itself; banners exist only at reopen.
- **Per-chapter forced-review scope.** Forced review fires only for the
  specific chapters whose disk baseline didn't match the backup. Once the
  user reviews / reverts those chapters, normal save behavior resumes
  even if other recovered books are still dirty.
- **Safety enforced at command boundaries, not just UX.** `saveProjectToDisk`
  refuses to commit without the `reviewedRecoveredWork` attestation while
  any tracked conflict remains; `syncNow`'s incoming branch defers; the
  external-compare mode-entry control is disabled.

**Acknowledged gap:** a pipeline failure followed by a crash is unobservable
at reopen. Matches Word and is bounded by the retry budget.

## How it works (one paragraph)

The editor's existing `WorkingFilesStore.changes` stream feeds the
`dirtyBufferPipeline`, which debounces per book and writes a wrapper JSON
file to `${appDataRoot}/dirty-buffers/${workspaceKey}/${bookCode}.json`. The
wrapper records its own body MD5 and the **disk baseline** at the time of
write — the MD5 of the current on-disk source for that book. On reopen, the
parse interface returns the source MD5 alongside the parsed tokens (one IPC
on Tauri, one in-process hash on web), and `recoverDirtyBuffers` classifies
every backup against that disk baseline using a six-row matrix. Restoration
candidates are layered into the freshly-loaded project as dirty chapters;
the `RecoveredConflictTracker` is seeded for any chapter whose disk moved
underneath the backup. While the user has the banner up, the
`WorkspaceInteractionGate` blocks all programmatic mutation. Keep releases
the gate; Discard reverts the layered work to the disk baseline.

## The six-row classification matrix

```
backup.diskBaseline | current disk      | outcome
--------------------|-------------------|----------------------------------------
unreadable          | n/a               | RecoveryReportEntry(backup-unreadable)
absent              | absent            | manual-recovery: new-book-not-supported
absent              | present           | restore + tracker (baseline mismatch)
present(X)          | absent            | manual-recovery: disk-book-missing
present(X)          | present(X)        | restore (baseline match — no tracker)
present(X)          | present(Y != X)   | restore + tracker (baseline mismatch)
```

Implementation in `src/app/domain/api/recoverDirtyBuffers.ts`. Two
implementation amendments past the original matrix:

1. **Stale-residue check.** If a restored chapter's tokens are token-equal
   to the on-disk version of the same chapter (a "save-then-clear-failed"
   leftover), it isn't restored at all — the backup file is cleared
   fire-and-forget and no banner appears.
2. **Recovered deletion.** A chapter present on disk but absent from the
   whole-book backup means the user removed/cleared it in their working
   state. Represent it as a dirty chapter that retains the disk baseline
   (`sourceTokens`) with empty `currentTokens` — Discard restores the
   disk content, the save serializes nothing for it (no empty marker), and
   diffs show a deletion.

## The on-disk wrapper

```ts
type DirtyBufferFile = {
  schemaVersion: 1;
  diskBaseline: DiskBaseline; // { kind: "absent" } | { kind: "present"; md5 }
  bodyMd5: string; // detects torn writes at read time
  writtenAt: number;
  appVersion: string;
  content: string; // full USFM book source
};
```

Written via `FileSystem.atomicWriteText` (OPFS commits on writable close;
Tauri uses tmp-file + `rename(2)` / `MoveFileExW`). A torn write surfaces
at read time as `bodyMd5` mismatch — detection, not silent corruption
restore.

## The two safety surfaces

The feature has two distinct mechanisms with non-overlapping scopes; keeping
them straight is load-bearing.

| Mechanism                      | Scope                                                                               | What it blocks                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **`WorkspaceInteractionGate`** | `open` \| `saving` \| `recovery-decision-pending`                                   | All programmatic working-state mutation, the editor's editable state, every mutation hook.                |
| **`RecoveredConflictTracker`** | Set of `${bookCode}:${chapterNum}` whose disk baseline moved underneath the backup. | Specifically the incoming-source flows (remote `syncNow`'s incoming branch, external-compare mode entry). |

The gate is coarse — it stops everything while a Keep/Discard decision is
pending or a save is in flight. The tracker is fine-grained — even after
the gate opens, individual chapters can still force their first save through
review until reviewed or reverted.

User-visible behavior:

- Banner up → gate `recovery-decision-pending` → editor read-only, every
  programmatic mutation refused.
- Keep → gate `open`; the tracker may still hold entries → editor unlocked,
  but the first save of any tracked chapter forces the modal even with
  auto-accept on.
- Saving a tracked chapter / reverting it / Discarding the whole banner →
  the `recoveredConflictTrackerSubscriber` observes the chapter clean and
  removes it from the tracker. When the tracker empties, incoming sync /
  external compare unblock naturally.

## Forced review — the command boundary

The forced-review floor lives in `runSavePipeline`'s precondition phase. When
the tracker is non-empty and the save wasn't attested, the command refuses
_before any disk I/O_ and returns a `blocked` result naming the reason:

```ts
function checkSavePreconditions(
  args,
  options,
): WorkspaceCommandBlockReason | null {
  if (!requireGateOpen(args.interactionGate.get())) return "gate-closed";
  if (
    !args.recoveredConflictTracker.isEmpty() &&
    options?.reviewedRecoveredWork !== true
  ) {
    return "recovered-review-required";
  }
  return null;
}
// → runSavePipeline returns { kind: "blocked", reason } and never touches disk.
```

Callers:

- **`useSave.saveReview.open`** — local-unsaved-review path. If the tracker
  is non-empty it forces the modal (bypasses `Auto Accept My Work on Save`).
  The modal's local-review Save action calls `saveProjectToDisk({
reviewedRecoveredWork: true })` (the thin `useSaveAndRevert` wrapper over
  `runSavePipeline`). **The attestation is issued only from this
  local-unsaved-review modal path**, never from external-compare-review
  — the diff modal is shared, so blocking external-compare entry (below)
  is what keeps the attestation issuable from the right source.
- **Auto-accept without recovery pending** — passes `reviewedRecoveredWork:
true` because there's nothing to gate.
- **`syncNow`'s incoming branch** — deferred while the gate is non-open OR
  the tracker is non-empty, so it never reaches the save command through
  the incoming-reconciliation path.
- **External-compare apply** — refused at the public action entry while
  blocked, and the toolbar mode-entry control is disabled, so the apply
  path can't reach save in the first place.

## Incoming-flow deferral and the validated boundary

`syncNow` and every public `useExternalCompare` source-loading action check
`!requireGateOpen(gate) || !tracker.isEmpty()` at entry — call it
`incomingFlowsBlocked()`. The check is "gate OR tracker," not "tracker
only," because a baseline-matched restore leaves the tracker empty but the
gate `recovery-decision-pending`: importing then would clobber unacknowledged
work.

Outbound publish (`PENDING_PUBLISH` branch of `syncNow`) and status-only
refresh proceed regardless — they don't mutate working state.

**The validated boundary (`runIncomingMutation` in
`applyIncomingToStore.ts`):** every working-state commit derived from an
awaited incoming computation goes through one boundary that:

1. Captures the affected chapters' **object identities** before async work.
2. Computes on a private scratch — no writable store draft held across
   the await.
3. Re-reads latest after the await.
4. Aborts if any affected chapter was **replaced** (object identity, not
   text — catches a text edit AND a save-rebase that changes
   `sourceTokens`/`dirty` but not `currentTokens`; `selectionOnly` doesn't
   replace the object so cursor moves don't false-abort).
5. Re-checks the gate.
6. Commits synchronously from latest. Untouched chapters are aliased via
   `draftWithChapters` — **not** a whole-project deep clone — so concurrent
   commits to them survive.
7. Remote-accept / status side effects run only after a validated commit.

**Scope must match write scope** (`IncomingMutationScope`):

- A `chapters`-scoped write (hunk apply, full-chapter overlay) validates
  only the named chapters' identities. Concurrent edits to **other**
  chapters are preserved by overlay-from-latest and must not abort.
- A `workspace`-scoped write (`applyVersionSnapshotToWorkingFiles`, which
  rewrites / marks-clean every chapter) validates the `read()` **array
  identity**. The store replaces the array on any content/baseline/new-chapter
  commit and preserves it on `selectionOnly`, so array identity is the
  exact "did any state-changing commit happen" signal. Using chapter
  scope for a workspace write would miss a chapter added during the
  await.

This replaced a series of ad-hoc per-commit guards. The rule is now: every
`workingFilesStore.commit` in an incoming flow either has no intervening
`await` since its read/draft, or passes through this boundary.

**Never accept the remote while review diffs remain.** Reconciliation is bound
to the same forced-review discipline as the save command. When a behind-only
pull splits into safe-and-blocked diffs, `runIncomingReconciliation`'s pure
`finalizeOutcome` _drops_ the fast-forward acceptance whenever any review diff
is still pending — it keeps `remoteSync` attached so the _next_ save adopts
remote latest as its base, rather than marking the remote accepted while the
user still has diffs to resolve. So a recovered-conflict chapter (or any
unreviewed incoming hunk) can never silently advance the remote pointer; the
adoption rides the next reviewed save. (Full reconciliation flow lives in the
cloud-sync architecture; this is the recovery-relevant invariant.)

## The dirty-buffer pipeline

```
WorkingFilesStore.changes
  → filter (drop `load`, drop `selectionOnly`; see commitFilters)
  → flatMap per-book events (project-scope fans out to every book)
  → Stream.groupByKey(bookCode)
  → per-substream:
      Stream.debounce(idleMs)             // default 2000 ms
      merged with pending-work ceiling     // default 30000 ms
  → on emit: Effect.suspend(reconcile)
      wrapped in Effect.retry(exponential 2s × 2)
        - each retry re-reads latest state from the store
        - any dirty chapter → md5 → build wrapper → atomicWriteText
        - all clean → DirtyBufferStore.clear (returns boolean; logs on real removal)
  → console.error on retry exhaustion, substream dormant
```

Each book has its own clock. Sustained typing flushes at the ceiling; a
pause flushes at the idle debounce. Transient FS hiccups recover within
the retry budget (~6 s). Retry exhaustion logs but does not crash the
fiber — the next commit on that book starts a fresh debounce window.

## The recovered-conflict tracker subscriber

A second small fiber subscribes to `WorkingFilesStore.changes` alongside
the pipeline. On each commit it iterates currently-tracked chapters and
clears any whose post-commit `dirty` flag is `false`.

The subscriber does **post-state observation**, not transition detection.
Entries are only ever populated for initially-dirty chapters and `clear`
is idempotent, so "is this tracked chapter clean now?" is sufficient. This
is why partial diff-block reverts that leave the chapter still dirty don't
clear the entry, while reverts that bring the chapter content-equal to
`sourceTokens` do.

## Lifecycle summary

| Event                                                                                         | Tracker outcome                                                                                            |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Successful save of a tracked chapter (the captured-content rebase flips it to `dirty: false`) | Subscriber clears it.                                                                                      |
| Full-chapter revert (`DiffViewerModal`'s "Revert chapter")                                    | Chapter dirty=false → cleared.                                                                             |
| All diff-blocks reverted such that the chapter equals `sourceTokens`                          | Chapter dirty=false → cleared.                                                                             |
| Partial diff-block revert that leaves the chapter still dirty                                 | Subscriber does NOT fire — entry stays.                                                                    |
| Discard banner                                                                                | `tracker.clearAll()` explicitly + recovered chapters reverted; subscriber would observe them clean anyway. |

## Banners

**`RestoredBuffersBanner`** — Keep / Discard. Mounted by `RecoveryBanners`,
which lives in `ProjectView` and reads from `WorkspaceContext.recovery` (so
the provider stays a provider, no prop drilling). When the recovery result
includes `conflictedBookCodes` (the subset whose disk baseline didn't
match), the banner renders a second sentence telling the user disk has
changed since their edits and to review in the diff modal before saving.

**`RecoveryReportBanner`** — informational, not blocking. Lists backups
that couldn't be auto-restored: unreadable / torn writes, USFM parse
errors, books no longer on disk, recovery cases that aren't supported
(new books, missing-from-disk). Project opens normally; the user can
recover by hand.

## Per-platform MD5 (one IPC, not two)

The disk baseline an MD5 of the on-disk source bytes. To avoid a
read-then-ship-back round trip, the **parse interface** carries the MD5:

- `parseUsfm` / `parseUsfmBatchFromContents` / `parseUsfmBatchFromPaths`
  take an `includeSourceMd5?: boolean` flag.
- **Tauri:** `usfm_onion_project_paths` and `usfm_onion_parse_string`
  compute `md5_hex(&source)` on the Rust side when the flag is set and
  return `sourceMd5` alongside the parse result. One IPC, hash where the
  bytes already live.
- **Web:** `WebUsfmOnionService.parseUsfmBatchFromContents` hashes its
  in-hand source string via `webMd5Service.calculateMd5(source)` when
  the flag is set.
- **Fallback:** a book missing from `diskMd5ByBook` (read/hash failure
  or an old desktop binary) is simply left un-baselined; its backup
  falls to forced review — the safe default.

**Future:** Scripture Burrito manifests record per-file checksums.
`TODO(burrito-md5)` in the route loader: prefer manifest checksums over
hashing when available, but recompute defensively because files edited
outside the app may not have updated the manifest.

## Close-time guarantees

| Scenario                                                 | Guarantee                                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Sustained typing in a book                               | ≤2 s on pause; ≤30 s during continuous typing, per book.                            |
| Hard crash / OS kill / power loss                        | Last completed durable write per book.                                              |
| Browser tab close (`beforeunload`)                       | Existing unsaved-changes prompt.                                                    |
| Tauri app close                                          | Same.                                                                               |
| In-app project close / navigate                          | Pipeline fiber interrupted; current pending window lost.                            |
| Explicit save success                                    | Backup reconciled to clear via the same pipeline.                                   |
| Transient FS hiccup mid-flush                            | Up to ~6 s of retry; the latest state at retry time is what gets written.           |
| Remote sync while incoming blocked                       | Incoming reconciliation deferred; `PENDING_PUBLISH` + status refresh proceed.       |
| External compare while incoming blocked                  | Mode-entry control disabled; all six public source-loading actions refuse at entry. |
| Save invoked without attestation while tracker non-empty | `{ kind: "blocked", reason: "recovered-review-required" }`. No disk I/O attempted.  |

## Out of scope (v2 candidates)

- Cross-project LRU sweep of orphaned backups.
- Working-tree-mtime cross-check.
- Multi-window / multi-tab editing protection.
- Tauri single-instance plugin.
- Tauri graceful-close bounded flush.
- In-session "safety-net healthy" UI.
- Auto-restore of new books or books missing from disk.
- Reading MD5s from a Scripture Burrito manifest.
- Per-chapter backup granularity for Psalm-119-class outliers.
- A persistent log sink for safety-net errors (currently `console.error` only).

## Code pointers

State primitives:

- `src/app/state/DirtyBufferStore.ts`
- `src/app/state/WorkspaceBaselineStore.ts`
- `src/app/state/WorkspaceInteractionGate.ts`
- `src/app/state/RecoveredConflictTracker.ts`

Pipelines:

- `src/app/domain/editor/pipelines/dirtyBufferPipeline.ts`
- `src/app/domain/editor/pipelines/recoveredConflictTrackerSubscriber.ts`

Recovery + bridges:

- `src/app/domain/api/recoverDirtyBuffers.ts`
- `src/app/domain/api/parseRecoveredBookContents.ts`
- `src/app/domain/project/compare/applyIncomingToStore.ts` (`runIncomingMutation`)
- `src/app/routes/$project.index.tsx` — route loader integration.

UI:

- `src/app/ui/components/blocks/RecoveryBanners.tsx` — mounted by `ProjectView`.
- `src/app/ui/components/blocks/RestoredBuffersBanner.tsx`
- `src/app/ui/components/blocks/RecoveryReportBanner.tsx`
- `src/app/ui/contexts/WorkspaceContext.tsx` — `recovery` field on context;
  `keepRecoveredWork` / `discardRecoveredWork` handlers; pipeline forks.
- `src/app/ui/components/blocks/Editor.tsx` — `GateEditablePlugin` is the
  single authority for `editor.setEditable`.

Save / persistence:

- `src/core/persistence/FileSystem.ts` — `atomicWriteText` interface.
- `src/web/persistence/OpfsFileSystem.ts` / `src/tauri/persistence/TauriFileSystem.ts`.
- `src/app/domain/project/savePipeline.ts` — `runSavePipeline`: the
  `reviewedRecoveredWork` precondition, per-book persistence honesty
  (`Set<bookCode> persistedBooks`), and the captured-content rebase.
- `src/app/ui/hooks/save/useSaveAndRevert.ts` — the UI wrapper that calls
  `runSavePipeline` and renders toasts from its `SaveResult`.
- `src/tauri/rust/src/usfm_onion.rs` — `source_md5` in parse output.
- `src/web/domain/usfm/WebUsfmOnionService.ts` — md5 of in-hand string.

Tests:

- `tests/unit/recoverDirtyBuffers.test.ts` — six-row classification + tracker
  population + stale-residue + recovered-deletion.
- `tests/unit/dirtyBufferStore.test.ts` — round-trip + each
  `ReadUnreadableReason`.
- `tests/unit/recoveredConflictTracker.test.ts` — subscribe / getSnapshot.
- `tests/unit/applyIncomingToStore.test.ts` — `runIncomingMutation`
  scope-matching, identity-CAS abort, gate re-check.
- `tests/unit/integration/dirtyBufferPipeline.test.ts` — debounce, ceiling,
  retry, fan-out, save-then-clear.
- `tests/unit/integration/recoveredConflictTrackerSubscriber.test.ts` —
  observed-clean clearance, partial-revert preservation.
