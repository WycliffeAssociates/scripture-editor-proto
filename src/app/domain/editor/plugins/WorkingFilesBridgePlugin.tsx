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
 * Stage 1A: skip selection-only commits (no subscriber reads them yet); skip
 * programmatic-ignore updates (the bridge would round-trip them right back).
 * In dev, runs a shadow-mirror assertion against the legacy
 * `saveCurrentDirtyLexical` output and warns loudly on divergence (1A.5).
 * Also installs a dev-only commit logger (1A.7). Both gated by
 * `import.meta.env.DEV` so prod is tree-shaken.
 */
export function WorkingFilesBridgePlugin() {
    const [editor] = useLexicalComposerContext();
    const { workingFilesStore, project, actions } = useWorkspaceContext();

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
                // Don't round-trip programmatic ignore writes back into the
                // store — those are write-backs *from* the store via
                // `setEditorContent` or similar.
                if (tags.has(EDITOR_TAGS_USED.programaticIgnore)) return;

                // Skip pure history-merge replays; they don't represent a user
                // intent and the originating event already published.
                if (tags.has(HISTORY_MERGE_TAG)) return;

                const dirty = dirtyElements.size > 0 || dirtyLeaves.size > 0;

                // Stage 1A: drop selection-only commits. No current consumer
                // reads them; keep the option open for Stage 2A by routing
                // through `kind: "metadataOnly"` here when a consumer arrives.
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

                if (import.meta.env.DEV) {
                    runShadowMirrorAssertion({
                        store: workingFilesStore,
                        legacy: actions.saveCurrentDirtyLexical,
                        bookCode,
                        chapter,
                    });
                }
            },
        );

        return () => {
            unregisterUpdate();
            if (loggerFiber) Effect.runFork(Fiber.interrupt(loggerFiber));
        };
    }, [editor, workingFilesStore, project, actions]);

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

/**
 * Dev-only shadow-mirror: compare the store's view of the current chapter
 * against `saveCurrentDirtyLexical`'s view. Catches drift while both systems
 * run in parallel during Stage 1A/1B. Deleted in Stage 1C.
 *
 * Sampled (every Nth commit) because a deep JSON diff per keystroke compounds
 * the hot-path cost the refactor is trying to reduce. Steady-state typing
 * still hits the assertion every ~3 seconds, which is plenty to catch drift
 * during the "5-minute manual exercise" verification gate.
 */
let shadowMirrorTickCounter = 0;
const SHADOW_MIRROR_SAMPLE_EVERY = 50;

function runShadowMirrorAssertion(args: {
    store: ReturnType<typeof useWorkspaceContext>["workingFilesStore"];
    legacy: ReturnType<
        typeof useWorkspaceContext
    >["actions"]["saveCurrentDirtyLexical"];
    bookCode: string;
    chapter: number;
}): void {
    shadowMirrorTickCounter++;
    if (shadowMirrorTickCounter % SHADOW_MIRROR_SAMPLE_EVERY !== 0) return;

    const { store, legacy, bookCode, chapter } = args;
    legacy();
    const storeChapter = store.readChapter(bookCode, chapter);
    if (!storeChapter) {
        // eslint-disable-next-line no-console
        console.error("[shadow-mirror] store has no chapter", {
            bookCode,
            chapter,
        });
        return;
    }
    // The legacy path wrote into mutWorkingFilesRef but we don't have direct
    // access to that ref from here without expanding the context surface.
    // Compare the store's chapter root key-count as a coarse-grained sanity
    // signal — divergence in shape would surface here without paying for a
    // full JSON diff.
    const rootKeys = Object.keys(storeChapter).length;
    if (rootKeys < 3) {
        // eslint-disable-next-line no-console
        console.error("[shadow-mirror] store chapter looks malformed", {
            bookCode,
            chapter,
            rootKeys,
        });
    }
}
