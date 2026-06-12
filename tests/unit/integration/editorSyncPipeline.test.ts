// editorSyncPipeline.test.ts
//
// Store-seam integration test in the canonical `lintPipeline.test.ts` shape:
// real `WorkingFilesStore`, stub only the editor boundary (a fake
// LexicalEditor capturing `setEditorState`), drive behavior through
// `commit(...)`, assert on the observable output (what was rendered into the
// editor, and with which tag).
//
// Scope policy (`editorSyncScopeFor`) is matrix-tested in
// `commitFilters.test.ts`; this file asserts the pipeline wiring: visible-
// chapter intersection, the programaticIgnore tag (no bridge feedback loop),
// and that user edits / replay never write back into the editor.

import { drainYields } from "@tests/helpers/effectTestTime.ts";
import {
  makeBook,
  makeChapterPatch,
  makeCommitMeta,
} from "@tests/helpers/workspaceFixtures.ts";
import { Deferred, Effect, type Scope } from "effect";
import { TestClock } from "effect/testing";
import type { LexicalEditor } from "lexical";
import { describe, expect, it, vi } from "vitest";

import { EDITOR_TAGS_USED } from "@/app/data/editor.ts";
import { makeEditorSyncPipeline } from "@/app/domain/editor/pipelines/editorSyncPipeline.ts";
import { LayoutTickStore } from "@/app/state/LayoutTickStore.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";

function runWithTestClock<E>(
  program: Effect.Effect<void, E, Scope.Scope>,
): Promise<void> {
  return Effect.runPromise(
    Effect.scoped(program).pipe(Effect.provide(TestClock.layer())),
  );
}

function stubEditor() {
  const setEditorState = vi.fn();
  const editor = {
    parseEditorState: vi.fn((state: unknown) => state),
    setEditorState,
  } as unknown as LexicalEditor;
  return { editor, setEditorState };
}

function makeHarness(args: { visibleBook: string; visibleChapter: number }) {
  const wf = new WorkingFilesStore([makeBook({ bookCode: "GEN" })]);
  const layoutTickStore = new LayoutTickStore();
  const { editor, setEditorState } = stubEditor();
  const mainEditorDeferred = Effect.runSync(Deferred.make<LexicalEditor>());
  Effect.runSync(Deferred.succeed(mainEditorDeferred, editor));
  const pipeline = makeEditorSyncPipeline({
    workingFilesStore: wf,
    mainEditorDeferred,
    getVisibleBookCode: () => args.visibleBook,
    getVisibleChapter: () => args.visibleChapter,
    layoutTickStore,
  });
  return { wf, pipeline, setEditorState };
}

describe("editorSyncPipeline (integration)", () => {
  it("renders a programmaticFix commit touching the visible chapter into the editor, tagged programaticIgnore", async () => {
    const { wf, pipeline, setEditorState } = makeHarness({
      visibleBook: "GEN",
      visibleChapter: 1,
    });

    await runWithTestClock(
      Effect.gen(function* () {
        yield* Effect.forkChild(pipeline);
        yield* drainYields();

        wf.commit({
          patch: makeChapterPatch({
            bookCode: "GEN",
            chapter: 1,
            text: "fixed",
          }),
          meta: makeCommitMeta({
            kind: "programmaticFix",
            bookCode: "GEN",
            chapter: 1,
          }),
        });
        yield* drainYields();

        expect(setEditorState).toHaveBeenCalledTimes(1);
        expect(setEditorState.mock.calls[0]?.[1]).toEqual({
          tag: EDITOR_TAGS_USED.programaticIgnore,
        });
      }),
    );
  });

  it("skips commits whose scope does not touch the visible chapter", async () => {
    const { wf, pipeline, setEditorState } = makeHarness({
      visibleBook: "GEN",
      visibleChapter: 2,
    });

    await runWithTestClock(
      Effect.gen(function* () {
        yield* Effect.forkChild(pipeline);
        yield* drainYields();

        wf.commit({
          patch: makeChapterPatch({
            bookCode: "GEN",
            chapter: 1,
            text: "fixed",
          }),
          meta: makeCommitMeta({
            kind: "programmaticFix",
            bookCode: "GEN",
            chapter: 1,
          }),
        });
        yield* drainYields();

        expect(setEditorState).not.toHaveBeenCalled();
      }),
    );
  });

  it("syncs project-scope import commits (visible chapter ∈ all)", async () => {
    const { wf, pipeline, setEditorState } = makeHarness({
      visibleBook: "GEN",
      visibleChapter: 1,
    });

    await runWithTestClock(
      Effect.gen(function* () {
        yield* Effect.forkChild(pipeline);
        yield* drainYields();

        wf.commit({
          patch: { kind: "bulk", files: wf.read() },
          meta: {
            kind: "import",
            scope: { project: true },
            dirtyTextContent: true,
          },
        });
        yield* drainYields();

        expect(setEditorState).toHaveBeenCalledTimes(1);
      }),
    );
  });

  it("never writes back on userEdit or undo commits (selection/IME and replay own the editor)", async () => {
    const { wf, pipeline, setEditorState } = makeHarness({
      visibleBook: "GEN",
      visibleChapter: 1,
    });

    await runWithTestClock(
      Effect.gen(function* () {
        yield* Effect.forkChild(pipeline);
        yield* drainYields();

        wf.commit({
          patch: makeChapterPatch({
            bookCode: "GEN",
            chapter: 1,
            text: "typed",
          }),
          meta: makeCommitMeta({
            kind: "userEdit",
            bookCode: "GEN",
            chapter: 1,
          }),
        });
        wf.commit({
          patch: makeChapterPatch({
            bookCode: "GEN",
            chapter: 1,
            text: "replayed",
          }),
          meta: makeCommitMeta({
            kind: "undo",
            bookCode: "GEN",
            chapter: 1,
          }),
        });
        yield* drainYields();

        expect(setEditorState).not.toHaveBeenCalled();
      }),
    );
  });
});
