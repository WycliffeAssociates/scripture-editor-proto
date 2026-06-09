// recoveredConflictTrackerSubscriber.test.ts
//
// Integration test: the subscriber observes commits on WorkingFilesStore and
// clears tracker entries whose chapters are now clean. Pure post-state
// inspection — a chapter that stays dirty (e.g. a partial diff-block revert)
// keeps its tracker entry.

import { Effect, type Scope } from "effect";
import { describe, expect, it } from "vitest";
import { makeRecoveredConflictTrackerSubscriber } from "@/app/domain/editor/pipelines/recoveredConflictTrackerSubscriber.ts";
import { RecoveredConflictTracker } from "@/app/state/RecoveredConflictTracker.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import { drainYields } from "@tests/helpers/effectTestTime.ts";
import { makeBook, makeChapter, makeCommitMeta } from "@tests/helpers/workspaceFixtures.ts";

function run<E>(program: Effect.Effect<void, E, Scope.Scope>): Promise<void> {
    return Effect.runPromise(Effect.scoped(program));
}

function dirtyBook(bookCode: string) {
    return makeBook({
        bookCode,
        chapters: [
            makeChapter({
                bookCode,
                chapterNumber: 5,
                text: "edited",
                sourceText: "original",
            }),
        ],
    });
}

describe("recoveredConflictTrackerSubscriber (integration)", () => {
    it("clears a tracked chapter once it is observed clean", async () => {
        const wf = new WorkingFilesStore([dirtyBook("GEN")]);
        const tracker = new RecoveredConflictTracker();
        tracker.add("GEN", 5);

        await run(
            Effect.gen(function* () {
                yield* Effect.forkChild(
                    makeRecoveredConflictTrackerSubscriber({
                        workingFilesStore: wf,
                        tracker,
                    }),
                );
                yield* drainYields();

                wf.commit({
                    patch: { kind: "metadata", bookCode: "GEN", chapter: 5, dirty: false },
                    meta: makeCommitMeta({
                        kind: "metadataOnly",
                        bookCode: "GEN",
                        chapter: 5,
                        dirtyTextContent: false,
                    }),
                });
                yield* drainYields();

                expect(tracker.has("GEN", 5)).toBe(false);
            }),
        );
    });

    it("keeps a tracked chapter that is still dirty (partial revert)", async () => {
        const wf = new WorkingFilesStore([dirtyBook("GEN")]);
        const tracker = new RecoveredConflictTracker();
        tracker.add("GEN", 5);

        await run(
            Effect.gen(function* () {
                yield* Effect.forkChild(
                    makeRecoveredConflictTrackerSubscriber({
                        workingFilesStore: wf,
                        tracker,
                    }),
                );
                yield* drainYields();

                // A commit that leaves the chapter dirty (still differs).
                wf.commit({
                    patch: { kind: "metadata", bookCode: "GEN", chapter: 5, dirty: true },
                    meta: makeCommitMeta({
                        kind: "metadataOnly",
                        bookCode: "GEN",
                        chapter: 5,
                        dirtyTextContent: false,
                    }),
                });
                yield* drainYields();

                expect(tracker.has("GEN", 5)).toBe(true);
            }),
        );
    });
});
