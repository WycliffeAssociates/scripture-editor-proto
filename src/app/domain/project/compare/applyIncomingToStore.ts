// applyIncomingToStore.ts
//
// The validated command boundary for incoming-source mutations (remote sync /
// external compare). Every working-state write that derives from an awaited
// incoming computation MUST go through `runIncomingMutation` (or use the
// identity helpers directly when its governing await is upstream), so the same
// lost-update contract is enforced in one place instead of ad hoc per commit.
//
// The contract (`runIncomingMutation`):
//   1. Capture the affected chapters' OBJECT IDENTITIES before async work.
//   2. Run the async computation WITHOUT holding a writable store draft.
//   3. Re-read the latest store state.
//   4. Abort if any affected chapter was replaced during the await. Identity,
//      not text — the store's structural sharing gives a touched chapter a new
//      object on ANY commit, so this catches a text edit AND a save-rebase that
//      changes sourceTokens/dirty but not currentTokens text. `selectionOnly`
//      commits don't replace chapter objects, so cursor moves don't false-abort.
//   5. Recheck the interaction gate (no commit while a save is in flight).
//   6. Commit synchronously from the LATEST state (untouched chapters aliased,
//      so concurrent commits to them survive).
//   7. Side effects (remote-accept/status) run only after a validated commit.

import type { EditorShape } from "@/app/data/editor.ts";
import {
  applyIncomingChapter,
  applyIncomingHunk,
} from "@/app/domain/project/compare/compareMutations.ts";
import type { ProjectDiff } from "@/app/domain/project/diffTypes.ts";
import {
  type IncomingMutationResult,
  type IncomingMutationRunResult,
  incomingMutationAborted,
} from "@/app/domain/project/remoteSync/commandResults.ts";
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
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";

export type ChapterIdentitySnapshot = ReadonlyMap<
  string,
  ScriptureChapterState | undefined
>;

/** Snapshot the current object identity of each candidate chapter (or undefined). */
export function captureChapterIdentities(
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
export function chapterIdentitiesUnchanged(
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
 * Validation scope for `runIncomingMutation`, matched to the WRITE's scope:
 *  - `chapters`: the write touches only the named chapters (e.g. hunk / full
 *    -chapter overlay). Validate just those chapters' identities; concurrent
 *    edits to OTHER chapters are fine (they're preserved by overlay-from-latest).
 *  - `workspace`: the write touches the whole workspace (e.g. version-snapshot
 *    replacement, which also marks every chapter clean and can touch chapters
 *    CREATED during the await — outside any fixed ref set). Validate that NO
 *    state-changing commit happened: the store's structural sharing replaces the
 *    `read()` array on any content/baseline/new-chapter commit, while
 *    `selectionOnly` preserves it — so array identity is the exact signal.
 */
export type IncomingMutationScope =
  | { kind: "chapters"; candidates: ChapterRef[] }
  | { kind: "workspace" };

/**
 * Build the post-apply state by taking the LATEST store state and overlaying
 * only the affected chapters from the scratch. Untouched chapters alias
 * `latest`, so a concurrent commit is preserved; new chapters/books the apply
 * created are folded in.
 */
export function overlayAffectedChapters(
  latest: ScriptureBookState[],
  scratch: ScriptureBookState[],
  affectedRefs: ChapterRef[],
): ScriptureBookState[] {
  const affectedByBook = new Map<string, Set<number>>();
  for (const ref of affectedRefs) {
    const set = affectedByBook.get(ref.bookCode) ?? new Set<number>();
    set.add(ref.chapterNum);
    affectedByBook.set(ref.bookCode, set);
  }
  const scratchByCode = new Map(scratch.map((book) => [book.bookCode, book]));
  const result = latest.map((book) => {
    const affectedNums = affectedByBook.get(book.bookCode);
    const scratchBook = scratchByCode.get(book.bookCode);
    if (!affectedNums || !scratchBook) return book;
    const latestByNum = new Map(book.chapters.map((c) => [c.chapterNumber, c]));
    const scratchByNum = new Map(
      scratchBook.chapters.map((c) => [c.chapterNumber, c]),
    );
    const allNums = new Set<number>([...latestByNum.keys(), ...affectedNums]);
    const chapters = [...allNums]
      .sort((a, b) => a - b)
      .map((num) =>
        affectedNums.has(num)
          ? (scratchByNum.get(num) ?? latestByNum.get(num))
          : latestByNum.get(num),
      )
      .filter((c): c is ScriptureChapterState => Boolean(c));
    return { ...book, chapters };
  });
  // Books that exist only in the scratch (newly created by the apply).
  const latestCodes = new Set(latest.map((book) => book.bookCode));
  for (const bookCode of affectedByBook.keys()) {
    if (latestCodes.has(bookCode)) continue;
    const scratchBook = scratchByCode.get(bookCode);
    if (scratchBook) result.push(scratchBook);
  }
  return result;
}

/**
 * Run a validated incoming mutation. See the file header for the contract.
 * `compute` does the async work on captured/private inputs (no writable store
 * draft held across the await); `commit` is synchronous and writes from the
 * validated latest state. Returns whether the commit ran (`computed` is always
 * returned so callers can reuse the computed value for display/return).
 */
export async function runIncomingMutation<T>(args: {
  workingFilesStore: WorkingFilesStore;
  interactionGate: WorkspaceGateStore;
  scope: IncomingMutationScope;
  compute: () => Promise<T>;
  commit: (computed: T, latest: ScriptureBookState[]) => void;
}): Promise<IncomingMutationRunResult<T>> {
  const scope = args.scope;
  const startState = args.workingFilesStore.read();
  // Build the staleness predicate at capture time, matched to the scope.
  let isStale: () => boolean;
  if (scope.kind === "workspace") {
    isStale = () => args.workingFilesStore.read() !== startState;
  } else {
    const baseline = captureChapterIdentities(startState, scope.candidates);
    isStale = () =>
      !chapterIdentitiesUnchanged(
        args.workingFilesStore.read(),
        scope.candidates,
        baseline,
      );
  }

  const computed = await args.compute();
  if (isStale()) {
    console.info(
      "[incoming] aborted — the workspace/affected chapter changed during the apply (edit, save, or new chapter); result is stale",
    );
    return {
      kind: "aborted",
      reason: scope.kind === "workspace" ? "stale-workspace" : "stale-chapter",
      computed,
    };
  }
  if (!requireGateOpen(args.interactionGate.get())) {
    return { kind: "aborted", reason: "gate-closed", computed };
  }
  args.commit(computed, args.workingFilesStore.read());
  return { kind: "committed", computed };
}

/**
 * Apply incoming full-chapter replacements and/or hunks into the store through
 * the validated boundary. On `aborted`, nothing is committed — callers should
 * skip any "mark remote synced" side effect and leave the diff for retry.
 */
export async function applyIncomingToStore(args: {
  workingFilesStore: WorkingFilesStore;
  interactionGate: WorkspaceGateStore;
  usfmOnionService: IUsfmOnionService;
  fullChapterApplies: ChapterRef[];
  hunkApplies: ProjectDiff[];
  sourceFiles: ScriptureBookState[];
  /** The `workingRebuild` shape (see `shapeForSurface`). */
  shape: EditorShape;
}): Promise<IncomingMutationResult<ScriptureBookState[]>> {
  const affectedRefs: ChapterRef[] = [
    ...args.fullChapterApplies,
    ...args.hunkApplies.map((diff) => ({
      bookCode: diff.bookCode,
      chapterNum: diff.chapterNum,
    })),
  ];
  if (affectedRefs.length === 0) {
    return incomingMutationAborted({ reason: "empty-plan" });
  }

  return await runIncomingMutation({
    workingFilesStore: args.workingFilesStore,
    interactionGate: args.interactionGate,
    scope: { kind: "chapters", candidates: affectedRefs },
    // Apply on a STRUCTURAL-SHARING scratch — a `draftWithChapters` draft,
    // only affected chapters get fresh objects, NOT a whole-project deep
    // clone (that was ~1.5s on Psalm 119). Awaits are safe (the scratch
    // isn't the store) and sequential hunk composition is preserved.
    compute: async () => {
      const scratch = args.workingFilesStore.draftWithChapters(affectedRefs);
      for (const chapter of args.fullChapterApplies) {
        applyIncomingChapter({
          workingFiles: scratch,
          sourceFiles: args.sourceFiles,
          bookCode: chapter.bookCode,
          chapterNum: chapter.chapterNum,
          shape: args.shape,
        });
      }
      for (const diff of args.hunkApplies) {
        await applyIncomingHunk({
          workingFiles: scratch,
          sourceFiles: args.sourceFiles,
          diff,
          usfmOnionService: args.usfmOnionService,
          shape: args.shape,
        });
      }
      return scratch;
    },
    commit: (scratch, latest) => {
      args.workingFilesStore.commit({
        patch: {
          kind: "bulk",
          files: overlayAffectedChapters(latest, scratch, affectedRefs),
        },
        meta: {
          kind: "import",
          action: "applyIncoming",
          scope: { project: true },
          dirtyTextContent: true,
        },
      });
    },
  });
}
