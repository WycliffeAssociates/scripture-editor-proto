// mirrorResultRouter.ts
//
// The return path: consumes results a mirror ships back and lands them in the
// main-thread stores in the shapes downstream consumers expect (findings onion
// slice, sous slice, dirty-buffer writes).
//
//  - lintResult  → normalize + commit each book into the findings onion slice.
//  - galleyResult → decode + normalize + commit findings + segment map into the
//    existing sous-chef slice.
//  - backupResult → resident host persisted or cleared the managed backup.
//  - resyncRequest → re-seed the mirror from current store state.
//
// Stale-result defence: results carry the generation they ran against; a result
// older than the latest we've applied for that kind is dropped (a calm-period
// pass that the user has already typed past). This is the generation high-water
// mark decision 8 calls for, applied uniformly so an unordered transport is
// safe too.

import type { FindingSnapshot } from "scripture-sous-chef-web/findings";
import type { LintSnapshot } from "usfm-onion-web";
import { reconcileFindings as reconcileBraidFindings } from "usfm-onion-web/packed";

import { decodeGalleyAnalysis } from "@/app/domain/editor/annotations/decodeGalleyFindings.ts";
import {
  groupFindingsByBook,
  onionFindingsByChapter,
  sousFindingsToFindings,
} from "@/app/domain/editor/annotations/normalizeFindings.ts";
import { seedMirror } from "@/app/domain/editor/pipelines/mirrorPatchProducer.ts";
import { traceEditCommandResult } from "@/app/domain/mirror/editTrace.ts";
import type { MirrorFeed } from "@/app/domain/mirror/MirrorFeed.ts";
import type { MirrorResult } from "@/app/domain/mirror/mirrorProtocol.ts";
import type { FindingsStore } from "@/app/state/FindingsStore.ts";
import type { FindingsByScope } from "@/app/state/FindingsStore.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";
import type { LintIssue as AppLintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

type SnapshotFinding = {
  book: string;
  issue: AppLintIssue;
};

/**
 * Wire the result handler onto the feed. Returns the unsubscribe so the
 * workspace can tear it down with the rest of its lifecycle.
 *
 */
export function makeMirrorResultRouter(args: {
  feed: MirrorFeed;
  workingFilesStore: WorkingFilesStore;
  workspaceBaselineStore: WorkspaceBaselineStore;
  findingsStore: FindingsStore;
}): () => void {
  // High-water mark per result class — a result older than what we've already
  // applied for that class is a stale calm-period pass and is dropped.
  let lintHighWater = -1;
  let sousHighWater = -1;
  let onionIssuesByBook = new Map<string, readonly AppLintIssue[]>();
  let onionSnapshotFindings: readonly SnapshotFinding[] = [];
  let sousSnapshot: FindingSnapshot | null = null;
  let sousSnapshotState: "persisted" | "fresh" | null = null;
  // Resync coalesce guard: a full re-seed is heavy and re-tokenizes the whole
  // project. A behind transient can fire several resyncRequests in a burst (one
  // per analyze class), all carrying the same trailing generation; re-seeding
  // once at that generation covers them all, so drop any request that isn't
  // newer than the last we already re-seeded for.
  let resyncHighWater = -1;

  const handle = (result: MirrorResult): void => {
    switch (result.kind) {
      case "lintResult": {
        if (result.ranAtGeneration < args.workingFilesStore.generation()) {
          return;
        }
        const dropped = result.ranAtGeneration < lintHighWater;
        if (dropped) return;
        lintHighWater = result.ranAtGeneration;
        const nextSnapshot = result.snapshot;
        const nextSnapshotFindings = snapshotFindings(nextSnapshot);
        const reconciledSnapshotFindings = reconcileBraidFindings(
          onionSnapshotFindings,
          nextSnapshotFindings,
        );
        const mutableIssuesByBook = new Map<string, AppLintIssue[]>();
        const nextIssuesByBook = new Map<string, readonly AppLintIssue[]>();
        const byBook: FindingsByScope = {};
        for (const finding of reconciledSnapshotFindings) {
          let issues = mutableIssuesByBook.get(finding.book);
          if (!issues) {
            const nextIssues: AppLintIssue[] = [];
            mutableIssuesByBook.set(finding.book, nextIssues);
            issues = nextIssues;
          }
          issues.push(finding.issue);
        }
        for (const [bookCode, issues] of mutableIssuesByBook) {
          const previous = onionIssuesByBook.get(bookCode);
          const stableIssues =
            previous !== undefined && sameIssueArray(previous, issues)
              ? previous
              : issues;
          nextIssuesByBook.set(bookCode, stableIssues);
          byBook[bookCode] = onionFindingsByChapter(stableIssues);
        }
        onionSnapshotFindings = reconciledSnapshotFindings;
        onionIssuesByBook = nextIssuesByBook;
        args.findingsStore.commitBraidSnapshot(byBook);
        traceEditCommandResult(
          result.ranAtGeneration,
          "analyzeLint",
          {
            books: Object.keys(byBook).length,
            findings: reconciledSnapshotFindings.length,
          },
          result.hostPhases,
        );
        return;
      }
      case "galleyResult": {
        // A result can be the first one delivered for its class and still be
        // obsolete: another editor commit may have advanced the working store
        // before this result crossed the transport boundary.
        if (result.ranAtGeneration < args.workingFilesStore.generation()) {
          return;
        }
        const sousDropped = result.ranAtGeneration < sousHighWater;
        if (sousDropped) return;
        // If a fresh result won a same-generation race, a late cache read must
        // not roll the UI back to the older persisted snapshot.
        if (
          result.cacheState === "persisted" &&
          sousHighWater === result.ranAtGeneration &&
          sousSnapshotState === "fresh"
        ) {
          return;
        }
        sousHighWater = result.ranAtGeneration;
        let analysis: ReturnType<typeof decodeGalleyAnalysis>;
        try {
          analysis = decodeGalleyAnalysis(result, sousSnapshot ?? undefined);
        } catch (error: unknown) {
          if (result.cacheState === "persisted") {
            // A native restore can arrive after the initial waiter has
            // unsubscribed. Reissue a scopeless fresh pass, but do not rewrite
            // corpus.bin during load. The cache is a one-time cold-load seed;
            // replacement is reserved for a successful save receipt.
            args.feed.sendCommand({
              kind: "analyzeGalley",
              generation: result.ranAtGeneration,
              cachePolicy: "none",
            });
            return;
          }
          throw error;
        }
        sousSnapshot = analysis.snapshot;
        sousSnapshotState = result.cacheState;
        const findings = sousFindingsToFindings(analysis.findings);
        args.findingsStore.commitSousFindings(groupFindingsByBook(findings));
        traceEditCommandResult(
          result.ranAtGeneration,
          "analyzeGalley",
          { cache: result.cacheState, findings: findings.length },
          result.hostPhases,
        );
        return;
      }
      case "backupResult": {
        traceEditCommandResult(result.ranAtGeneration, "writeBackup", {
          book: result.bookCode,
          cleared: result.cleared ?? false,
        });
        return;
      }
      case "applyBraidFixResult": {
        // Resident fix callers await this correlated result directly. It is
        // intentionally not a findings publication or a mirror high-water
        // update.
        return;
      }
      case "braidCommandError": {
        // The correlated resident operation owns this failure. Keeping it out
        // of findings prevents an operational error from masquerading as an
        // empty or stale snapshot.
        return;
      }
      case "resyncRequest": {
        if (result.lastGeneration <= resyncHighWater) return;
        resyncHighWater = result.lastGeneration;
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

function snapshotFindings(snapshot: LintSnapshot): SnapshotFinding[] {
  return snapshot.books.flatMap((book) =>
    book.findings.map((issue) => ({ book: book.book, issue })),
  );
}

function sameIssueArray(
  left: readonly AppLintIssue[] | undefined,
  right: readonly AppLintIssue[],
): boolean {
  return (
    left !== undefined &&
    left.length === right.length &&
    right.every((issue, index) => issue === left[index])
  );
}
