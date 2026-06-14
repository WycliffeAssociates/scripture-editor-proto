// applyIncomingToStore.ts
//
// The validated command boundary for incoming-source mutations (remote sync /
// external compare). Every working-state write that derives from an awaited
// incoming computation goes through `runIncomingMutation`, a thin adapter over
// the shared lost-update contract in `validatedStoreMutation.ts`: the incoming
// apply runs on a PRIVATE scratch (so it may create chapters/books the recording
// draft can't), then the shared `commitIfNotStale` tail validates that the
// branched-from state is still current, rechecks the gate, and commits from the
// latest state. Side effects (remote-accept/status) run only after a validated
// commit.

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
  commitIfNotStale,
  type StalenessScope,
} from "@/app/domain/project/validatedStoreMutation.ts";
import {
  type ChapterRef,
  overlayAffectedChapters,
} from "@/app/domain/project/workingFileMutations.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceGateStore } from "@/app/state/WorkspaceInteractionGate.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";

/**
 * Run a validated incoming mutation. `compute` does the async work on
 * captured/private inputs (no writable store draft held across the await);
 * `commit` is synchronous and writes from the validated latest state. Returns
 * whether the commit ran (`computed` is always returned so callers can reuse
 * the computed value for display/return).
 */
export async function runIncomingMutation<T>(args: {
  workingFilesStore: WorkingFilesStore;
  interactionGate: WorkspaceGateStore;
  scope: StalenessScope;
  compute: () => Promise<T>;
  commit: (computed: T, latest: ScriptureBookState[]) => void;
}): Promise<IncomingMutationRunResult<T>> {
  const startState = args.workingFilesStore.read();
  const computed = await args.compute();
  const outcome = commitIfNotStale({
    workingFilesStore: args.workingFilesStore,
    interactionGate: args.interactionGate,
    startState,
    scope: args.scope,
    commit: (latest) => args.commit(computed, latest),
  });
  return outcome.kind === "committed"
    ? { kind: "committed", computed }
    : { kind: "aborted", reason: outcome.reason, computed };
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
        });
      }
      for (const diff of args.hunkApplies) {
        await applyIncomingHunk({
          workingFiles: scratch,
          sourceFiles: args.sourceFiles,
          diff,
          usfmOnionService: args.usfmOnionService,
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
