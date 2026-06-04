// structureMaintenancePipeline.test.ts
//
// Store-seam integration test for `makeStructureMaintenancePipeline`.
// Mounts a real headless Lexical editor (via `createTestEditor`) so
// the pipeline's `editor.getEditorState().read(...)` step runs
// authentically. The two maintainer functions
// (`maintainDocumentStructure`, `maintainDocumentMetaData`) are
// mocked at the module boundary — they have their own dedicated
// pure-logic tests (`maintainDocumentStructure.test.ts` etc.); here
// we want to verify the *pipeline's* filter / debounce / await-
// Deferred / view-mode-skip wiring, not re-prove maintainer behavior.
//
// Canonical pattern from `lintPipeline.test.ts`. The 75 ms debounce
// runs under `TestClock`.

import { Deferred, Effect, type Scope } from "effect";
import { TestClock } from "effect/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EDITOR_MODES } from "@/app/data/editor.ts";
import { makeStructureMaintenancePipeline } from "@/app/domain/editor/pipelines/structureMaintenancePipeline.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { LexicalEditor } from "lexical";
import { createTestEditor } from "@tests/helpers/testEditor.ts";
import { drainYields, passTime } from "@tests/helpers/effectTestTime.ts";
import {
    makeBook,
    makeChapterPatch,
    makeCommitMeta,
} from "@tests/helpers/workspaceFixtures.ts";

const maintainStructureMock = vi.hoisted(() => vi.fn());
const maintainMetadataMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/domain/editor/listeners/maintainDocumentStructure.ts", () => ({
    maintainDocumentStructure: maintainStructureMock,
    // The pipeline doesn't use the debounced variant, but the source
    // module exports it — supply a no-op so the mock surface matches.
    maintainDocumentStructureDebounced: () => {},
}));
vi.mock("@/app/domain/editor/listeners/maintainMetadata.ts", () => ({
    maintainDocumentMetaData: maintainMetadataMock,
}));

const DEBOUNCE_MS = 75;
const FIXTURE_USFM = "\\id GEN\n\\c 1\n\\p\n\\v 1 In the beginning.\n";

function runWithTestClock<E>(
    program: Effect.Effect<void, E, Scope.Scope>,
): Promise<void> {
    return Effect.runPromise(
        Effect.scoped(program).pipe(Effect.provide(TestClock.layer())),
    );
}

let editor: LexicalEditor;

beforeAll(async () => {
    editor = await createTestEditor(FIXTURE_USFM);
});

afterEach(() => {
    maintainStructureMock.mockReset();
    maintainMetadataMock.mockReset();
});

function setupPipeline(opts?: { editorMode?: string }) {
    const wf = new WorkingFilesStore([makeBook({ bookCode: "GEN" })]);
    const mainEditorDeferred = Effect.runSync(Deferred.make<LexicalEditor>());
    // Resolve synchronously: production resolves on bridge mount, but
    // the pipeline only awaits the Deferred before doing maintenance,
    // not before subscribing. Pre-resolved is the steady-state case.
    Effect.runSync(Deferred.succeed(mainEditorDeferred, editor));
    return {
        wf,
        mainEditorDeferred,
        pipeline: makeStructureMaintenancePipeline({
            workingFilesStore: wf,
            mainEditorDeferred,
            getAppSettings: () => ({
                editorMode: opts?.editorMode ?? EDITOR_MODES.regular,
                // The pipeline reads `editorMode` only; cast the rest
                // away — adding all Settings fields would couple this
                // test to unrelated changes elsewhere.
            }) as ReturnType<
                Parameters<typeof makeStructureMaintenancePipeline>[0]["getAppSettings"]
            >,
            getVisibleBookCode: () => "GEN",
            debounceMs: DEBOUNCE_MS,
        }),
    };
}

function userEdit(text: string) {
    return {
        patch: makeChapterPatch({ bookCode: "GEN", chapter: 1, text }),
        meta: makeCommitMeta({ kind: "userEdit", bookCode: "GEN", chapter: 1 }),
    };
}

describe("structureMaintenancePipeline (integration)", () => {
    it("runs maintainers once after a userEdit commit + debounce window", async () => {
        const { wf, pipeline } = setupPipeline();

        await runWithTestClock(
            Effect.gen(function* () {
                yield* Effect.forkChild(pipeline);
                yield* drainYields();

                wf.commit(userEdit("edit"));
                yield* passTime(DEBOUNCE_MS - 10);
                expect(maintainStructureMock).not.toHaveBeenCalled();
                expect(maintainMetadataMock).not.toHaveBeenCalled();

                yield* passTime(20);
                expect(maintainStructureMock).toHaveBeenCalledTimes(1);
                expect(maintainMetadataMock).toHaveBeenCalledTimes(1);
            }),
        );
    });

    it("does not run on structuralFixup commits (feedback-loop guard)", async () => {
        const { wf, pipeline } = setupPipeline();

        await runWithTestClock(
            Effect.gen(function* () {
                yield* Effect.forkChild(pipeline);
                yield* drainYields();

                wf.commit({
                    patch: makeChapterPatch({
                        bookCode: "GEN",
                        chapter: 1,
                        text: "fix",
                    }),
                    meta: makeCommitMeta({
                        kind: "structuralFixup",
                        bookCode: "GEN",
                        chapter: 1,
                    }),
                });
                yield* passTime(DEBOUNCE_MS * 3);

                expect(maintainStructureMock).not.toHaveBeenCalled();
                expect(maintainMetadataMock).not.toHaveBeenCalled();
            }),
        );
    });

    it("skips maintenance when editor mode is `view`", async () => {
        const { wf, pipeline } = setupPipeline({
            editorMode: EDITOR_MODES.view,
        });

        await runWithTestClock(
            Effect.gen(function* () {
                yield* Effect.forkChild(pipeline);
                yield* drainYields();

                wf.commit(userEdit("edit"));
                yield* passTime(DEBOUNCE_MS + 20);

                // Filter + debounce fire (the commit is still
                // userEdit), but the view-mode early return skips the
                // maintainer calls.
                expect(maintainStructureMock).not.toHaveBeenCalled();
                expect(maintainMetadataMock).not.toHaveBeenCalled();
            }),
        );
    });

    it("coalesces a burst of userEdits into one maintainer pass", async () => {
        const { wf, pipeline } = setupPipeline();

        await runWithTestClock(
            Effect.gen(function* () {
                yield* Effect.forkChild(pipeline);
                yield* drainYields();

                wf.commit(userEdit("a"));
                wf.commit(userEdit("ab"));
                wf.commit(userEdit("abc"));
                yield* passTime(DEBOUNCE_MS + 10);

                expect(maintainStructureMock).toHaveBeenCalledTimes(1);
            }),
        );
    });
});
