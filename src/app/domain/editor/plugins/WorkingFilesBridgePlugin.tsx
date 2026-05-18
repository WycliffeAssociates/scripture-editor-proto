import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { Effect, Fiber, Stream } from "effect";
import { HISTORIC_TAG, HISTORY_MERGE_TAG } from "lexical";
import { useEffect } from "react";
import { EDITOR_TAGS_USED } from "@/app/data/editor.ts";
import type { CommitKind } from "@/app/state/types.ts";
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
 *    `setEditorContent`; if we republished them the bridge would round-trip
 *    its own output.
 *  - `HISTORY_MERGE_TAG` — pure history-replay glue; the originating event
 *    already published.
 *  - Selection-only commits (dirty leaves/elements both empty) — no current
 *    consumer reads them. When a selection-aware consumer arrives, route
 *    through `kind: "metadataOnly"` here instead of dropping.
 *
 * Dev-only commit logger uses the store's `changes: Stream<CommitEvent>` to
 * surface every commit on the console; tree-shaken from prod.
 */
export function WorkingFilesBridgePlugin() {
    const [editor] = useLexicalComposerContext();
    const { workingFilesStore, project } = useWorkspaceContext();

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
                if (tags.has(HISTORY_MERGE_TAG)) return;

                const dirty = dirtyElements.size > 0 || dirtyLeaves.size > 0;
                if (!dirty) return;

                const bookCode = project.pickedFile.bookCode;
                const chapter =
                    project.pickedChapter?.chapterNumber ??
                    project.currentChapter;
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
    }, [editor, workingFilesStore, project]);

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
    if (tags.has(HISTORIC_TAG)) return "undo";
    if (tags.has(EDITOR_TAGS_USED.programmaticDoRunChanges))
        return "programmaticFix";
    return "userEdit";
}
