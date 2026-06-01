// workingFileCommand.ts
//
// The ergonomic front-door for ACTIVE working-files mutations (format, match-
// formatting, prettify, lint-fix — anything that reads the store, derives new
// chapter content, and commits it back).
//
// It exists so call sites cannot:
//   (a) hold a mutable draft across an `await` before commit (the documented
//       lost-update hazard on `WorkingFilesStore.draftWithChapters`), or
//   (b) commit a stale whole-state `bulk` over a concurrent commit, or
//   (c) forget the post-commit follow-up (invalidate diff/lint, sync the
//       visible editor).
//
// It composes the SAME validated primitives the incoming-reconciliation path
// already uses (`captureChapterIdentities` / `chapterIdentitiesUnchanged` /
// `overlayAffectedChapters` from `applyIncomingToStore.ts`), so there is one
// lost-update contract in the codebase, not two. The mutator runs on a
// structural-sharing scratch (safe across awaits — it is NOT the store); the
// helper then re-reads the latest state, validates the chapters it is about to
// write were not replaced underneath it, rechecks the gate, and commits by
// overlaying ONLY the affected chapters onto the latest state.
//
// What stays at the call site: the `history.runTransaction` wrapper, user
// notifications, and per-action reports. Those are genuinely per-action UX;
// folding them in here would be the "forced abstraction" smell.
//
// CONTRACT (so a stale/gate abort can't publish a side effect for a write that
// never landed):
//   - `mutate` may ONLY mutate the scratch and COMPUTE a value. It must not run
//     UI/lint/editor side effects — at mutate time the commit has not been
//     validated, so any effect there can outlive an abort.
//   - `invalidate` is the post-commit hook: it runs ONLY after a validated
//     commit, and receives the committed chapters AND the computed value, so it
//     can read the committed latest state and react to what was written.
//   - On `aborted`, neither `invalidate` nor any caller side effect should run.
//     Callers branch on the returned `kind`; the typed result makes "did this
//     actually commit?" impossible to skip.

import {
    captureChapterIdentities,
    chapterIdentitiesUnchanged,
    overlayAffectedChapters,
} from "@/app/domain/project/compare/applyIncomingToStore.ts";
import type { IncomingMutationAbortReason } from "@/app/domain/project/remoteSync/commandResults.ts";
import type { ChapterRef } from "@/app/domain/project/workingFileMutations.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { CommitMeta } from "@/app/state/types.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import {
    requireGateOpen,
    type WorkspaceGateStore,
} from "@/app/state/WorkspaceInteractionGate.ts";

type CommitMetaInput = Omit<CommitMeta, "generation">;

export type WorkingFilesCommandResult<T> =
    | { kind: "committed"; value: T; committedChapters: ChapterRef[] }
    | { kind: "unchanged"; value: T }
    | { kind: "aborted"; reason: IncomingMutationAbortReason };

/**
 * Commit shape, matched to how the mutator writes the scratch:
 *
 * - `"chapters"` (default): the mutator changes chapters IN PLACE. Commit by
 *   overlaying only the affected chapters onto the latest `read()`, so a
 *   concurrent commit to OTHER chapters survives. Validation is per affected
 *   chapter (identity); a concurrent edit to a non-affected chapter is fine.
 *
 * - `"workspace"`: the mutator replaces book `chapters` arrays WHOLESALE (e.g.
 *   `rebuildParsedFileFromUsfm`, which can add/remove chapters), so there is no
 *   safe per-chapter overlay — the scratch IS the next full state. Commit the
 *   scratch as a `bulk`, but only after validating that NO concurrent commit
 *   landed (array identity, exactly like `runIncomingMutation`'s workspace
 *   scope). A concurrent commit during the await aborts rather than clobbers.
 */
export type WorkingFilesCommandScope = "chapters" | "workspace";

/**
 * Run a validated working-files mutation. See the file header for the contract.
 *
 * - `draftRefs`: the chapters to make writable in the scratch. For discovery
 *   flows (e.g. format-project) pass every chapter — only the `affected` ones the
 *   mutator returns drive the commit/report.
 * - `mutate`: does the (possibly async) work on the scratch and returns the
 *   chapters it changed plus a value. Scratch + compute ONLY — no side effects
 *   (see the file header). Empty `affected` ⇒ no commit (`unchanged`).
 * - `invalidate`: post-commit follow-up (diff/lint refresh, visible-editor sync);
 *   runs ONLY after a real commit, with the committed chapters and value.
 *
 * The mutator may `await` freely: it works on the scratch, never the store. If a
 * relevant chapter (or, for `workspace` scope, anything) was committed during the
 * await, or the gate closed, the mutation aborts with a typed reason and nothing
 * is committed.
 */
export async function withWorkingFilesDraft<T>(args: {
    workingFilesStore: WorkingFilesStore;
    interactionGate: WorkspaceGateStore;
    draftRefs: ChapterRef[];
    commitMeta: CommitMetaInput;
    scope?: WorkingFilesCommandScope;
    mutate: (
        scratch: ScriptureBookState[],
    ) => Promise<{ affected: ChapterRef[]; value: T }>;
    invalidate?: (committed: {
        committedChapters: ChapterRef[];
        value: T;
    }) => void | Promise<void>;
}): Promise<WorkingFilesCommandResult<T>> {
    const scope = args.scope ?? "chapters";
    const startState = args.workingFilesStore.read();
    const baseline = captureChapterIdentities(startState, args.draftRefs);

    // The scratch is a structural-sharing draft: only `draftRefs` chapters get
    // fresh objects. Mutating it across awaits cannot clobber the store.
    const scratch = args.workingFilesStore.draftWithChapters(args.draftRefs);
    const { affected, value } = await args.mutate(scratch);

    if (affected.length === 0) {
        return { kind: "unchanged", value };
    }

    const isStale =
        scope === "workspace"
            ? // Whole-state replacement: any commit invalidates the scratch.
              args.workingFilesStore.read() !== startState
            : // Per-chapter overlay: only the affected chapters must be unchanged.
              !chapterIdentitiesUnchanged(
                  args.workingFilesStore.read(),
                  affected,
                  baseline,
              );
    if (isStale) {
        console.info(
            `[workingFileCommand] aborted — ${
                scope === "workspace" ? "the workspace" : "an affected chapter"
            } changed during the mutation; result is stale`,
        );
        return {
            kind: "aborted",
            reason: scope === "workspace" ? "stale-workspace" : "stale-chapter",
        };
    }
    if (!requireGateOpen(args.interactionGate.get())) {
        return { kind: "aborted", reason: "gate-closed" };
    }

    args.workingFilesStore.commit(
        {
            kind: "bulk",
            files:
                scope === "workspace"
                    ? scratch
                    : overlayAffectedChapters(
                          args.workingFilesStore.read(),
                          scratch,
                          affected,
                      ),
        },
        args.commitMeta,
    );

    if (args.invalidate)
        await args.invalidate({ committedChapters: affected, value });
    return { kind: "committed", value, committedChapters: affected };
}
