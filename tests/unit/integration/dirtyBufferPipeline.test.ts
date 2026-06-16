// dirtyBufferPipeline.test.ts
//
// Store-seam integration test for the dirty-buffer pacing pipeline after the
// mirror repoint. The pipeline no longer serializes USFM or writes the backup
// store — it paces per-book `writeBackup` commands onto the `MirrorFeed`. The
// dirty/clean decision and the byte-identical serialization moved into the
// mirror (covered by WorkspaceMirror.test.ts). So the observable contract here
// is the pacing: which books get a writeBackup command, and when.

import { drainYields, passTime } from "@tests/helpers/effectTestTime.ts";
import {
  makeBook,
  makeChapter,
  makeChapterPatch,
  makeCommitMeta,
} from "@tests/helpers/workspaceFixtures.ts";
import { Effect, type Scope } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vitest";

import { makeDirtyBufferPipeline } from "@/app/domain/editor/pipelines/dirtyBufferPipeline.ts";
import { MirrorFeed } from "@/app/domain/mirror/MirrorFeed.ts";
import type { MirrorCommand } from "@/app/domain/mirror/mirrorProtocol.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";

const IDLE_MS = 100;
const CEILING_MS = 1000;

function runWithTestClock<E>(
  program: Effect.Effect<void, E, Scope.Scope>,
): Promise<void> {
  return Effect.runPromise(
    Effect.scoped(program).pipe(Effect.provide(TestClock.layer())),
  );
}

function backupBooks(commands: MirrorCommand[]): string[] {
  return commands
    .filter((c) => c.kind === "writeBackup")
    .map((c) => (c.kind === "writeBackup" ? c.bookCode : ""));
}

function setup(
  books: ReturnType<typeof makeBook>[],
  overrides?: { idleMs?: number; ceilingMs?: number },
) {
  const wf = new WorkingFilesStore(books);
  const feed = new MirrorFeed();
  const commands: MirrorCommand[] = [];
  feed.addSink({ pushPatch: () => {}, sendCommand: (c) => commands.push(c) });
  const pipeline = makeDirtyBufferPipeline({
    workingFilesStore: wf,
    feed,
    appVersion: "test",
    idleMs: overrides?.idleMs ?? IDLE_MS,
    ceilingMs: overrides?.ceilingMs ?? CEILING_MS,
  });
  return { wf, commands, pipeline };
}

function edit(bookCode: string, chapter: number, text: string) {
  return {
    patch: makeChapterPatch({ bookCode, chapter, text }),
    meta: makeCommitMeta({ kind: "userEdit", bookCode, chapter }),
  };
}

describe("dirtyBufferPipeline (integration)", () => {
  it("coalesces a typing burst into one writeBackup command per book", async () => {
    const { wf, commands, pipeline } = setup([makeBook({ bookCode: "GEN" })]);
    await runWithTestClock(
      Effect.gen(function* () {
        yield* Effect.forkChild(pipeline);
        yield* drainYields();

        wf.commit(edit("GEN", 1, "a"));
        wf.commit(edit("GEN", 1, "ab"));
        wf.commit(edit("GEN", 1, "abc"));

        yield* passTime(IDLE_MS - 10);
        expect(backupBooks(commands)).toHaveLength(0);

        yield* passTime(40);
        expect(backupBooks(commands)).toEqual(["GEN"]);
      }),
    );
  });

  it("commands a backup reconcile after a clean-mark (mirror decides clear)", async () => {
    const { wf, commands, pipeline } = setup([makeBook({ bookCode: "GEN" })]);
    await runWithTestClock(
      Effect.gen(function* () {
        yield* Effect.forkChild(pipeline);
        yield* drainYields();

        wf.commit(edit("GEN", 1, "dirty edit"));
        yield* passTime(IDLE_MS + 30);
        expect(backupBooks(commands)).toEqual(["GEN"]);

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
        // A second reconcile command fires; the mirror turns it into a clear.
        expect(backupBooks(commands)).toEqual(["GEN", "GEN"]);
      }),
    );
  });

  it("paces each book on its own clock (no cross-book starvation)", async () => {
    const { wf, commands, pipeline } = setup([
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

        expect(backupBooks(commands).sort()).toEqual(["EXO", "GEN"]);
      }),
    );
  });

  it("forces a flush at the staleness ceiling during sustained typing", async () => {
    const { wf, commands, pipeline } = setup([makeBook({ bookCode: "GEN" })]);
    await runWithTestClock(
      Effect.gen(function* () {
        yield* Effect.forkChild(pipeline);
        yield* drainYields();

        wf.commit(edit("GEN", 1, "burst-0"));
        for (let i = 1; i <= 20; i++) {
          yield* passTime(60);
          wf.commit(edit("GEN", 1, `burst-${i}`));
        }
        expect(backupBooks(commands).length).toBeGreaterThan(0);
      }),
    );
  });

  it("fans a project-scope commit out to every book", async () => {
    const { wf, commands, pipeline } = setup([
      makeBook({ bookCode: "GEN" }),
      makeBook({ bookCode: "EXO" }),
    ]);
    await runWithTestClock(
      Effect.gen(function* () {
        yield* Effect.forkChild(pipeline);
        yield* drainYields();

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

        expect(backupBooks(commands).sort()).toEqual(["EXO", "GEN"]);
      }),
    );
  });
});
