// dirtyBufferPipeline.test.ts
//
// Store-seam integration test for the crash-recovery dirty-buffer pipeline,
// following the canonical shape documented in lintPipeline.test.ts: real
// stores, stub only the IO boundary (here the DirtyBufferStore's put/clear are
// spied), drive via WorkingFilesStore.commit, fork under TestClock.

import { drainYields, passTime } from "@tests/helpers/effectTestTime.ts";
import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";
import {
  makeBook,
  makeChapter,
  makeChapterPatch,
  makeCommitMeta,
} from "@tests/helpers/workspaceFixtures.ts";
import { Effect, type Scope } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it, vi } from "vitest";

import { makeDirtyBufferPipeline } from "@/app/domain/editor/pipelines/dirtyBufferPipeline.ts";
import { DirtyBufferStore } from "@/app/state/DirtyBufferStore.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";

const IDLE_MS = 100;
const CEILING_MS = 1000;
const WS = "demo";

const identityMd5: IMd5Service = { calculateMd5: async (t: string) => t };

function runWithTestClock<E>(
  program: Effect.Effect<void, E, Scope.Scope>,
): Promise<void> {
  return Effect.runPromise(
    Effect.scoped(program).pipe(Effect.provide(TestClock.layer())),
  );
}

function setup(
  books: ReturnType<typeof makeBook>[],
  overrides?: { idleMs?: number; ceilingMs?: number },
) {
  const wf = new WorkingFilesStore(books);
  const dirtyBufferStore = new DirtyBufferStore(
    new InMemoryFileSystem(),
    identityMd5,
    "/appData/dirty-buffers",
  );
  const put = vi.spyOn(dirtyBufferStore, "put");
  const clear = vi.spyOn(dirtyBufferStore, "clear");
  const pipeline = makeDirtyBufferPipeline({
    workingFilesStore: wf,
    workspaceBaselineStore: new WorkspaceBaselineStore(identityMd5),
    dirtyBufferStore,
    workspaceKey: WS,
    appVersion: "test",
    idleMs: overrides?.idleMs ?? IDLE_MS,
    ceilingMs: overrides?.ceilingMs ?? CEILING_MS,
  });
  return { wf, put, clear, pipeline };
}

function edit(bookCode: string, chapter: number, text: string) {
  return {
    patch: makeChapterPatch({ bookCode, chapter, text }),
    meta: makeCommitMeta({ kind: "userEdit", bookCode, chapter }),
  };
}

describe("dirtyBufferPipeline (integration)", () => {
  it("coalesces a typing burst into one backup write per book after the debounce", async () => {
    const { wf, put, pipeline } = setup([makeBook({ bookCode: "GEN" })]);
    await runWithTestClock(
      Effect.gen(function* () {
        yield* Effect.forkChild(pipeline);
        yield* drainYields();

        wf.commit(edit("GEN", 1, "a"));
        wf.commit(edit("GEN", 1, "ab"));
        wf.commit(edit("GEN", 1, "abc"));

        yield* passTime(IDLE_MS - 10);
        expect(put).not.toHaveBeenCalled();

        yield* passTime(40);
        expect(put).toHaveBeenCalledTimes(1);
        expect(put).toHaveBeenCalledWith(
          WS,
          "GEN",
          expect.objectContaining({ content: expect.any(String) }),
        );
      }),
    );
  });

  it("clears a book's backup once it goes clean", async () => {
    const { wf, put, clear, pipeline } = setup([makeBook({ bookCode: "GEN" })]);
    await runWithTestClock(
      Effect.gen(function* () {
        yield* Effect.forkChild(pipeline);
        yield* drainYields();

        wf.commit(edit("GEN", 1, "dirty edit"));
        yield* passTime(IDLE_MS + 30);
        expect(put).toHaveBeenCalledTimes(1);

        // Mark the chapter clean (save-style metadata commit).
        wf.commit({
          patch: {
            kind: "metadata",
            bookCode: "GEN",
            chapter: 1,
            dirty: false,
          },
          meta: makeCommitMeta({
            kind: "metadataOnly",
            bookCode: "GEN",
            chapter: 1,
            dirtyTextContent: false,
          }),
        });
        yield* passTime(IDLE_MS + 30);
        expect(clear).toHaveBeenCalledWith(WS, "GEN");
      }),
    );
  });

  it("clears a book's backup when all edits are reverted (revert-all)", async () => {
    const { wf, put, clear, pipeline } = setup([makeBook({ bookCode: "GEN" })]);
    await runWithTestClock(
      Effect.gen(function* () {
        yield* Effect.forkChild(pipeline);
        yield* drainYields();

        wf.commit(edit("GEN", 1, "an edit"));
        yield* passTime(IDLE_MS + 30);
        expect(put).toHaveBeenCalledTimes(1);

        // revertAll / discardAllChanges commit the clean (reverted)
        // project as a bulk patch tagged `undo` — going back to disk
        // must drop the backup.
        wf.commit({
          patch: { kind: "bulk", files: [makeBook({ bookCode: "GEN" })] },
          meta: {
            kind: "undo",
            scope: { project: true },
            dirtyTextContent: true,
          },
        });
        yield* passTime(IDLE_MS + 30);
        expect(clear).toHaveBeenCalledWith(WS, "GEN");
      }),
    );
  });

  it("rewrites (not clears) a book's backup when one of several dirty chapters is reset", async () => {
    const { wf, put, clear, pipeline } = setup([
      makeBook({
        bookCode: "GEN",
        chapters: [
          makeChapter({
            bookCode: "GEN",
            chapterNumber: 1,
            text: "c1edit",
            sourceText: "c1src",
          }),
          makeChapter({
            bookCode: "GEN",
            chapterNumber: 2,
            text: "c2edit",
            sourceText: "c2src",
          }),
        ],
      }),
    ]);
    await runWithTestClock(
      Effect.gen(function* () {
        yield* Effect.forkChild(pipeline);
        yield* drainYields();

        // Trigger the initial whole-book backup (both chapters dirty).
        wf.commit(edit("GEN", 2, "c2edit"));
        yield* passTime(IDLE_MS + 30);
        expect(put).toHaveBeenCalledTimes(1);

        // Reset only chapter 1 (revertChapter / revertDiff path): a
        // content patch tagged `undo` that returns it to its source
        // text. Content-derived dirty flips chapter 1 clean while
        // chapter 2 stays dirty.
        wf.commit({
          patch: makeChapterPatch({
            bookCode: "GEN",
            chapter: 1,
            text: "c1src",
          }),
          meta: makeCommitMeta({ kind: "undo", bookCode: "GEN", chapter: 1 }),
        });
        const gen = wf.read().find((b) => b.bookCode === "GEN");
        expect(gen?.chapters.find((c) => c.chapterNumber === 1)?.dirty).toBe(
          false,
        );
        expect(gen?.chapters.find((c) => c.chapterNumber === 2)?.dirty).toBe(
          true,
        );

        yield* passTime(IDLE_MS + 30);
        // Book still has a dirty chapter, so the backup is rewritten to
        // reflect the partial reset — not cleared.
        expect(clear).not.toHaveBeenCalled();
        expect(put).toHaveBeenCalledTimes(2);
        const content = put.mock.calls.at(-1)?.[2]?.content ?? "";
        expect(content).toContain("c1src");
        expect(content).toContain("c2edit");
        expect(content).not.toContain("c1edit");
      }),
    );
  });

  it("paces each book on its own clock (no cross-book starvation)", async () => {
    const { wf, put, pipeline } = setup([
      makeBook({
        bookCode: "GEN",
        chapters: [makeChapter({ bookCode: "GEN" })],
      }),
      makeBook({
        bookCode: "EXO",
        chapters: [makeChapter({ bookCode: "EXO" })],
      }),
    ]);
    await runWithTestClock(
      Effect.gen(function* () {
        yield* Effect.forkChild(pipeline);
        yield* drainYields();

        wf.commit(edit("GEN", 1, "gen edit"));
        wf.commit(edit("EXO", 1, "exo edit"));
        yield* passTime(IDLE_MS + 30);

        const books = put.mock.calls.map((call) => call[1]).sort();
        expect(books).toEqual(["EXO", "GEN"]);
      }),
    );
  });

  it("forces a flush at the staleness ceiling during sustained typing", async () => {
    // Commit faster than the idle window so debounce never settles; the
    // ceiling must still force a write.
    const { wf, put, pipeline } = setup([makeBook({ bookCode: "GEN" })]);
    await runWithTestClock(
      Effect.gen(function* () {
        yield* Effect.forkChild(pipeline);
        yield* drainYields();

        wf.commit(edit("GEN", 1, "burst-0"));
        // 20 commits at 60ms gaps (< IDLE_MS=100, so debounce never
        // settles) = ~1200ms > CEILING_MS=1000, so the ceiling must fire.
        for (let i = 1; i <= 20; i++) {
          yield* passTime(60);
          wf.commit(edit("GEN", 1, `burst-${i}`));
        }
        expect(put).toHaveBeenCalled();
      }),
    );
  });

  it("fans a project-scope commit out to every dirty book", async () => {
    const { wf, put, pipeline } = setup([
      makeBook({ bookCode: "GEN" }),
      makeBook({ bookCode: "EXO" }),
    ]);
    await runWithTestClock(
      Effect.gen(function* () {
        yield* Effect.forkChild(pipeline);
        yield* drainYields();

        // Bulk import touching both books (e.g. a version revert).
        wf.commit({
          patch: {
            kind: "bulk",
            files: [
              makeBook({
                bookCode: "GEN",
                chapters: [
                  makeChapter({
                    bookCode: "GEN",
                    text: "g-new",
                    sourceText: "g-old",
                  }),
                ],
              }),
              makeBook({
                bookCode: "EXO",
                chapters: [
                  makeChapter({
                    bookCode: "EXO",
                    text: "e-new",
                    sourceText: "e-old",
                  }),
                ],
              }),
            ],
          },
          meta: {
            kind: "import",
            scope: { project: true },
            dirtyTextContent: true,
          },
        });
        yield* passTime(IDLE_MS + 30);

        const books = put.mock.calls.map((call) => call[1]).sort();
        expect(books).toEqual(["EXO", "GEN"]);
      }),
    );
  });

  it("recovers from a transient FS error via bounded retry", async () => {
    // High ceiling so the only writes are the failed attempt + its retry,
    // not a staleness flush during the backoff window.
    const { wf, put, pipeline } = setup([makeBook({ bookCode: "GEN" })], {
      ceilingMs: 100_000,
    });
    // First write fails; the retry (exponential 2s) re-reads and succeeds.
    put.mockRejectedValueOnce(new Error("fs hiccup"));
    await runWithTestClock(
      Effect.gen(function* () {
        yield* Effect.forkChild(pipeline);
        yield* drainYields();

        wf.commit(edit("GEN", 1, "edit"));
        yield* passTime(IDLE_MS + 30);
        expect(put).toHaveBeenCalledTimes(1); // first attempt (rejected)

        yield* passTime(2100); // first retry backoff (~2s)
        expect(put).toHaveBeenCalledTimes(2); // retry succeeded
      }),
    );
  });
});
