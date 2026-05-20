// searchRerunPipeline.test.ts
//
// Two-part test for the search-rerun policy + pipeline.
//
//   1. **Predicate matrix.** `isSearchRerunRelevant(kind, dirty)` for
//      every `CommitKind` × `dirtyTextContent` combination. Flipping a
//      polarity in the policy fails exactly one row with a readable
//      name — same shape as `commitFilters.test.ts`.
//
//   2. **Pipeline integration.** Drives the *real* pipeline against a
//      real `WorkingFilesStore` (through the canonical
//      `effectTestTime` helpers) and asserts that the `rerunSearch`
//      callback fires exactly for the policy-relevant commits, with
//      the correct term, after the debounce window, and not at all
//      when the term is empty.
//
// The user-visible contract is "undo / redo / programmaticFix /
// import → search auto-restores"; this pipeline is the *only*
// producer of that auto-rerun (the replace path runs its own scoped
// rerun synchronously and the bridge classifies its commit as
// `userEdit`, which the predicate excludes).

import { Effect, Fiber, type Scope } from "effect";
import { TestClock } from "effect/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    isSearchRerunRelevant,
    makeSearchRerunPipeline,
} from "@/app/domain/editor/pipelines/searchRerunPipeline.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { CommitEvent, CommitKind } from "@/app/state/types.ts";
import { drainYields, passTime } from "@tests/helpers/effectTestTime.ts";
import {
    makeBook,
    makeChapterPatch,
    makeCommitMeta,
} from "@tests/helpers/workspaceFixtures.ts";

// ----- Predicate matrix --------------------------------------------------

const ALL_KINDS: ReadonlyArray<CommitKind> = [
    "userEdit",
    "programmaticFix",
    "import",
    "undo",
    "redo",
    "load",
    "structuralFixup",
    "metadataOnly",
];

function makeEvent(kind: CommitKind, dirty: boolean): CommitEvent {
    return {
        meta: {
            kind,
            scope: { bookCode: "GEN", chapter: 1 },
            dirtyTextContent: dirty,
            generation: 1,
        },
        patch: { kind: "selectionOnly", bookCode: "GEN", chapter: 1 },
        snapshot: [],
    };
}

type Row = { kind: CommitKind; dirty: boolean; expect: boolean };

// Policy table. The "true" rows are the contract: undo/redo/
// programmaticFix/import with dirtyTextContent=true trigger rerun.
// Everything else (incl. userEdit by design) is excluded.
const POLICY: ReadonlyArray<Row> = [
    { kind: "userEdit", dirty: true, expect: false },
    { kind: "userEdit", dirty: false, expect: false },
    { kind: "programmaticFix", dirty: true, expect: true },
    { kind: "programmaticFix", dirty: false, expect: false },
    { kind: "import", dirty: true, expect: true },
    { kind: "import", dirty: false, expect: false },
    { kind: "undo", dirty: true, expect: true },
    { kind: "undo", dirty: false, expect: false },
    { kind: "redo", dirty: true, expect: true },
    { kind: "redo", dirty: false, expect: false },
    { kind: "load", dirty: true, expect: false },
    { kind: "load", dirty: false, expect: false },
    { kind: "structuralFixup", dirty: true, expect: false },
    { kind: "structuralFixup", dirty: false, expect: false },
    { kind: "metadataOnly", dirty: true, expect: false },
    { kind: "metadataOnly", dirty: false, expect: false },
];

describe("isSearchRerunRelevant — policy matrix", () => {
    it("covers every CommitKind", () => {
        const covered = new Set(POLICY.map((r) => r.kind));
        for (const kind of ALL_KINDS) expect(covered.has(kind)).toBe(true);
        expect(POLICY).toHaveLength(ALL_KINDS.length * 2);
    });

    it.each(POLICY)(
        "isSearchRerunRelevant($kind, dirty=$dirty) → $expect",
        ({ kind, dirty, expect: expected }) => {
            expect(isSearchRerunRelevant(makeEvent(kind, dirty))).toBe(
                expected,
            );
        },
    );
});

// ----- Pipeline integration ----------------------------------------------

const DEBOUNCE_MS = 250;

function runWithTestClock<E>(
    program: Effect.Effect<void, E, Scope.Scope>,
): Promise<void> {
    return Effect.runPromise(
        Effect.scoped(program).pipe(Effect.provide(TestClock.layer())),
    );
}

describe("makeSearchRerunPipeline (integration)", () => {
    let searchTerm = "Jisu";
    const fibers: Array<Fiber.Fiber<void, unknown>> = [];

    afterEach(async () => {
        for (const f of fibers.splice(0)) {
            await Effect.runPromise(Fiber.interrupt(f));
        }
        searchTerm = "Jisu";
    });

    function setupPipeline(args: {
        wf: WorkingFilesStore;
        rerunSearch: (term: string) => void;
    }) {
        return makeSearchRerunPipeline({
            workingFilesStore: args.wf,
            getSearchTerm: () => searchTerm,
            rerunSearch: args.rerunSearch,
            debounceMs: DEBOUNCE_MS,
        });
    }

    it("fires rerunSearch after a userEdit-then-undo commit", async () => {
        const wf = new WorkingFilesStore([makeBook({ bookCode: "GEN" })]);
        const rerunSearch = vi.fn<(term: string) => void>();

        await runWithTestClock(
            Effect.gen(function* () {
                yield* Effect.forkChild(
                    setupPipeline({ wf, rerunSearch }),
                );
                yield* drainYields();

                // Simulate the bridge's classification of an undo: a
                // bulk commit with `kind: "undo"` and dirtyTextContent.
                wf.commit(
                    { kind: "bulk", files: [makeBook({ bookCode: "GEN" })] },
                    makeCommitMeta({
                        kind: "undo",
                        bookCode: "GEN",
                        chapter: 1,
                    }),
                );

                yield* passTime(DEBOUNCE_MS + 20);
                expect(rerunSearch).toHaveBeenCalledTimes(1);
                expect(rerunSearch).toHaveBeenCalledWith("Jisu");
            }),
        );
    });

    it("does not fire on userEdit commits (replace runs its own rerun)", async () => {
        const wf = new WorkingFilesStore([makeBook({ bookCode: "GEN" })]);
        const rerunSearch = vi.fn<(term: string) => void>();

        await runWithTestClock(
            Effect.gen(function* () {
                yield* Effect.forkChild(
                    setupPipeline({ wf, rerunSearch }),
                );
                yield* drainYields();

                wf.commit(
                    makeChapterPatch({
                        bookCode: "GEN",
                        chapter: 1,
                        text: "typed",
                    }),
                    makeCommitMeta({
                        kind: "userEdit",
                        bookCode: "GEN",
                        chapter: 1,
                    }),
                );

                yield* passTime(DEBOUNCE_MS * 3);
                expect(rerunSearch).not.toHaveBeenCalled();
            }),
        );
    });

    it("does not fire on metadataOnly / structuralFixup / load", async () => {
        const wf = new WorkingFilesStore([makeBook({ bookCode: "GEN" })]);
        const rerunSearch = vi.fn<(term: string) => void>();

        await runWithTestClock(
            Effect.gen(function* () {
                yield* Effect.forkChild(
                    setupPipeline({ wf, rerunSearch }),
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
                wf.commit(
                    makeChapterPatch({
                        bookCode: "GEN",
                        chapter: 1,
                        text: "fixup",
                    }),
                    makeCommitMeta({
                        kind: "structuralFixup",
                        bookCode: "GEN",
                        chapter: 1,
                    }),
                );
                wf.commit(
                    { kind: "bulk", files: [makeBook({ bookCode: "GEN" })] },
                    makeCommitMeta({
                        kind: "load",
                        bookCode: "GEN",
                        chapter: 1,
                    }),
                );

                yield* passTime(DEBOUNCE_MS * 3);
                expect(rerunSearch).not.toHaveBeenCalled();
            }),
        );
    });

    it("short-circuits when the search term is empty", async () => {
        searchTerm = "   "; // whitespace counts as empty
        const wf = new WorkingFilesStore([makeBook({ bookCode: "GEN" })]);
        const rerunSearch = vi.fn<(term: string) => void>();

        await runWithTestClock(
            Effect.gen(function* () {
                yield* Effect.forkChild(
                    setupPipeline({ wf, rerunSearch }),
                );
                yield* drainYields();

                wf.commit(
                    { kind: "bulk", files: [makeBook({ bookCode: "GEN" })] },
                    makeCommitMeta({
                        kind: "undo",
                        bookCode: "GEN",
                        chapter: 1,
                    }),
                );

                yield* passTime(DEBOUNCE_MS + 20);
                expect(rerunSearch).not.toHaveBeenCalled();
            }),
        );
    });

    it("coalesces a burst of relevant commits into one rerun", async () => {
        const wf = new WorkingFilesStore([makeBook({ bookCode: "GEN" })]);
        const rerunSearch = vi.fn<(term: string) => void>();

        await runWithTestClock(
            Effect.gen(function* () {
                yield* Effect.forkChild(
                    setupPipeline({ wf, rerunSearch }),
                );
                yield* drainYields();

                for (const kind of [
                    "undo",
                    "programmaticFix",
                    "import",
                ] as const) {
                    wf.commit(
                        {
                            kind: "bulk",
                            files: [makeBook({ bookCode: "GEN" })],
                        },
                        makeCommitMeta({
                            kind,
                            bookCode: "GEN",
                            chapter: 1,
                        }),
                    );
                }

                yield* passTime(DEBOUNCE_MS + 20);
                expect(rerunSearch).toHaveBeenCalledTimes(1);
            }),
        );
    });

    it("reads the latest search term through the getter (closure-free)", async () => {
        // The hook reads `executionRef.current.searchTerm` at fire time.
        // Mirror that contract by mutating `searchTerm` between
        // pipeline-fork and commit, and assert the rerun sees the
        // *current* value, not the value at fork time.
        searchTerm = "stale";
        const wf = new WorkingFilesStore([makeBook({ bookCode: "GEN" })]);
        const rerunSearch = vi.fn<(term: string) => void>();

        await runWithTestClock(
            Effect.gen(function* () {
                yield* Effect.forkChild(
                    setupPipeline({ wf, rerunSearch }),
                );
                yield* drainYields();
                searchTerm = "fresh";

                wf.commit(
                    { kind: "bulk", files: [makeBook({ bookCode: "GEN" })] },
                    makeCommitMeta({
                        kind: "undo",
                        bookCode: "GEN",
                        chapter: 1,
                    }),
                );

                yield* passTime(DEBOUNCE_MS + 20);
                expect(rerunSearch).toHaveBeenCalledWith("fresh");
            }),
        );
    });
});
