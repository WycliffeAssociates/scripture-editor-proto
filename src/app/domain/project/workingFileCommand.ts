// workingFileCommand.ts
//
// The ergonomic front-door for ACTIVE working-files mutations (format, match-
// formatting, prettify, lint-fix — anything that reads the store, derives new
// chapter content, and commits it back).
//
// It exists so call sites cannot:
//   (a) hold a mutable draft across an `await` before commit (the documented
//       lost-update hazard on `WorkingFilesStore.draftWithChapters`), or
//   (b) commit a stale whole-state `bulk` over a concurrent commit.
//
// The mutator runs on a RECORDING DRAFT (see `recordingDraft.ts`): it reads
// with plain reads and checks out a writable chapter/book only when its engine
// actually produced a change. Obtaining write access IS the bookkeeping, so the
// set of changed chapters is MEASURED at commit, never declared by the mutator.
// The helper then re-reads the latest state, validates the chapters it checked
// out were not replaced underneath it, rechecks the gate, and commits — by
// overlaying only the affected chapters onto the latest state, or, when a book
// was rebuilt wholesale (its chapters array replaced), by a validated bulk.
//
// Reactions vs continuations: derived state (lint, sous, diff, visible-editor
// sync) is owned by commit-stream subscribers — the commit this seam publishes
// carries the precise scope they react to, so callers do NOT re-derive any of
// it. What stays at the call site is the verb's own follow-through: the
// `history.runTransaction` wrapper, user notifications, and per-action
// reports, sequenced on the returned result.
//
// CONTRACT (so a stale/gate abort can't publish a side effect for a write that
// never landed):
//   - `mutate` may ONLY read/check out the draft and COMPUTE a value. It must
//     not run UI side effects — at mutate time the commit has not been
//     validated, so any effect there can outlive an abort.
//   - Callers branch on the returned `kind` before running any follow-through;
//     the typed result makes "did this actually commit?" impossible to skip.

import type { IncomingMutationAbortReason } from "@/app/domain/project/remoteSync/commandResults.ts";
import { commitIfNotStale } from "@/app/domain/project/validatedStoreMutation.ts";
import {
  type ChapterRef,
  overlayAffectedChapters,
} from "@/app/domain/project/workingFileMutations.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import {
  makeRecordingDraft,
  type RecordingDraft,
} from "@/app/state/recordingDraft.ts";
import type { CommitMeta } from "@/app/state/types.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceGateStore } from "@/app/state/WorkspaceInteractionGate.ts";

/**
 * Caller-provided meta, MINUS `scope` — the seam stamps it from measurement.
 * By default scope is the precise `{ chapters: affected }` the recording draft
 * measured. Callers opt into `{ project: true }` only for genuine whole-
 * snapshot semantics they know up front (version switch / import, where books
 * may be added or removed — a chapter list cannot express absence). The seam
 * ALSO stamps `{ project: true }` on its own when a wholesale book's chapter
 * SET changed (chapters added or removed by the rebuild); see `commit` below.
 */
type CommitMetaInput = Omit<CommitMeta, "generation" | "scope"> & {
  scope?: { project: true };
};

export type WorkingFilesCommandResult<T> =
  | { kind: "committed"; value: T; committedChapters: ChapterRef[] }
  | { kind: "unchanged"; value: T }
  | { kind: "aborted"; reason: IncomingMutationAbortReason };

/**
 * Run a validated working-files mutation. See the file header for the contract.
 *
 * - `mutate`: does the (possibly async) work on the recording draft and returns
 *   only its business value. It reads the draft freely and checks out a chapter
 *   (`chapterForWrite`) or book (`bookForWrite`) only when its engine produced a
 *   change. The seam derives `affected` from those checkouts; no chapter checked
 *   out ⇒ no commit (`unchanged`).
 *
 * The mutator may `await` freely: it works on the draft, never the store. If any
 * chapter it checked out was committed during the await, or the gate closed, the
 * mutation aborts with a typed reason and nothing is committed.
 */
export async function withWorkingFilesDraft<T>(args: {
  workingFilesStore: WorkingFilesStore;
  interactionGate: WorkspaceGateStore;
  commitMeta: CommitMetaInput;
  mutate: (draft: RecordingDraft) => Promise<T>;
}): Promise<WorkingFilesCommandResult<T>> {
  const startState = args.workingFilesStore.read();
  const draft = makeRecordingDraft(startState);
  const value = await args.mutate(draft);

  const { files, affected, wholesaleBooks, wholesaleOriginalChapterNums } =
    draft.result();

  if (affected.length === 0) {
    return { kind: "unchanged", value };
  }

  // A wholesale book replaces its `chapters` array, so there is no safe per-
  // chapter overlay — the draft IS the next full state for those books. Any of
  // them present ⇒ bulk commit; otherwise overlay only the affected chapters.
  //
  // The staleness scope follows: a bulk commit writes the draft's whole `files`
  // array (branched from `startState`), so it would clobber a concurrent commit
  // to ANY chapter — only whole-state identity is a safe gate (`workspace`). A
  // per-chapter overlay touches only `affected`, so validating those chapters'
  // identities suffices (`chapters`); concurrent commits elsewhere survive.
  const isBulk = wholesaleBooks.size > 0;

  const outcome = commitIfNotStale({
    workingFilesStore: args.workingFilesStore,
    interactionGate: args.interactionGate,
    startState,
    scope: isBulk
      ? { kind: "workspace" }
      : { kind: "chapters", candidates: affected },
    commit: (latest) => {
      args.workingFilesStore.commit({
        patch: {
          kind: "bulk",
          files: isBulk
            ? files
            : overlayAffectedChapters(latest, files, affected),
        },
        meta: {
          ...args.commitMeta,
          // Producers state facts: scope is the measured chapter list, widened
          // to `{ project: true }` when a wholesale rebuild changed a book's
          // chapter SET (added/removed chapters — a list cannot express
          // absence) or when the caller explicitly opted into whole-snapshot
          // semantics.
          scope:
            args.commitMeta.scope ??
            (chapterSetChanged(
              files,
              wholesaleBooks,
              wholesaleOriginalChapterNums,
            )
              ? { project: true }
              : { chapters: affected }),
        },
      });
    },
  });

  return outcome.kind === "committed"
    ? { kind: "committed", value, committedChapters: affected }
    : { kind: "aborted", reason: outcome.reason };
}

/**
 * Has any wholesale book's chapter SET changed — chapters added or removed by
 * the rebuild? A chapter list cannot express absence, so such a commit must
 * carry `{ project: true }` for subscribers to wipe state for vanished
 * chapters. Same chapter set (content-only rewrite) stays a chapter list.
 */
function chapterSetChanged(
  files: ScriptureBookState[],
  wholesaleBooks: Set<string>,
  originalChapterNums: Map<string, Set<number>>,
): boolean {
  for (const bookCode of wholesaleBooks) {
    const before = originalChapterNums.get(bookCode);
    const book = files.find((b) => b.bookCode === bookCode);
    const after = new Set(book?.chapters.map((c) => c.chapterNumber) ?? []);
    if (!before || before.size !== after.size) return true;
    for (const num of after) {
      if (!before.has(num)) return true;
    }
  }
  return false;
}
