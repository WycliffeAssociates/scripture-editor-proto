import { Deferred, Effect, Stream } from "effect";
import type { LexicalEditor } from "lexical";

import type { EditorShape } from "@/app/data/editor.ts";
import {
  type ConsumerChapterScope,
  NO_CHAPTERS,
  touchedChapters,
} from "@/app/state/commitFilters.ts";
import type { LayoutTickStore } from "@/app/state/LayoutTickStore.ts";
import type { CommitEvent } from "@/app/state/types.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import { setEditorContent } from "@/app/ui/hooks/utils/editorUtils.ts";

/**
 * Which chapters editor-sync considers — its OWN policy, and the one with a
 * genuinely different relevance from the analyzers: ONLY programmatic content
 * mutations sync back into the visible editor. `userEdit` originates FROM the
 * editor (writing back would clobber selection/IME) and `undo`/`redo` replay
 * restores its own content + selection, so both are excluded.
 */
function editorSyncCommitScope(event: CommitEvent): ConsumerChapterScope {
  if (!event.meta.dirtyTextContent) return NO_CHAPTERS;
  const kind = event.meta.kind;
  if (kind !== "programmaticFix" && kind !== "import") return NO_CHAPTERS;
  return touchedChapters(event);
}

/**
 * Stream pipeline that keeps the VISIBLE editor in sync with programmatic
 * working-files commits.
 *
 * The commit-driven entry path of the editor-sync chokepoint: when a
 * `programmaticFix` / `import` commit touches the chapter currently on
 * screen, render that chapter's committed content into the editor and pulse
 * the overlay tick. View-driven swaps (navigation, mode switch) are NOT
 * commits — they call `setEditorContent` directly.
 *
 * No debounce: these commits are rare, and any delay widens the window where
 * the user types into pre-fix content. `userEdit` commits are excluded
 * (they originate FROM the editor; writing back clobbers selection/IME) and
 * `undo`/`redo` are excluded (replay restores its own content + selection) —
 * see `editorSyncCommitScope`.
 *
 * Visible book/chapter are read through getters at fire time — navigation
 * can change them after the fiber is forked.
 */
export function makeEditorSyncPipeline(args: {
  workingFilesStore: WorkingFilesStore;
  mainEditorDeferred: Deferred.Deferred<LexicalEditor>;
  getVisibleBookCode: () => string;
  getVisibleChapter: () => number;
  getEditorShape: () => EditorShape;
  layoutTickStore: LayoutTickStore;
}): Effect.Effect<void> {
  return args.workingFilesStore.changes.pipe(
    Stream.mapEffect((event) =>
      Effect.gen(function* () {
        const scope = editorSyncCommitScope(event);
        if (scope !== "all" && scope.length === 0) return;
        const bookCode = args.getVisibleBookCode();
        const chapterNum = args.getVisibleChapter();
        const touchesVisible =
          scope === "all" ||
          scope.some(
            (ref) => ref.bookCode === bookCode && ref.chapterNum === chapterNum,
          );
        if (!touchesVisible) return;

        const editor = yield* Deferred.await(args.mainEditorDeferred);
        yield* Effect.sync(() => {
          // Latest read, not event.snapshot: a later commit may have
          // superseded this event's content while we awaited the
          // editor.
          setEditorContent(
            editor,
            bookCode,
            chapterNum,
            undefined,
            args.workingFilesStore,
            args.getEditorShape(),
          );
          // The content swap bypasses the bridge (programaticIgnore
          // tag), so overlay hit-targets re-resolve via an explicit
          // tick once the new DOM has reconciled.
          requestAnimationFrame(() => args.layoutTickStore.bump());
        });
      }).pipe(
        Effect.catch((error: unknown) =>
          Effect.sync(() => {
            // eslint-disable-next-line no-console
            console.error("[editorSyncPipeline] sync failed", {
              error,
            });
          }),
        ),
      ),
    ),
    Stream.runDrain,
  );
}
