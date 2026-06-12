// recoveredConflictTrackerSubscriber.ts
//
// Clears recovered-conflict tracker entries as their chapters are observed
// clean. Runs as a small Stage-2 subscriber on `WorkingFilesStore.changes`,
// alongside the dirty-buffer pipeline.
//
// Why observe state instead of wiring `tracker.clear` at each revert/save site:
// "the chapter's content matches its (non-recovered) baseline" is the underlying
// truth that means "there is no recovered conflict left to review." Observing it
// catches every clearance path uniformly — full chapter revert, all diff-blocks
// reverted to clean, save success, programmatic clean — without each site
// remembering to call `tracker.clear`.
//
// Pure POST-STATE inspection, not transition-edge detection. On each commit it
// asks "is this tracked chapter clean now?". That is sufficient because tracker
// entries are only ever populated for initially-dirty, baseline-mismatched
// recovered chapters and `clear` is idempotent. A diff-BLOCK revert that leaves
// the chapter still dirty simply isn't observed clean, so the entry stays — which
// is the correct semantics (other recovered content in that chapter is still
// unreviewed).

import { Effect, Stream } from "effect";

import type { RecoveredConflictTracker } from "@/app/state/RecoveredConflictTracker.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";

export function makeRecoveredConflictTrackerSubscriber(args: {
  workingFilesStore: WorkingFilesStore;
  tracker: RecoveredConflictTracker;
}): Effect.Effect<void> {
  return args.workingFilesStore.changes.pipe(
    Stream.runForEach((event) =>
      Effect.sync(() => {
        if (args.tracker.isEmpty()) return;
        // Snapshot is a stable array; clearing mutates the tracker's
        // internal set, not this captured list, so iteration is safe.
        for (const { bookCode, chapterNum } of args.tracker.getSnapshot()) {
          const chapter = event.snapshot
            .find((file) => file.bookCode === bookCode)
            ?.chapters.find((entry) => entry.chapterNumber === chapterNum);
          if (chapter && !chapter.dirty) {
            args.tracker.clear(bookCode, chapterNum);
          }
        }
      }),
    ),
  );
}
