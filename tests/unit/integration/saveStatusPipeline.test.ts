// saveStatusPipeline.test.ts
//
// Store-seam integration test for `makeSaveStatusPipeline`. Follows the
// canonical pattern documented in `lintPipeline.test.ts`, minus the
// `TestClock` machinery: this pipeline has no debounce, so the only
// fiber-coordination need is `drainYields` between sync commits and
// the subscriber observing the publish.
//
// Filter policy (which `CommitKind`s drive this pipeline) is asserted
// exhaustively in `tests/unit/commitFilters.test.ts`. This file
// covers the wiring: the pipeline reads the snapshot's `dirty` flags
// and routes to `setDirty` / `setCleanFromCommit` accordingly.

import { Effect, type Scope } from "effect";
import { describe, expect, it, vi } from "vitest";
import { makeSaveStatusPipeline } from "@/app/domain/editor/pipelines/saveStatusPipeline.ts";
import { SaveStatusStore } from "@/app/state/SaveStatusStore.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import { drainYields } from "@tests/helpers/effectTestTime.ts";
import {
    makeBook,
    makeChapter,
    makeCommitMeta,
} from "@tests/helpers/workspaceFixtures.ts";

function runScoped<E>(
    program: Effect.Effect<void, E, Scope.Scope>,
): Promise<void> {
    return Effect.runPromise(Effect.scoped(program));
}

const cleanBookSeed = () => makeBook({ bookCode: "GEN" });
const dirtyBookSeed = () =>
    makeBook({ bookCode: "GEN", chapters: [makeChapter({ dirty: true })] });

describe("saveStatusPipeline (integration)", () => {
    it("flips clean → dirty on a userEdit commit that leaves chapters dirty", async () => {
        const wf = new WorkingFilesStore([cleanBookSeed()]);
        const store = new SaveStatusStore();

        await runScoped(
            Effect.gen(function* () {
                yield* Effect.forkChild(
                    makeSaveStatusPipeline({
                        workingFilesStore: wf,
                        saveStatusStore: store,
                    }),
                );
                yield* drainYields();
                expect(store.read().kind).toBe("clean");

                // Bulk-commit a dirty snapshot. Using bulk (not a chapter
                // patch) makes the dirty flag a fixture-controlled value
                // rather than a function of `lexicalToTokens` output.
                wf.commit({
                    patch: { kind: "bulk", files: [dirtyBookSeed()] },
                    meta: makeCommitMeta({
                        kind: "userEdit",
                        bookCode: "GEN",
                        chapter: 1,
                    }),
                });
                yield* drainYields();
                expect(store.read().kind).toBe("dirty");
            }),
        );
    });

    it("flips dirty → clean when a commit lands with all chapters clean (revert)", async () => {
        const wf = new WorkingFilesStore([dirtyBookSeed()]);
        const store = new SaveStatusStore({ kind: "dirty" });

        await runScoped(
            Effect.gen(function* () {
                yield* Effect.forkChild(
                    makeSaveStatusPipeline({
                        workingFilesStore: wf,
                        saveStatusStore: store,
                    }),
                );
                yield* drainYields();

                wf.commit({
                    patch: { kind: "bulk", files: [cleanBookSeed()] },
                    meta: makeCommitMeta({
                        kind: "userEdit",
                        bookCode: "GEN",
                        chapter: 1,
                    }),
                });
                yield* drainYields();
                expect(store.read().kind).toBe("clean");
            }),
        );
    });

    it("does not transition during an in-flight save (setCleanFromCommit defers to saving)", async () => {
        // Captures the docstring on `setCleanFromCommit`: a clean-from-
        // commit observation must not race a save in flight. The pipeline
        // calls the setter; the setter no-ops while `saving`.
        const wf = new WorkingFilesStore([dirtyBookSeed()]);
        const store = new SaveStatusStore({ kind: "saving" });

        await runScoped(
            Effect.gen(function* () {
                yield* Effect.forkChild(
                    makeSaveStatusPipeline({
                        workingFilesStore: wf,
                        saveStatusStore: store,
                    }),
                );
                yield* drainYields();

                wf.commit({
                    patch: { kind: "bulk", files: [cleanBookSeed()] },
                    meta: makeCommitMeta({
                        kind: "userEdit",
                        bookCode: "GEN",
                        chapter: 1,
                    }),
                });
                yield* drainYields();
                expect(store.read().kind).toBe("saving");
            }),
        );
    });

    it("ignores metadataOnly commits (filter)", async () => {
        const wf = new WorkingFilesStore([dirtyBookSeed()]);
        const store = new SaveStatusStore();
        const setDirtySpy = vi.spyOn(store, "setDirty");
        const setCleanSpy = vi.spyOn(store, "setCleanFromCommit");

        await runScoped(
            Effect.gen(function* () {
                yield* Effect.forkChild(
                    makeSaveStatusPipeline({
                        workingFilesStore: wf,
                        saveStatusStore: store,
                    }),
                );
                yield* drainYields();

                wf.commit({
                    patch: { kind: "selectionOnly", bookCode: "GEN", chapter: 1 },
                    meta: makeCommitMeta({
                        kind: "metadataOnly",
                        bookCode: "GEN",
                        chapter: 1,
                        dirtyTextContent: false,
                    }),
                });
                yield* drainYields();
                expect(setDirtySpy).not.toHaveBeenCalled();
                expect(setCleanSpy).not.toHaveBeenCalled();
            }),
        );
    });
});
