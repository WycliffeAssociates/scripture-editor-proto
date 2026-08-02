import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { Deferred, Effect, Fiber, Stream } from "effect";
import { HISTORIC_TAG, HISTORY_MERGE_TAG } from "lexical";
import { useEffect } from "react";

import { EDITOR_TAGS_USED } from "@/app/data/editor.ts";
import { $captureCurrentSelection } from "@/app/domain/history/historySelection.ts";
import type { CommitKind } from "@/app/state/types.ts";
import { requireGateOpen } from "@/app/state/WorkspaceInteractionGate.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

/**
 * THE single entry point for "something happened inside Lexical that the app
 * responds to". One update listener, three steps in a fixed order:
 *
 *  1. Capture the selection once (data-id-keyed; shared by steps 2 and 3).
 *  2. Feed the history capture. This MUST run before step 3 publishes:
 *     history resolves its selection fallbacks from the store's selection
 *     facts, and those facts must still describe the world BEFORE this
 *     update's commit. Running capture first makes that ordering structural
 *     — no registration-order subtlety, nothing to defend against. History
 *     also processes updates step 3 skips (programmatic write-backs adopt
 *     baselines; structural fixups merge into the latest entry), so it sees
 *     every update, unfiltered.
 *  3. Decide whether to publish a commit into the WorkingFilesStore, and
 *     classify it via `CommitKind` from the update's tags. This is the
 *     inversion of `saveCurrentDirtyLexical` — the editor pushes once per
 *     commit and consumers read from the store.
 *
 * Anything new that needs to react to raw editor updates (another store,
 * another capture) gets added HERE, in sequence — not as a sibling listener.
 *
 * Publish skip rules (step 3 only):
 *  - `programaticIgnore` tag — write-backs *from* the store via
 *    `setEditorContent`; republishing would round-trip our own output.
 *  - `HISTORY_MERGE_TAG` (unless structural-fixup) — pure history-replay glue.
 *  - Gate closed — save in flight or a recovery decision pending.
 *
 * Selection-only updates (no dirty elements/leaves) DO publish, as a
 * `selectionOnly` patch with `kind: "metadataOnly"` and
 * `dirtyTextContent: false`. Cost is bounded (no `toJSON`, no token recompute);
 * future selection-aware consumers (synced scrolling, action palette context)
 * pick them up by filter.
 *
 * Every published patch carries the captured selection (the commit's
 * after-selection fact — see `CapturedSelection` in state/types.ts), so
 * "set selection fact, then commit" is atomic by construction. One
 * consequence of the skip rules: the post-undo/redo selection restore is a
 * `programaticIgnore` update, so it never republishes — that's fine only
 * because undo/redo's bulk commit already carries the restored selection per
 * chapter (`useCustomHistory.applyEntry`).
 *
 * Dev-only commit logger uses the store's `changes: Stream<CommitEvent>` to
 * surface every commit on the console; tree-shaken from prod.
 */
export function WorkingFilesBridgePlugin() {
  const [editor] = useLexicalComposerContext();
  const {
    workingFilesStore,
    project,
    mainEditorDeferred,
    interactionGate,
    history,
  } = useWorkspaceContext();
  const { captureEditorUpdate } = history;

  // Resolve the workspace-scoped Deferred<LexicalEditor> as soon as the
  // editor is available. Effect-side pipelines that write back to the
  // editor (structure-maintenance, future chapter-swap command) await this
  // Deferred so they don't race the mount.
  useEffect(() => {
    Effect.runFork(Deferred.succeed(mainEditorDeferred, editor));
  }, [editor, mainEditorDeferred]);

  useEffect(() => {
    // Dev-only commit logger — subscribes to the store's commit Stream.
    // In prod this whole block tree-shakes out.
    const loggerFiber = import.meta.env.DEV
      ? Effect.runFork(
          Stream.runForEach(workingFilesStore.changes, (event) =>
            Effect.sync(() => {
              console.log("[workingFilesStore commit]", {
                generation: event.meta.generation,
                kind: event.meta.kind,
                scope: event.meta.scope,
                dirtyTextContent: event.meta.dirtyTextContent,
              });
            }),
          ),
        )
      : null;

    const unregisterUpdate = editor.registerUpdateListener(
      ({ editorState, prevEditorState, dirtyElements, dirtyLeaves, tags }) => {
        // Step 1 — one capture, shared below.
        const selection = editorState.read($captureCurrentSelection);

        // Step 2 — history capture, before publish (see header).
        captureEditorUpdate({
          editorState,
          prevEditorState,
          dirtyElements,
          dirtyLeaves,
          tags,
          nextSelection: selection,
        });

        // Step 3 — publish decision.
        if (tags.has(EDITOR_TAGS_USED.programaticIgnore)) {
          return;
        }
        if (!requireGateOpen(interactionGate.get())) {
          return;
        }
        // structuralFixup classifies before HISTORY_MERGE_TAG so the
        // structure pipeline's writebacks still publish — the
        // historyMerge tag is also present to keep them out of undo.
        const isStructuralFix = tags.has(
          EDITOR_TAGS_USED.programmaticStructuralFix,
        );
        if (!isStructuralFix && tags.has(HISTORY_MERGE_TAG)) {
          return;
        }

        const bookCode = project.pickedFile.bookCode;
        const chapter =
          project.pickedChapter?.chapterNumber ?? project.currentChapter;

        const dirty = dirtyElements.size > 0 || dirtyLeaves.size > 0;
        if (!dirty) {
          workingFilesStore.commit({
            patch: {
              kind: "selectionOnly",
              bookCode,
              chapter,
              selection,
            },
            meta: {
              kind: "metadataOnly",
              scope: {
                chapters: [{ bookCode, chapterNum: chapter }],
              },
              dirtyTextContent: false,
            },
          });
          return;
        }

        const kind = getCommitKind(tags);
        const lexicalState = editorState.toJSON();

        workingFilesStore.commit({
          patch: {
            kind: "chapter",
            bookCode,
            chapter,
            lexicalState,
            selection,
          },
          meta: {
            kind,
            scope: {
              chapters: [{ bookCode, chapterNum: chapter }],
            },
            dirtyTextContent: true,
          },
        });
      },
    );

    return () => {
      unregisterUpdate();
      if (loggerFiber) Effect.runFork(Fiber.interrupt(loggerFiber));
    };
  }, [
    editor,
    workingFilesStore,
    project,
    interactionGate,
    captureEditorUpdate,
  ]);

  return null;
}

/**
 * Classify a Lexical update's tag set into a `CommitKind` for the store.
 *
 * Order matters: historic tags can co-occur with others during replay, but the
 * fact that this is a history-replay is the most useful classification for
 * downstream filters (lint skips it, structure-maintenance skips it). The
 * `programmaticDoRunChanges` tag marks the write-back of a fix-it; any other
 * dirty commit is treated as a user edit.
 *
 * Today this distinguishes only `undo` (no separate redo signal at this layer)
 * but the shape lets future tags slot in without rewriting the call site.
 */
function getCommitKind(tags: Set<string>): CommitKind {
  if (tags.has(EDITOR_TAGS_USED.programmaticStructuralFix))
    return "structuralFixup";
  if (tags.has(HISTORIC_TAG)) return "undo";
  if (tags.has(EDITOR_TAGS_USED.programmaticDoRunChanges))
    return "programmaticFix";
  return "userEdit";
}
