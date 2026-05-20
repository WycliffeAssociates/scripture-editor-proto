// overlayTickPipeline.test.ts
//
// Store-seam integration test for `makeOverlayTickPipeline`. Same
// canonical pattern as `lintPipeline.test.ts`; this pipeline uses a
// 16 ms debounce (one tick per animation frame) so `TestClock`
// drives time.
//
// The behavior under test: text-changing commits bump
// `LayoutTickStore` after the debounce window; selection-only commits
// do not (an early filter — added precisely so cursor movement
// doesn't churn the overlay layer). Burst behavior coalesces into
// one bump per quiet window.

import { Effect, type Scope } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it, vi } from "vitest";
import { makeOverlayTickPipeline } from "@/app/domain/editor/pipelines/overlayTickPipeline.ts";
import { LayoutTickStore } from "@/app/state/LayoutTickStore.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import { drainYields, passTime } from "@tests/helpers/effectTestTime.ts";
import {
    makeBook,
    makeChapterPatch,
    makeCommitMeta,
} from "@tests/helpers/workspaceFixtures.ts";

const DEBOUNCE_MS = 16;

function runWithTestClock<E>(
    program: Effect.Effect<void, E, Scope.Scope>,
): Promise<void> {
    return Effect.runPromise(
        Effect.scoped(program).pipe(Effect.provide(TestClock.layer())),
    );
}

function userEdit(bookCode: string, chapter: number, text: string) {
    return [
        makeChapterPatch({ bookCode, chapter, text }),
        makeCommitMeta({ kind: "userEdit", bookCode, chapter }),
    ] as const;
}

describe("overlayTickPipeline (integration)", () => {
    it("bumps the tick store after a userEdit commit and the debounce window", async () => {
        const wf = new WorkingFilesStore([makeBook({ bookCode: "GEN" })]);
        const tick = new LayoutTickStore();
        const bumpSpy = vi.spyOn(tick, "bump");

        await runWithTestClock(
            Effect.gen(function* () {
                yield* Effect.forkChild(
                    makeOverlayTickPipeline({
                        workingFilesStore: wf,
                        layoutTickStore: tick,
                    }),
                );
                yield* drainYields();

                wf.commit(...userEdit("GEN", 1, "edit"));

                yield* passTime(DEBOUNCE_MS - 4);
                expect(bumpSpy).not.toHaveBeenCalled();

                yield* passTime(10);
                expect(bumpSpy).toHaveBeenCalledTimes(1);
                expect(tick.getSnapshot()).toBe(1);
            }),
        );
    });

    it("does not bump on selectionOnly / metadataOnly commits (cursor moves don't drive layout)", async () => {
        const wf = new WorkingFilesStore([makeBook({ bookCode: "GEN" })]);
        const tick = new LayoutTickStore();
        const bumpSpy = vi.spyOn(tick, "bump");

        await runWithTestClock(
            Effect.gen(function* () {
                yield* Effect.forkChild(
                    makeOverlayTickPipeline({
                        workingFilesStore: wf,
                        layoutTickStore: tick,
                    }),
                );
                yield* drainYields();

                wf.commit(
                    { kind: "selectionOnly", bookCode: "GEN", chapter: 1 },
                    makeCommitMeta({
                        kind: "metadataOnly",
                        bookCode: "GEN",
                        chapter: 1,
                        dirtyTextContent: false,
                    }),
                );

                yield* passTime(DEBOUNCE_MS * 4);
                expect(bumpSpy).not.toHaveBeenCalled();
                expect(tick.getSnapshot()).toBe(0);
            }),
        );
    });

    it("coalesces a burst of edits into one bump per quiet window", async () => {
        const wf = new WorkingFilesStore([makeBook({ bookCode: "GEN" })]);
        const tick = new LayoutTickStore();
        const bumpSpy = vi.spyOn(tick, "bump");

        await runWithTestClock(
            Effect.gen(function* () {
                yield* Effect.forkChild(
                    makeOverlayTickPipeline({
                        workingFilesStore: wf,
                        layoutTickStore: tick,
                    }),
                );
                yield* drainYields();

                wf.commit(...userEdit("GEN", 1, "a"));
                wf.commit(...userEdit("GEN", 1, "ab"));
                wf.commit(...userEdit("GEN", 1, "abc"));
                yield* passTime(DEBOUNCE_MS + 4);
                expect(bumpSpy).toHaveBeenCalledTimes(1);
            }),
        );
    });
});
