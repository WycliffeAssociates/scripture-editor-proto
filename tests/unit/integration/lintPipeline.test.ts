// lintPipeline.test.ts
//
// **CANONICAL** store-seam integration test. Future store-seam tests in
// `tests/unit/integration/` are modeled on this shape:
//
//   1. Construct real stores (`WorkingFilesStore`, `LintStore`). No mocks
//      for state; the store *is* the system under test.
//   2. Stub only the IO boundary (`IUsfmOnionService.lintScope` — the
//      batched call the pipeline makes via `relintBookFiles`).
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

function stubService(impl?: IUsfmOnionService["lintScope"]) {
    const lintScope = vi
        .fn(
            impl ??
                (async (scope: Parameters<IUsfmOnionService["lintScope"]>[0]) =>
                    scope.map(() => [] as LintIssue[])),
        )
        .mockName("lintScope");
    return {
        lintScope,
        service: { lintScope } as unknown as IUsfmOnionService,
    };
}

function userEdit(bookCode: string, chapter: number, text: string) {
    return {
        patch: makeChapterPatch({ bookCode, chapter, text }),
        meta: makeCommitMeta({ kind: "userEdit", bookCode, chapter }),
    };
}

describe("lintPipeline (integration)", () => {
    it("coalesces a typing burst into one lint pass after the debounce window", async () => {
        const { lintScope, service } = stubService();
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

                wf.commit(userEdit("GEN", 1, "a"));
                wf.commit(userEdit("GEN", 1, "ab"));
                wf.commit(userEdit("GEN", 1, "abc"));

                yield* passTime(DEBOUNCE_MS - 10);
                expect(lintScope).not.toHaveBeenCalled();

                yield* passTime(50);
                expect(lintScope).toHaveBeenCalledTimes(1);
                expect(writeSpy).toHaveBeenCalledTimes(1);
            }),
        );
    });

    it("ignores metadataOnly commits — cursor moves don't drive lint", async () => {
        const { lintScope, service } = stubService();
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

                wf.commit({
                    patch: { kind: "selectionOnly", bookCode: "GEN", chapter: 1 },
                    meta: makeCommitMeta({
                        kind: "metadataOnly",
                        bookCode: "GEN",
                        chapter: 1,
                        dirtyTextContent: false,
                    }),
                });

                yield* passTime(DEBOUNCE_MS * 2);
                expect(lintScope).not.toHaveBeenCalled();
                expect(writeSpy).not.toHaveBeenCalled();
            }),
        );
    });

    it("re-lints on undo and import commits — replay carries precise chapter scope", async () => {
        const { lintScope, service } = stubService();
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

                wf.commit({
                    patch: makeChapterPatch({ bookCode: "GEN", chapter: 1, text: "x" }),
                    meta: makeCommitMeta({ kind: "undo", bookCode: "GEN", chapter: 1 }),
                });
                yield* passTime(DEBOUNCE_MS + 20);
                expect(lintScope).toHaveBeenCalledTimes(1);

                wf.commit({
                    patch: makeChapterPatch({ bookCode: "GEN", chapter: 1, text: "y" }),
                    meta: makeCommitMeta({
                        kind: "import",
                        bookCode: "GEN",
                        chapter: 1,
                    }),
                });
                yield* passTime(DEBOUNCE_MS + 20);
                expect(lintScope).toHaveBeenCalledTimes(2);
            }),
        );
    });

    it("FOLDS scopes across the debounce window — commits to two books drain as ONE pass covering both", async () => {
        const { lintScope, service } = stubService();
        const wf = new WorkingFilesStore([
            makeBook({ bookCode: "GEN" }),
            makeBook({ bookCode: "EXO" }),
        ]);
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

                // Two different books inside one debounce window. Keep-latest
                // would drop GEN; the fold must union them.
                wf.commit(userEdit("GEN", 1, "a"));
                yield* passTime(DEBOUNCE_MS / 2);
                wf.commit(userEdit("EXO", 1, "b"));

                yield* passTime(DEBOUNCE_MS + 20);
                expect(lintScope).toHaveBeenCalledTimes(1);
                // One service call, one batch per book.
                expect(lintScope.mock.calls[0]?.[0]).toHaveLength(2);
                expect(writeSpy).toHaveBeenCalledTimes(1);
                expect(
                    Object.keys(writeSpy.mock.calls[0]?.[0] ?? {}).sort(),
                ).toEqual(["EXO", "GEN"]);
            }),
        );
    });

    it("escalates to ALL books when a project-scope commit lands in the window", async () => {
        const { lintScope, service } = stubService();
        const wf = new WorkingFilesStore([
            makeBook({ bookCode: "GEN" }),
            makeBook({ bookCode: "EXO" }),
            makeBook({ bookCode: "LEV" }),
        ]);
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

                wf.commit(userEdit("GEN", 1, "a"));
                wf.commit({
                    patch: { kind: "bulk", files: wf.read() },
                    meta: {
                        kind: "import",
                        scope: { project: true },
                        dirtyTextContent: true,
                    },
                });

                yield* passTime(DEBOUNCE_MS + 20);
                expect(lintScope).toHaveBeenCalledTimes(1);
                expect(lintScope.mock.calls[0]?.[0]).toHaveLength(3);
                expect(
                    Object.keys(writeSpy.mock.calls[0]?.[0] ?? {}).sort(),
                ).toEqual(["EXO", "GEN", "LEV"]);
            }),
        );
    });

    it("does NOT lose a cancelled pass's scope — the next pass covers old ∪ new", async () => {
        // Pass 1 (GEN) hangs; a commit to EXO interrupts it via switchMap.
        // The fold must restore GEN into the accumulator so pass 2 covers
        // BOTH books — keep-latest semantics would lint only EXO and leave
        // GEN's diagnostics stale forever.
        let releaseFirst!: (issues: LintIssue[][]) => void;
        const firstPending = new Promise<LintIssue[][]>((resolve) => {
            releaseFirst = resolve;
        });
        const lintScope = vi
            .fn<IUsfmOnionService["lintScope"]>()
            .mockReturnValueOnce(firstPending)
            .mockImplementation(async (scope) => scope.map(() => []));
        const service = { lintScope } as unknown as IUsfmOnionService;

        const wf = new WorkingFilesStore([
            makeBook({ bookCode: "GEN" }),
            makeBook({ bookCode: "EXO" }),
        ]);
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

                wf.commit(userEdit("GEN", 1, "first"));
                yield* passTime(DEBOUNCE_MS + 20);
                // Pass 1 (GEN only) has started and is hanging.
                expect(lintScope).toHaveBeenCalledTimes(1);
                expect(lintScope.mock.calls[0]?.[0]).toHaveLength(1);

                wf.commit(userEdit("EXO", 1, "second"));
                yield* passTime(DEBOUNCE_MS + 20);
                // Pass 1 interrupted; pass 2 must cover GEN ∪ EXO.
                expect(lintScope).toHaveBeenCalledTimes(2);
                expect(lintScope.mock.calls[1]?.[0]).toHaveLength(2);
                expect(writeSpy).toHaveBeenCalledTimes(1);
                expect(
                    Object.keys(writeSpy.mock.calls[0]?.[0] ?? {}).sort(),
                ).toEqual(["EXO", "GEN"]);

                // Releasing the cancelled pass is a no-op.
                releaseFirst([[]]);
                yield* drainYields();
                expect(writeSpy).toHaveBeenCalledTimes(1);
            }),
        );
    });

    it("switchMap interrupts in-flight lint when a newer commit lands", async () => {
        // First call hangs until we release it; second resolves immediately.
        // The pipeline's `switchMap` should interrupt the first fiber when
        // the second debounce fires, so the first call's downstream
        // `commitBookLintResults` is never reached.
        let releaseFirst!: (issues: LintIssue[][]) => void;
        const firstPending = new Promise<LintIssue[][]>((resolve) => {
            releaseFirst = resolve;
        });
        const lintScope = vi
            .fn<IUsfmOnionService["lintScope"]>()
            .mockReturnValueOnce(firstPending)
            .mockResolvedValue([[]]);
        const service = { lintScope } as unknown as IUsfmOnionService;

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

                wf.commit(userEdit("GEN", 1, "first"));
                yield* passTime(DEBOUNCE_MS + 20);
                // First lint pass has started and is awaiting the promise.
                expect(lintScope).toHaveBeenCalledTimes(1);
                expect(writeSpy).not.toHaveBeenCalled();

                wf.commit(userEdit("GEN", 1, "second"));
                yield* passTime(DEBOUNCE_MS + 20);
                // switchMap has cancelled the first fiber and started the
                // second; second's mockResolvedValue([]) writes immediately.
                expect(lintScope).toHaveBeenCalledTimes(2);
                expect(writeSpy).toHaveBeenCalledTimes(1);

                // Releasing the first call now is a no-op — its fiber was
                // interrupted before it could reach `commitBookLintResults`.
                releaseFirst([[]]);
                yield* drainYields();
                expect(writeSpy).toHaveBeenCalledTimes(1);
            }),
        );
    });
});
