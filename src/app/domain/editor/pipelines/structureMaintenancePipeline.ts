import { Deferred, Duration, Effect, Stream } from "effect";
import type { LexicalEditor } from "lexical";
import { EDITOR_MODES } from "@/app/data/editor.ts";
import type { Settings } from "@/app/data/settings.ts";
import { maintainDocumentStructure } from "@/app/domain/editor/listeners/maintainDocumentStructure.ts";
import { maintainDocumentMetaData } from "@/app/domain/editor/listeners/maintainMetadata.ts";
import { isStructureMaintenanceRelevant } from "@/app/state/commitFilters.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";

const DEFAULT_STRUCTURE_DEBOUNCE_MS = 75;

/**
 * Stream pipeline that runs structural + metadata maintenance after user edits.
 *
 * Subscribes to `workingFilesStore.changes` and uses the commit only as a
 * signal — the maintenance passes themselves operate on the editor's current
 * state, not the commit snapshot. Filter is intentionally tight:
 *  - `kind === "userEdit"` keeps the pipeline out of its own feedback loop
 *    (its writebacks publish as `structuralFixup`) and avoids re-running on
 *    programmaticFix / load / undo / redo commits, which already arrive in a
 *    structurally-consistent shape.
 *  - `dirtyTextContent` skips selection-only churn (the bridge currently
 *    drops those too, but this future-proofs the pipeline).
 *
 * The pipeline awaits a `Deferred<LexicalEditor>` resolved on bridge mount, so
 * the first commit after workspace open doesn't race the editor reference.
 * View mode is checked at fire time via `getAppSettings()` — settings can
 * change after the fiber is forked.
 */
export function makeStructureMaintenancePipeline(args: {
    workingFilesStore: WorkingFilesStore;
    mainEditorDeferred: Deferred.Deferred<LexicalEditor>;
    getAppSettings: () => Settings;
    getVisibleBookCode: () => string;
    debounceMs?: number;
}): Effect.Effect<void> {
    const debounceMs = args.debounceMs ?? DEFAULT_STRUCTURE_DEBOUNCE_MS;
    return args.workingFilesStore.changes.pipe(
        Stream.filter(isStructureMaintenanceRelevant),
        Stream.debounce(Duration.millis(debounceMs)),
        Stream.mapEffect(() =>
            Effect.gen(function* () {
                const editor = yield* Deferred.await(args.mainEditorDeferred);
                const settings = args.getAppSettings();
                if (
                    (settings.editorMode ?? EDITOR_MODES.regular) ===
                    EDITOR_MODES.view
                ) {
                    return;
                }
                const bookCode = args.getVisibleBookCode();
                const editorState = editor.getEditorState();
                yield* Effect.sync(() => {
                    if (editorState.isEmpty()) return;
                    editorState.read(() => {
                        maintainDocumentStructure(
                            editorState,
                            editor,
                            settings,
                        );
                        maintainDocumentMetaData(
                            editorState,
                            editor,
                            bookCode,
                            settings,
                        );
                    });
                });
            }).pipe(
                Effect.catch((error: unknown) =>
                    Effect.sync(() => {
                        // eslint-disable-next-line no-console
                        console.error(
                            "[structureMaintenancePipeline] failed",
                            error,
                        );
                    }),
                ),
            ),
        ),
        Stream.runDrain,
    );
}
