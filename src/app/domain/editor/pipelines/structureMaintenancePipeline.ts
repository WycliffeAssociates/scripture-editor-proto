import { Deferred, Duration, Effect, Stream } from "effect";
import type { LexicalEditor } from "lexical";

import { analysisDisabledInMode, EDITOR_MODES } from "@/app/data/editor.ts";
import type { Settings } from "@/app/data/settings.ts";
import { maintainDocumentStructure } from "@/app/domain/editor/listeners/maintainDocumentStructure.ts";
import { maintainDocumentMetaData } from "@/app/domain/editor/listeners/maintainMetadata.ts";
import type { CommitEvent } from "@/app/state/types.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";

/** Whether structure maintenance reacts — its OWN relevance: user edits only. */
export function isStructureMaintenanceRelevant(event: CommitEvent): boolean {
  return event.meta.kind === "userEdit" && event.meta.dirtyTextContent;
}

// Frame cadence. The stamped attributes (sid, inPara, structural-empty) are
// interactive UI inputs — the reference pane queries `[data-sid]` on
// selection change, structural-empty drives CSS and the container Enter/
// backspace handlers — and a single local edit can invalidate arbitrarily
// many downstream nodes' sids (document-order-global derived state). The
// pass is zero-byte and zero-caret (historyMerge + structuralFixup tags),
// so running it at frame rate is safe — it moves neither bytes nor the caret.
const DEFAULT_STRUCTURE_DEBOUNCE_MS = 16;

/**
 * Stream pipeline that runs metadata maintenance after user edits — the
 * sweep host repurposed: the repair half is deleted (numbered-marker nodes
 * made its failure states unrepresentable); what runs here is
 * `maintainDocumentMetaData` (sid/inPara/structural-empty stamping, a
 * full-document walk by necessity — the values are document-order-global)
 * plus the one residual char-marker repair (see maintainDocumentStructure).
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
        const mode = settings.editorMode ?? EDITOR_MODES.regular;
        // View is read-only; plain is the bytes-only escape hatch. Both opt
        // out of structural/metadata repair. `analysisDisabledInMode` is the
        // single definition of what plain disables (see data/editor.ts).
        if (mode === EDITOR_MODES.view || analysisDisabledInMode(mode)) {
          return;
        }
        const bookCode = args.getVisibleBookCode();
        const editorState = editor.getEditorState();
        yield* Effect.sync(() => {
          if (editorState.isEmpty()) return;
          editorState.read(() => {
            maintainDocumentStructure(editorState, editor, settings);
            maintainDocumentMetaData(editorState, editor, bookCode, settings);
          });
        });
      }).pipe(
        Effect.catch((error: unknown) =>
          Effect.sync(() => {
            // eslint-disable-next-line no-console
            console.error("[structureMaintenancePipeline] failed", error);
          }),
        ),
      ),
    ),
    Stream.runDrain,
  );
}
