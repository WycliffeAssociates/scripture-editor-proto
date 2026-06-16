// validatedStoreMutation.ts
//
// The lost-update contract shared by every async store mutation, in one place.
// Any write whose next-state is derived across an `await` (active verbs on a
// recording draft, incoming-source applies on a private scratch) reaches the
// store through the same tail: validate that the world it branched from is
// still current, recheck the interaction gate, then commit from the LATEST
// state. The two front-doors (`withWorkingFilesDraft`, `runIncomingMutation`)
// differ only in HOW they produce the next-state; this is the orchestration
// they have in common.
//
// Staleness is identity, not text: the store's structural sharing replaces a
// touched chapter's object on ANY content/baseline/new-chapter commit while
// `selectionOnly` leaves it aliased — so object identity is the exact "did a
// concurrent commit land?" signal, and cursor moves never false-abort.

import {
  type ChapterRef,
  findChapter,
} from "@/app/domain/project/workingFileMutations.ts";
import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import {
  requireGateOpen,
  type WorkspaceGateStore,
} from "@/app/state/WorkspaceInteractionGate.ts";

import type { IncomingMutationAbortReason } from "./remoteSync/commandResults.ts";

export type ChapterIdentitySnapshot = ReadonlyMap<
  string,
  ScriptureChapterState | undefined
>;

/** Snapshot the current object identity of each candidate chapter (or undefined). */
function captureChapterIdentities(
  files: ScriptureBookState[],
  candidates: ChapterRef[],
): ChapterIdentitySnapshot {
  const map = new Map<string, ScriptureChapterState | undefined>();
  for (const ref of candidates) {
    const key = `${ref.bookCode}:${ref.chapterNum}`;
    if (!map.has(key)) {
      map.set(key, findChapter(files, ref.bookCode, ref.chapterNum));
    }
  }
  return map;
}

/** True iff every candidate chapter is the SAME object as when `baseline` was captured. */
function chapterIdentitiesUnchanged(
  files: ScriptureBookState[],
  candidates: ChapterRef[],
  baseline: ChapterIdentitySnapshot,
): boolean {
  for (const ref of candidates) {
    const key = `${ref.bookCode}:${ref.chapterNum}`;
    if (
      findChapter(files, ref.bookCode, ref.chapterNum) !== baseline.get(key)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Staleness scope, matched to the WRITE's scope:
 *  - `chapters`: the write touches only the named chapters (hunk / full-chapter
 *    overlay). Validate just those chapters' identities; concurrent edits to
 *    OTHER chapters are fine (overlay-from-latest preserves them).
 *  - `workspace`: the write touches the whole workspace (version-snapshot
 *    replacement, a wholesale book rebuild) and can touch chapters CREATED
 *    during the await — outside any fixed ref set. Validate that NO state-
 *    changing commit landed at all: array identity is the exact signal.
 */
export type StalenessScope =
  | { kind: "workspace" }
  | { kind: "chapters"; candidates: ChapterRef[] };

export type ValidatedCommitOutcome =
  | { kind: "committed" }
  | { kind: "aborted"; reason: IncomingMutationAbortReason };

/**
 * The shared validate→gate→commit tail. `startState` is the snapshot the
 * caller's next-state was derived from (captured before any `await`). Returns
 * whether the commit ran; on abort nothing is written and the caller skips any
 * side effect that assumes a landed write.
 */
export function commitIfNotStale(args: {
  workingFilesStore: WorkingFilesStore;
  interactionGate: WorkspaceGateStore;
  startState: ScriptureBookState[];
  scope: StalenessScope;
  commit: (latest: ScriptureBookState[]) => void;
}): ValidatedCommitOutcome {
  const stale =
    args.scope.kind === "workspace"
      ? args.workingFilesStore.read() !== args.startState
      : !chapterIdentitiesUnchanged(
          args.workingFilesStore.read(),
          args.scope.candidates,
          captureChapterIdentities(args.startState, args.scope.candidates),
        );
  if (stale) {
    console.info(
      "[store-mutation] aborted — the workspace/affected chapter changed during the mutation; result is stale",
    );
    return {
      kind: "aborted",
      reason:
        args.scope.kind === "workspace" ? "stale-workspace" : "stale-chapter",
    };
  }
  if (!requireGateOpen(args.interactionGate.get())) {
    return { kind: "aborted", reason: "gate-closed" };
  }
  args.commit(args.workingFilesStore.read());
  return { kind: "committed" };
}
