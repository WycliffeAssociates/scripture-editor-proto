import { Effect, Stream } from "effect";
import { isSaveStatusRelevant } from "@/app/state/commitFilters.ts";
import type { SaveStatusStore } from "@/app/state/SaveStatusStore.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";

/**
 * Pipeline that drives `SaveStatusStore` from working-files commits. Pure
 * observation: no debounce, no disk write — auto-save-to-file is out of
 * scope.
 *
 * For each text-changing commit, derive status from the snapshot's dirty
 * flags: any dirty chapter → `dirty`; none → `cleanFromCommit` (which
 * defers to an in-flight save). This handles user edit (→ dirty) and
 * revert/discard-all (→ clean) symmetrically without store-side bookkeeping.
 *
 * Filter excludes:
 *  - `metadataOnly`     — dirty-flag-only commits (the save flow flips
 *                         chapters back via metadata patches; we don't want
 *                         a transient saving→clean re-flip mid-save).
 *  - `structuralFixup`  — structure-maintenance writebacks.
 *  - `load`             — initial project load; the store seeds its own
 *                         initial status from `projectFiles`.
 */
export function makeSaveStatusPipeline(args: {
    workingFilesStore: WorkingFilesStore;
    saveStatusStore: SaveStatusStore;
}): Effect.Effect<void> {
    return args.workingFilesStore.changes.pipe(
        Stream.filter(isSaveStatusRelevant),
        Stream.tap((event) =>
            Effect.sync(() => {
                const anyDirty = event.snapshot.some((file) =>
                    file.chapters.some((chapter) => chapter.dirty),
                );
                if (anyDirty) args.saveStatusStore.setDirty();
                else args.saveStatusStore.setCleanFromCommit();
            }),
        ),
        Stream.runDrain,
    );
}
