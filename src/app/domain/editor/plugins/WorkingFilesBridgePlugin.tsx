import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { Deferred, Effect, Fiber, Stream } from "effect";
import { HISTORIC_TAG, HISTORY_MERGE_TAG } from "lexical";
import { useEffect } from "react";
import { EDITOR_TAGS_USED } from "@/app/data/editor.ts";
import type { CommitKind } from "@/app/state/types.ts";
import { requireGateOpen } from "@/app/state/WorkspaceInteractionGate.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

/**
 * Editor-side push bridge into the WorkingFilesStore.
 *
 * On every Lexical update, decide whether the commit should be published and,
 * if so, classify it via `CommitKind` based on the update's tags. This is the
 * inversion of `saveCurrentDirtyLexical` — instead of consumers pulling the
 * latest editor state on demand, the editor pushes here once per commit and
 * consumers read from the store.
 *
 * Skip rules:
 *  - `programaticIgnore` tag — write-backs *from* the store via
 *    `setEditorContent`; republishing would round-trip our own output.
 *  - `HISTORY_MERGE_TAG` (unless structural-fixup) — pure history-replay glue.
 *
 * Selection-only updates (no dirty elements/leaves) DO publish, as a
 * `selectionOnly` patch with `kind: "metadataOnly"` and
 * `dirtyTextContent: false`. Cost is bounded (no `toJSON`, no token recompute);
 * future selection-aware consumers (synced scrolling, action palette context)
 * pick them up by filter.
 *
 * Dev-only commit logger uses the store's `changes: Stream<CommitEvent>` to
 * surface every commit on the console; tree-shaken from prod.
 */
export function WorkingFilesBridgePlugin() {
    const [editor] = useLexicalComposerContext();
    const { workingFilesStore, project, mainEditorDeferred, interactionGate } =
        useWorkspaceContext();

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
                          // eslint-disable-next-line no-console
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
            ({ editorState, dirtyElements, dirtyLeaves, tags }) => {
                if (tags.has(EDITOR_TAGS_USED.programaticIgnore)) return;
                // Don't push commits into the store while the workspace is
                // gated (save in flight or a recovery decision pending).
                if (!requireGateOpen(interactionGate.get())) return;
                // structuralFixup classifies before HISTORY_MERGE_TAG so the
                // structure pipeline's writebacks still publish — the
                // historyMerge tag is also present to keep them out of undo.
                const isStructuralFix = tags.has(
                    EDITOR_TAGS_USED.programmaticStructuralFix,
                );
                if (!isStructuralFix && tags.has(HISTORY_MERGE_TAG)) return;

                const bookCode = project.pickedFile.bookCode;
                const chapter =
                    project.pickedChapter?.chapterNumber ??
                    project.currentChapter;

                const dirty = dirtyElements.size > 0 || dirtyLeaves.size > 0;
                if (!dirty) {
                    workingFilesStore.commit(
                        { kind: "selectionOnly", bookCode, chapter },
                        {
                            kind: "metadataOnly",
                            scope: { bookCode, chapter },
                            dirtyTextContent: false,
                        },
                    );
                    return;
                }

                const kind = getCommitKind(tags);
                const lexicalState = editorState.toJSON();

                workingFilesStore.commit(
                    { kind: "chapter", bookCode, chapter, lexicalState },
                    {
                        kind,
                        scope: { bookCode, chapter },
                        dirtyTextContent: true,
                    },
                );
            },
        );

        return () => {
            unregisterUpdate();
            if (loggerFiber) Effect.runFork(Fiber.interrupt(loggerFiber));
        };
    }, [editor, workingFilesStore, project, interactionGate]);

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
