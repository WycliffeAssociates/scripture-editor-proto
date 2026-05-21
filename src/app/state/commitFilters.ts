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
