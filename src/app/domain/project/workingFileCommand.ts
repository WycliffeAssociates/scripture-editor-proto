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
// It composes the SAME validated primitives the incoming-reconciliation path
// already uses (`captureChapterIdentities` / `chapterIdentitiesUnchanged` /
// `overlayAffectedChapters` from `applyIncomingToStore.ts`), so there is one
// lost-update contract in the codebase, not two. The mutator runs on a
// structural-sharing scratch (safe across awaits — it is NOT the store); the
// helper then re-reads the latest state, validates the chapters it is about to
// write were not replaced underneath it, rechecks the gate, and commits by
// overlaying ONLY the affected chapters onto the latest state.
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
//   - `mutate` may ONLY mutate the scratch and COMPUTE a value. It must not run
//     UI side effects — at mutate time the commit has not been validated, so
//     any effect there can outlive an abort.
//   - Callers branch on the returned `kind` before running any follow-through;
//     the typed result makes "did this actually commit?" impossible to skip.

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

/**
 * Caller-provided meta, MINUS `scope` — the seam stamps it. By default scope
 * is the precise `{ chapters: affected }` the mutator reported (producers
 * state facts; the scope is exactly as true as the commit itself). Callers
 * opt into `{ project: true }` only for genuine whole-snapshot semantics
 * (books added/removed — a chapter list cannot express absence).
 */
type CommitMetaInput = Omit<CommitMeta, "generation" | "scope"> & {
    scope?: { project: true };
};

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

    // DEV-ONLY: workspace-scope commits write the WHOLE scratch, so an
    // under-reported `affected` would commit changes that downstream
    // subscribers (lint/sous/diff/editor-sync, all scope-precise) are never
    // told about — the store skews silently against every derived view.
    // (`chapters` scope can't lie: only `affected` chapters are overlaid, so
    // an under-report loses the write itself — a visible bug.) Scream here,
    // at the moment the lie is told. Cost is bounded: only the DRAFTED
    // chapters get serialized, dev builds only.
    if (import.meta.env.DEV && scope === "workspace") {
        assertAffectedCoversScratchChanges({
            startState,
            scratch,
            draftRefs: args.draftRefs,
            affected,
        });
    }

    args.workingFilesStore.commit({
        patch: {
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
        meta: {
            ...args.commitMeta,
            // Producers state facts: scope is stamped from what the mutator
            // actually reported changed, unless the caller explicitly opted
            // into whole-snapshot semantics.
            scope: args.commitMeta.scope ?? { chapters: affected },
        },
    });

    return { kind: "committed", value, committedChapters: affected };
}

/**
 * DEV-ONLY guard for workspace-scope commits: every drafted chapter whose
 * content actually changed must be listed in `affected`. An under-report
 * here is the worst failure class this seam can produce — the change COMMITS
 * (workspace scope writes the whole scratch) but scope-precise subscribers
 * are never notified, so lint/sous/diff/editor silently skew against the
 * store. Throwing in dev makes the lie unmissable at the moment it's told.
 *
 * Comparison strategy, cheapest first: shared chapter object → unchanged
 * (structural sharing); shared `lexicalState` reference → unchanged (drafted
 * chapter objects are fresh but share nested refs until actually written);
 * otherwise JSON-compare the serialized state (a rebuild swaps refs even for
 * content-identical chapters). Only DRAFTED chapters are compared — mutating
 * outside the draft set is already a contract violation of the scratch.
 */
function assertAffectedCoversScratchChanges(args: {
    startState: ScriptureBookState[];
    scratch: ScriptureBookState[];
    draftRefs: ChapterRef[];
    affected: ChapterRef[];
}): void {
    const affectedKeys = new Set(
        args.affected.map((ref) => `${ref.bookCode}:${ref.chapterNum}`),
    );
    const underReported: string[] = [];
    for (const ref of args.draftRefs) {
        const key = `${ref.bookCode}:${ref.chapterNum}`;
        if (affectedKeys.has(key)) continue;
        const before = findChapterIn(args.startState, ref);
        const after = findChapterIn(args.scratch, ref);
        if (before === after) continue;
        if (!before || !after) {
            underReported.push(key);
            continue;
        }
        if (before.lexicalState === after.lexicalState) continue;
        if (
            JSON.stringify(before.lexicalState) !==
            JSON.stringify(after.lexicalState)
        ) {
            underReported.push(key);
        }
    }
    if (underReported.length > 0) {
        throw new Error(
            `[workingFileCommand] UNDER-REPORTED AFFECTED on workspace-scope commit: ` +
                `chapters [${underReported.join(", ")}] changed in the scratch but were ` +
                `not listed in \`affected\`. The commit would land these changes WITHOUT ` +
                `notifying scope-precise subscribers (lint/sous/diff/editor-sync) — the ` +
                `store would silently skew against every derived view. Fix the mutator's ` +
                `affected computation.`,
        );
    }
}

function findChapterIn(files: ScriptureBookState[], ref: ChapterRef) {
    return (
        files
            .find((file) => file.bookCode === ref.bookCode)
            ?.chapters.find(
                (chapter) => chapter.chapterNumber === ref.chapterNum,
            ) ?? null
    );
}
