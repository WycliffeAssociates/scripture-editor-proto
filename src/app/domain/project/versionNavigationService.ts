import type { EditorShape } from "@/app/data/editor.ts";
import { applyIncomingChapterAll } from "@/app/domain/project/compare/compareMutations.ts";
import { markFilesAsSaved } from "@/app/domain/project/saveAndRevertService.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";

/**
 * Version navigation rehydrates the workspace from a saved snapshot and then makes
 * that snapshot the new clean baseline. Moving to a version is therefore more than
 * a preview; it resets what counts as "saved" in the current session.
 */
export function applyVersionSnapshotToWorkingFiles(args: {
  workingFiles: ScriptureBookState[];
  sourceFiles: ScriptureBookState[];
  /** The `workingRebuild` shape (see `shapeForSurface`). */
  shape: EditorShape;
  /**
   * Books to leave untouched. Reconciliation passes the locally-protected
   * books so they keep their local content and baseline; everything else is
   * reset to the snapshot and marked clean.
   */
  excludeBookCodes?: ReadonlySet<string>;
}) {
  applyIncomingChapterAll({
    workingFiles: args.workingFiles,
    sourceFiles: args.sourceFiles,
    shape: args.shape,
    excludeBookCodes: args.excludeBookCodes,
  });
  // Version navigation should establish a clean baseline at the selected
  // snapshot — for every book the apply touched.
  const exclude = args.excludeBookCodes;
  markFilesAsSaved(
    exclude
      ? args.workingFiles.filter((file) => !exclude.has(file.bookCode))
      : args.workingFiles,
  );
}
