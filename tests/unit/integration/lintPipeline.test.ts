// lintPipeline.test.ts
//
// **CANONICAL** store-seam integration test. Future store-seam tests in
// `tests/unit/integration/` are modeled on this shape:
//
//   1. Construct real stores (`WorkingFilesStore`, `LintStore`). No mocks
//      for state; the store *is* the system under test.
//   2. Stub only the IO boundary (`IUsfmOnionService.lintExisting`).
//      Everything between the commit and the IO call is the production
//      pipeline.
//   3. Drive behavior through `WorkingFilesStore.commit(...)`. That is the
//      one public surface the pipeline reads.
//   4. Fork the pipeline with `Effect.forkChild` inside a TestClock-
//      scoped program. The forked fiber inherits TestClock from the
//      surrounding scope, so `Stream.debounce`'s sleep uses the test
//      clock.
//   5. Drive time deterministically with `passTime(ms)` from
//      `effectTestTime.ts`. See that module for why explicit yields
//      around `TestClock.adjust` are needed (the
//      `Effect.runFork`-published commits land on a different runtime
//      from the subscriber).
//   6. Assert on observable output: spy on
//      `LintStore.commitBookLintResults`. Don't read the lint store's
//      internal map — that would couple the test to `parseSid` and
//      chapter-key conventions that are not the pipeline's contract.
//
// Filter policy (which `CommitKind`s are lint-relevant) is asserted
// exhaustively at the predicate level in `commitFilters.test.ts`
// (section 3). This file asserts one negative case (`metadataOnly`) to
// keep the pipeline-integration link honest and otherwise leans on the
// predicate test for coverage.

import { Effect, type Scope } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it, vi } from "vitest";
import { makeLintPipeline } from "@/app/domain/editor/pipelines/lintPipeline.ts";
import { LintStore } from "@/app/state/LintStore.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import { drainYields, passTime } from "@tests/helpers/effectTestTime.ts";
import {
    makeBook,
    makeChapterPatch,
    makeCommitMeta,
} from "@tests/helpers/workspaceFixtures.ts";

const DEBOUNCE_MS = 100;

function runWithTestClock<E>(
    program: Effect.Effect<void, E, Scope.Scope>,
): Promise<void> {
    return Effect.runPromise(
        Effect.scoped(program).pipe(Effect.provide(TestClock.layer())),
    );
}

function stubService(impl?: IUsfmOnionService["lintExisting"]) {
    const lintExisting = vi
        .fn(impl ?? (async () => [] as LintIssue[]))
        .mockName("lintExisting");
    return {
        lintExisting,
        service: { lintExisting } as unknown as IUsfmOnionService,
    };
}

function userEdit(bookCode: string, chapter: number, text: string) {
    return [
        makeChapterPatch({ bookCode, chapter, text }),
        makeCommitMeta({ kind: "userEdit", bookCode, chapter }),
    ] as const;
}

describe("lintPipeline (integration)", () => {
    it("coalesces a typing burst into one lint pass after the debounce window", async () => {
        const { lintExisting, service } = stubService();
        const wf = new WorkingFilesStore([makeBook({ bookCode: "GEN" })]);
        const lintStore = new LintStore({});
        const writeSpy = vi.spyOn(lintStore, "commitBookLintResults");

        await runWithTestClock(
            Effect.gen(function* () {
                yield* Effect.forkChild(
                    makeLintPipeline({
                        workingFilesStore: wf,
                        lintStore,
                        usfmOnionService: service,
                        debounceMs: DEBOUNCE_MS,
                    }),
                );
                yield* drainYields(); // let pipeline subscribe before publish

                wf.commit(...userEdit("GEN", 1, "a"));
                wf.commit(...userEdit("GEN", 1, "ab"));
                wf.commit(...userEdit("GEN", 1, "abc"));

                yield* passTime(DEBOUNCE_MS - 10);
                expect(lintExisting).not.toHaveBeenCalled();

                yield* passTime(50);
                expect(lintExisting).toHaveBeenCalledTimes(1);
                expect(writeSpy).toHaveBeenCalledTimes(1);
            }),
        );
    });

    it("ignores metadataOnly commits — cursor moves don't drive lint", async () => {
        const { lintExisting, service } = stubService();
        const wf = new WorkingFilesStore([makeBook({ bookCode: "GEN" })]);
        const lintStore = new LintStore({});
        const writeSpy = vi.spyOn(lintStore, "commitBookLintResults");

        await runWithTestClock(
            Effect.gen(function* () {
                yield* Effect.forkChild(
                    makeLintPipeline({
                        workingFilesStore: wf,
                        lintStore,
                        usfmOnionService: service,
                        debounceMs: DEBOUNCE_MS,
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

                yield* passTime(DEBOUNCE_MS * 2);
                expect(lintExisting).not.toHaveBeenCalled();
                expect(writeSpy).not.toHaveBeenCalled();
            }),
        );
    });

    it("re-lints on an import commit (recovery Discard shape) but NOT on a replay undo commit", async () => {
        // Recovery Discard commits kind:"import" precisely so lint refreshes;
        // had it stayed kind:"undo", lint would filter it (replay is re-linted
        // via the post-undo/redo listener, which runTransaction does not fire),
        // leaving recovered-content diagnostics stale.
        const { lintExisting, service } = stubService();
        const wf = new WorkingFilesStore([makeBook({ bookCode: "GEN" })]);
        const lintStore = new LintStore({});

        await runWithTestClock(
            Effect.gen(function* () {
                yield* Effect.forkChild(
                    makeLintPipeline({
                        workingFilesStore: wf,
                        lintStore,
                        usfmOnionService: service,
                        debounceMs: DEBOUNCE_MS,
                    }),
                );
                yield* drainYields();

                // Replay-shaped commit: filtered out (not lint-relevant).
                wf.commit(
                    makeChapterPatch({ bookCode: "GEN", chapter: 1, text: "x" }),
                    makeCommitMeta({ kind: "undo", bookCode: "GEN", chapter: 1 }),
                );
                yield* passTime(DEBOUNCE_MS + 20);
                expect(lintExisting).not.toHaveBeenCalled();

                // Discard-shaped commit: ordinary content mutation → re-lints.
                wf.commit(
                    makeChapterPatch({ bookCode: "GEN", chapter: 1, text: "y" }),
                    makeCommitMeta({
                        kind: "import",
                        bookCode: "GEN",
                        chapter: 1,
                    }),
                );
                yield* passTime(DEBOUNCE_MS + 20);
                expect(lintExisting).toHaveBeenCalledTimes(1);
            }),
        );
    });

    it("switchMap interrupts in-flight lint when a newer commit lands", async () => {
        // First call hangs until we release it; second resolves immediately.
        // The pipeline's `switchMap` should interrupt the first fiber when
        // the second debounce fires, so the first call's downstream
        // `commitBookLintResults` is never reached.
        let releaseFirst!: (issues: LintIssue[]) => void;
        const firstPending = new Promise<LintIssue[]>((resolve) => {
            releaseFirst = resolve;
        });
        const lintExisting = vi
            .fn<IUsfmOnionService["lintExisting"]>()
            .mockReturnValueOnce(firstPending)
            .mockResolvedValue([]);
        const service = { lintExisting } as unknown as IUsfmOnionService;

        const wf = new WorkingFilesStore([makeBook({ bookCode: "GEN" })]);
        const lintStore = new LintStore({});
        const writeSpy = vi.spyOn(lintStore, "commitBookLintResults");

        await runWithTestClock(
            Effect.gen(function* () {
                yield* Effect.forkChild(
                    makeLintPipeline({
                        workingFilesStore: wf,
                        lintStore,
                        usfmOnionService: service,
                        debounceMs: DEBOUNCE_MS,
                    }),
                );
                yield* drainYields();

                wf.commit(...userEdit("GEN", 1, "first"));
                yield* passTime(DEBOUNCE_MS + 20);
                // First lint pass has started and is awaiting the promise.
                expect(lintExisting).toHaveBeenCalledTimes(1);
                expect(writeSpy).not.toHaveBeenCalled();

                wf.commit(...userEdit("GEN", 1, "second"));
                yield* passTime(DEBOUNCE_MS + 20);
                // switchMap has cancelled the first fiber and started the
                // second; second's mockResolvedValue([]) writes immediately.
                expect(lintExisting).toHaveBeenCalledTimes(2);
                expect(writeSpy).toHaveBeenCalledTimes(1);

                // Releasing the first call now is a no-op — its fiber was
                // interrupted before it could reach `commitBookLintResults`.
                releaseFirst([]);
                yield* drainYields();
                expect(writeSpy).toHaveBeenCalledTimes(1);
            }),
        );
    });
});
