import type { CommitEvent } from "./types.ts";

/**
 * Named predicates that decide which `CommitEvent`s each Stage-2 subscriber
 * acts on. Single source of truth: if a new `CommitKind` lands or a
 * subscriber's policy shifts, change it here, not at three near-identical
 * `Stream.filter` call sites.
 *
 * Three policies today:
 *  - lint: any text change a user could care about — excludes the
 *    structure-fixup writeback (own loop), the loader-seeded snapshot, and
 *    history replay (the post-undo/redo effect re-lints just touched books).
 *  - save status: same exclusions as lint except `undo` / `redo` *do* drive
 *    dirty/clean transitions (replay restores prior dirty state).
 *  - structure maintenance: narrowest — only user edits trigger the fixup
 *    pass; programmatic writebacks already produce structurally-consistent
 *    state and would otherwise feedback-loop.
 *
 * `metadataOnly` events (selection-only commits from the bridge) are
 * excluded everywhere — no current subscriber materializes them.
 */
export function isLintRelevant(event: CommitEvent): boolean {
    if (!event.meta.dirtyTextContent) return false;
    const kind = event.meta.kind;
    return (
        kind !== "metadataOnly" &&
        kind !== "structuralFixup" &&
        kind !== "load" &&
        kind !== "undo" &&
        kind !== "redo"
    );
}

export function isSaveStatusRelevant(event: CommitEvent): boolean {
    if (!event.meta.dirtyTextContent) return false;
    const kind = event.meta.kind;
    return (
        kind !== "metadataOnly" && kind !== "structuralFixup" && kind !== "load"
    );
}

export function isStructureMaintenanceRelevant(event: CommitEvent): boolean {
    return event.meta.kind === "userEdit" && event.meta.dirtyTextContent;
}

/**
 * Which commits the crash-recovery dirty-buffer pipeline reconciles against.
 *
 * Widest policy of the four: the pipeline must react to anything that could make
 * a book dirty (so it writes a backup) OR clean (so it clears one). That means
 * it cannot filter on `dirtyTextContent` — the save flow's clean-marking commit
 * is `metadataOnly` with `dirtyTextContent: false`, and that is exactly the
 * event that should clear a book's backup.
 *
 * Only two exclusions:
 *  - `load` — initial project/chapter population. Any backup that should exist is
 *    already on disk; the loader handles restoration, not the pipeline.
 *  - `selectionOnly` *patches* — pure cursor/selection moves change no state
 *    (`applyPatch` returns the same array), so there is nothing to reconcile.
 *    (Note this keys off the patch kind, not `meta.kind`: a `metadataOnly` meta
 *    carrying a `bulk`/`metadata` patch — e.g. the save clean-mark — DOES flip
 *    dirty flags and must be reconciled.)
 */
export function isDirtyBufferRelevant(event: CommitEvent): boolean {
    if (event.meta.kind === "load") return false;
    if (event.patch.kind === "selectionOnly") return false;
    return true;
}
