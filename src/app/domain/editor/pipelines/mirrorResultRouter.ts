// mirrorResultRouter.ts
//
// The return path: consumes results a mirror ships back and lands them in the
// existing main-thread stores — exactly the writes the inline pipelines used to
// make, so every downstream consumer sees unchanged shapes.
//
//  - lintResult  → normalize + commit each book into the findings onion slice.
//  - sousResult  → normalize + commit findings + segment map into the sous slice.
//  - backupResult → web persisted itself (nothing to do but log a clear);
//                   desktop ships envelope bytes back for one dumb FS write
//                   through the existing DirtyBufferStore seam.
//  - resyncRequest → re-seed the mirror from current store state.
//
// Stale-result defence: results carry the generation they ran against; a result
// older than the latest we've applied for that kind is dropped (a calm-period
// pass that the user has already typed past). This is the generation high-water
// mark decision 8 calls for, applied uniformly so an unordered transport is
// safe too.

import {
  groupFindingsByChapter,
  onionFindingsByChapter,
  sousFindingsToFindings,
} from "@/app/domain/editor/annotations/normalizeFindings.ts";
import { seedMirror } from "@/app/domain/editor/pipelines/mirrorPatchProducer.ts";
import type { MirrorFeed } from "@/app/domain/mirror/MirrorFeed.ts";
import type { MirrorResult } from "@/app/domain/mirror/mirrorProtocol.ts";
import { retryBackupWrite } from "@/app/domain/mirror/retryBackupWrite.ts";
import type {
  DirtyBufferFile,
  DirtyBufferStore,
} from "@/app/state/DirtyBufferStore.ts";
import type { FindingsStore } from "@/app/state/FindingsStore.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";

/**
 * Wire the result handler onto the feed. Returns the unsubscribe so the
 * workspace can tear it down with the rest of its lifecycle.
 *
 * `workspaceKey`/`dirtyBufferStore` are the desktop write seam: on web the
 * mirror persists inside the worker and these are never exercised for a backup
 * write (only the `cleared` log path), but they're always wired so the same
 * router serves both platforms.
 */
export function makeMirrorResultRouter(args: {
  feed: MirrorFeed;
  workingFilesStore: WorkingFilesStore;
  workspaceBaselineStore: WorkspaceBaselineStore;
  findingsStore: FindingsStore;
  dirtyBufferStore: DirtyBufferStore;
  workspaceKey: string;
}): () => void {
  // High-water mark per result class — a result older than what we've already
  // applied for that class is a stale calm-period pass and is dropped.
  let lintHighWater = -1;
  let sousHighWater = -1;

  const handle = (result: MirrorResult): void => {
    switch (result.kind) {
      case "lintResult": {
        if (result.ranAtGeneration < lintHighWater) return;
        lintHighWater = result.ranAtGeneration;
        for (const [bookCode, issues] of Object.entries(result.byBook)) {
          args.findingsStore.commitBookFindings(
            "onion",
            bookCode,
            onionFindingsByChapter(issues),
          );
        }
        return;
      }
      case "sousResult": {
        if (result.ranAtGeneration < sousHighWater) return;
        sousHighWater = result.ranAtGeneration;
        for (const [bookCode, analysis] of Object.entries(result.byBook)) {
          args.findingsStore.commitSousBookFindings(
            bookCode,
            groupFindingsByChapter(sousFindingsToFindings(analysis.findings)),
            analysis.segments,
          );
        }
        return;
      }
      case "backupResult": {
        const bookCode = result.bookCode;
        // Desktop: the backup worker can't `invoke`, so a clean book ships back
        // `clearOnMain` for main to clear through the store seam. Web cleared in
        // the worker (OPFS) and there's nothing to do here.
        if (result.cleared) {
          if (!result.clearOnMain) return;
          void retryBackupWrite(() =>
            args.dirtyBufferStore.clear(args.workspaceKey, bookCode),
          ).catch((error: unknown) => {
            console.error(
              "[mirror] desktop backup clear failed after retries; book left dormant",
              { bookCode, error },
            );
          });
          return;
        }
        if (result.envelopeJson === undefined) return;
        // Desktop: the worker serialized and shipped the bytes; main does the
        // one dumb write through the seam. Bounded retry covers a transient FS
        // hiccup so the safety-net write isn't lost silently; on exhaust we log
        // loudly and leave the book dormant until its next commit re-triggers a
        // write.
        const entry = JSON.parse(result.envelopeJson) as DirtyBufferFile;
        void retryBackupWrite(() =>
          args.dirtyBufferStore.put(args.workspaceKey, bookCode, entry),
        ).catch((error: unknown) => {
          console.error(
            "[mirror] desktop backup write failed after retries; book left dormant",
            { bookCode, error },
          );
        });
        return;
      }
      case "resyncRequest": {
        seedMirror({
          workingFilesStore: args.workingFilesStore,
          workspaceBaselineStore: args.workspaceBaselineStore,
          feed: args.feed,
          generation: args.workingFilesStore.generation(),
        });
        return;
      }
    }
  };

  return args.feed.onResult(handle);
}
