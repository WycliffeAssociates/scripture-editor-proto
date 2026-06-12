// lintPipeline.test.ts
//
// Store-seam integration test for the lint pipeline after the mirror repoint.
// The pipeline no longer calls a lint service or writes the findings store
// directly — it emits `analyzeLint` commands onto the `MirrorFeed`. So the
// observable contract is now "which commands, carrying which scope, at which
// cadence". Findings normalization + the store write live downstream in the
// result router (covered by its own test); the pipeline's job is the Effect
// debounce/fold shell and the command it produces.
//
// Filter policy (which `CommitKind`s are lint-relevant) is asserted
// exhaustively at the predicate level in `commitFilters.test.ts`; this file
// asserts one negative case (`metadataOnly`) plus the fold/escalation shape.

import { drainYields, passTime } from "@tests/helpers/effectTestTime.ts";
import {
  makeBook,
  makeChapterPatch,
  makeCommitMeta,
} from "@tests/helpers/workspaceFixtures.ts";
import { Effect, type Scope } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vitest";

import { makeLintPipeline } from "@/app/domain/editor/pipelines/lintPipeline.ts";
import { MirrorFeed } from "@/app/domain/mirror/MirrorFeed.ts";
import type { MirrorCommand } from "@/app/domain/mirror/mirrorProtocol.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";

const DEBOUNCE_MS = 100;

function runWithTestClock<E>(
  program: Effect.Effect<void, E, Scope.Scope>,
): Promise<void> {
  return Effect.runPromise(
    Effect.scoped(program).pipe(Effect.provide(TestClock.layer())),
  );
}

function captureFeed() {
  const feed = new MirrorFeed();
  const commands: MirrorCommand[] = [];
  feed.addSink({ pushPatch: () => {}, sendCommand: (c) => commands.push(c) });
  return { feed, commands };
}

function lintCommands(commands: MirrorCommand[]) {
  return commands.filter((c) => c.kind === "analyzeLint");
}

function userEdit(bookCode: string, chapter: number, text: string) {
  return {
    patch: makeChapterPatch({ bookCode, chapter, text }),
    meta: makeCommitMeta({ kind: "userEdit", bookCode, chapter }),
  };
}

describe("lintPipeline (integration)", () => {
  it("coalesces a typing burst into one lint command after the debounce window", async () => {
    const { feed, commands } = captureFeed();
    const wf = new WorkingFilesStore([makeBook({ bookCode: "GEN" })]);

    await runWithTestClock(
      Effect.gen(function* () {
        yield* Effect.forkChild(
          makeLintPipeline({
            workingFilesStore: wf,
            feed,
            debounceMs: DEBOUNCE_MS,
          }),
        );
        yield* drainYields();

        wf.commit(userEdit("GEN", 1, "a"));
        wf.commit(userEdit("GEN", 1, "ab"));
        wf.commit(userEdit("GEN", 1, "abc"));

        yield* passTime(DEBOUNCE_MS - 10);
        expect(lintCommands(commands)).toHaveLength(0);

        yield* passTime(50);
        expect(lintCommands(commands)).toHaveLength(1);
      }),
    );
  });

  it("ignores metadataOnly commits — cursor moves don't drive lint", async () => {
    const { feed, commands } = captureFeed();
    const wf = new WorkingFilesStore([makeBook({ bookCode: "GEN" })]);

    await runWithTestClock(
      Effect.gen(function* () {
        yield* Effect.forkChild(
          makeLintPipeline({
            workingFilesStore: wf,
            feed,
            debounceMs: DEBOUNCE_MS,
          }),
        );
        yield* drainYields();

        wf.commit({
          patch: {
            kind: "selectionOnly",
            bookCode: "GEN",
            chapter: 1,
            selection: null,
          },
          meta: makeCommitMeta({
            kind: "metadataOnly",
            bookCode: "GEN",
            chapter: 1,
            dirtyTextContent: false,
          }),
        });

        yield* passTime(DEBOUNCE_MS * 2);
        expect(lintCommands(commands)).toHaveLength(0);
      }),
    );
  });

  it("FOLDS scopes across the debounce window — two books in ONE command", async () => {
    const { feed, commands } = captureFeed();
    const wf = new WorkingFilesStore([
      makeBook({ bookCode: "GEN" }),
      makeBook({ bookCode: "EXO" }),
    ]);

    await runWithTestClock(
      Effect.gen(function* () {
        yield* Effect.forkChild(
          makeLintPipeline({
            workingFilesStore: wf,
            feed,
            debounceMs: DEBOUNCE_MS,
          }),
        );
        yield* drainYields();

        wf.commit(userEdit("GEN", 1, "a"));
        yield* passTime(DEBOUNCE_MS / 2);
        wf.commit(userEdit("EXO", 1, "b"));

        yield* passTime(DEBOUNCE_MS + 20);
        const lints = lintCommands(commands);
        expect(lints).toHaveLength(1);
        const scope = lints[0]!.scope;
        expect(scope === "all" ? scope : [...scope.books].sort()).toEqual([
          "EXO",
          "GEN",
        ]);
      }),
    );
  });

  it("escalates to ALL books when a project-scope commit lands in the window", async () => {
    const { feed, commands } = captureFeed();
    const wf = new WorkingFilesStore([
      makeBook({ bookCode: "GEN" }),
      makeBook({ bookCode: "EXO" }),
      makeBook({ bookCode: "LEV" }),
    ]);

    await runWithTestClock(
      Effect.gen(function* () {
        yield* Effect.forkChild(
          makeLintPipeline({
            workingFilesStore: wf,
            feed,
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
        const lints = lintCommands(commands);
        expect(lints).toHaveLength(1);
        expect(lints[0]!.scope).toBe("all");
      }),
    );
  });
});
