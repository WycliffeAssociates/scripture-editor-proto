// workingFilesStore.test.ts
//
// Contract test for `WorkingFilesStore`. Asserts the store's three
// invariants that the rest of the system relies on:
//
//   1. `applyPatch` (chapter kind) re-derives `currentTokens` from
//      `lexicalState` and flips `dirty` based on source equality.
//      Includes the back-to-clean case (undo to baseline → dirty
//      goes false again).
//   2. `draftWithChapters` shallow-copies *only touched paths*:
//      reference identity preserved on untouched books and chapters,
//      new refs on touched ones. Asserted via `expect(a).toBe(b)` /
//      `.not.toBe`.
//   3. `commit` increments `generation` monotonically, and
//      `selectionOnly` is a pure event signal — the state reference
//      survives the commit unchanged.
//
// Node-level test. No jsdom, no Effect runtime; the store is a plain
// class with a stream side-channel we tap synchronously via
// `Stream.runForEach`.

import {
  makeBook,
  makeChapter,
  makeChapterPatch,
  makeCommitMeta,
  makeFlatRegularState,
} from "@tests/helpers/workspaceFixtures.ts";
import { Effect, Fiber, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { lexicalToTokens } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type { ScriptureChapterState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type {
  CapturedSelection,
  CommitEvent,
  WorkingFilesPatch,
} from "@/app/state/types.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";

/**
 * Build a `ScriptureChapterState` whose `sourceTokens` are the result
 * of running `lexicalToTokens` on the chapter's own lexical state.
 * Re-committing a chapter patch built from the *same* text then yields
 * `currentTokens` whose joined source matches `sourceTokens` — so the
 * dirty flag flips back to false. This is the contract the legacy
 * `updateChapterLexical` path relied on; the test pins it here.
 */
function makeChapterPinnedToSource(text: string): ScriptureChapterState {
  const lexicalState = makeFlatRegularState(text);
  const tokens = lexicalToTokens(lexicalState, { bookCode: "GEN" });
  return {
    chapterNumber: 1,
    dirty: false,
    eol: "\n",
    direction: "ltr",
    sourceTokens: tokens,
    currentTokens: tokens,
  };
}

describe("WorkingFilesStore — applyPatch (chapter)", () => {
  it("re-derives currentTokens and flips dirty to true on edited content", () => {
    const seed = makeChapterPinnedToSource("Hello.");
    const wf = new WorkingFilesStore([
      makeBook({ bookCode: "GEN", chapters: [seed] }),
    ]);

    wf.commit({
      patch: makeChapterPatch({
        bookCode: "GEN",
        chapter: 1,
        text: "Hello world.",
      }),
      meta: makeCommitMeta({ kind: "userEdit", bookCode: "GEN", chapter: 1 }),
    });

    const chapter = wf.read()[0].chapters[0];
    expect(chapter.dirty).toBe(true);
    // currentTokens has been re-derived from the new lexical state.
    // We don't pin the exact token shape (that's `lexicalToTokens`'s
    // job), but the joined source must reflect the edited text.
    const joined = chapter.currentTokens.map((t) => t.source ?? "").join("");
    expect(joined).toContain("Hello world.");
  });

  it("flips dirty back to false when content returns to source (undo-to-clean)", () => {
    const seed = makeChapterPinnedToSource("Hello.");
    const wf = new WorkingFilesStore([
      makeBook({ bookCode: "GEN", chapters: [seed] }),
    ]);

    // Edit away from source...
    wf.commit({
      patch: makeChapterPatch({
        bookCode: "GEN",
        chapter: 1,
        text: "Hello world.",
      }),
      meta: makeCommitMeta({ kind: "userEdit", bookCode: "GEN", chapter: 1 }),
    });
    expect(wf.read()[0].chapters[0].dirty).toBe(true);

    // ...then back to source (e.g. undo).
    wf.commit({
      patch: makeChapterPatch({ bookCode: "GEN", chapter: 1, text: "Hello." }),
      meta: makeCommitMeta({ kind: "undo", bookCode: "GEN", chapter: 1 }),
    });
    expect(wf.read()[0].chapters[0].dirty).toBe(false);
  });
});

describe("WorkingFilesStore — draftWithChapters (structural sharing)", () => {
  it("shallow-copies only touched book/chapter paths; everything else is reference-identical", () => {
    const wf = new WorkingFilesStore([
      makeBook({
        bookCode: "GEN",
        chapters: [
          makeChapter({ bookCode: "GEN", chapterNumber: 1 }),
          makeChapter({ bookCode: "GEN", chapterNumber: 2 }),
        ],
      }),
      makeBook({
        bookCode: "EXO",
        chapters: [makeChapter({ bookCode: "EXO", chapterNumber: 1 })],
      }),
    ]);
    const before = wf.read();

    const draft = wf.draftWithChapters([{ bookCode: "GEN", chapterNum: 2 }]);

    // Touched book: shallow copy.
    expect(draft[0]).not.toBe(before[0]);
    // Touched chapter: shallow copy.
    expect(draft[0].chapters[1]).not.toBe(before[0].chapters[1]);
    // Untouched chapter inside the touched book: identical reference.
    expect(draft[0].chapters[0]).toBe(before[0].chapters[0]);
    // Untouched book: identical reference.
    expect(draft[1]).toBe(before[1]);
  });

  it("returns the current state reference unchanged when refs is empty", () => {
    const wf = new WorkingFilesStore([makeBook({ bookCode: "GEN" })]);
    expect(wf.draftWithChapters([])).toBe(wf.read());
  });
});

describe("WorkingFilesStore — commit / selectionOnly", () => {
  it("increments generation monotonically across commits", async () => {
    const wf = new WorkingFilesStore([makeBook({ bookCode: "GEN" })]);
    const events: CommitEvent[] = [];

    // Subscribe to the stream, push the first three events into a
    // captured array, and finish.
    const fiber = Effect.runFork(
      wf.changes.pipe(
        Stream.take(3),
        Stream.tap((event) =>
          Effect.sync(() => {
            events.push(event);
          }),
        ),
        Stream.runDrain,
      ),
    );
    // Yield to let the subscription land before publishing.
    await new Promise<void>((r) => setImmediate(r));

    for (const text of ["a", "ab", "abc"]) {
      wf.commit({
        patch: makeChapterPatch({ bookCode: "GEN", chapter: 1, text }),
        meta: makeCommitMeta({
          kind: "userEdit",
          bookCode: "GEN",
          chapter: 1,
        }),
      });
    }

    await Effect.runPromise(Fiber.join(fiber));
    expect(events.map((e) => e.meta.generation)).toEqual([1, 2, 3]);
  });

  it("selectionOnly patch leaves the state reference unchanged", () => {
    const wf = new WorkingFilesStore([makeBook({ bookCode: "GEN" })]);
    const before = wf.read();

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

    expect(wf.read()).toBe(before);
  });
});

describe("WorkingFilesStore — selection facts", () => {
  const cursorAt = (id: string, offset: number): CapturedSelection => ({
    anchorId: id,
    anchorOffset: offset,
    focusId: id,
    focusOffset: offset,
  });

  const selectionOnlyMeta = (bookCode: string, chapter: number) =>
    makeCommitMeta({
      kind: "metadataOnly",
      bookCode,
      chapter,
      dirtyTextContent: false,
    });

  it("keeps the latest fact per chapter, stamped with the commit generation", () => {
    const wf = new WorkingFilesStore([makeBook({ bookCode: "GEN" })]);

    wf.commit({
      patch: {
        kind: "selectionOnly",
        bookCode: "GEN",
        chapter: 1,
        selection: cursorAt("t1", 3),
      },
      meta: selectionOnlyMeta("GEN", 1),
    });
    wf.commit({
      patch: {
        kind: "selectionOnly",
        bookCode: "GEN",
        chapter: 1,
        selection: cursorAt("t2", 0),
      },
      meta: selectionOnlyMeta("GEN", 1),
    });

    expect(wf.readSelectionFact("GEN", 1)).toEqual({
      generation: 2,
      selection: cursorAt("t2", 0),
    });
  });

  it("records a null riding selection as an honest fact (not skipped)", () => {
    const wf = new WorkingFilesStore([makeBook({ bookCode: "GEN" })]);

    wf.commit({
      patch: {
        kind: "selectionOnly",
        bookCode: "GEN",
        chapter: 1,
        selection: cursorAt("t1", 3),
      },
      meta: selectionOnlyMeta("GEN", 1),
    });
    wf.commit({
      patch: {
        kind: "selectionOnly",
        bookCode: "GEN",
        chapter: 1,
        selection: null,
      },
      meta: selectionOnlyMeta("GEN", 1),
    });

    expect(wf.readSelectionFact("GEN", 1)?.selection).toBeNull();
  });

  it("chapter patch WITH selection records; WITHOUT selection leaves facts untouched", () => {
    const seed = makeChapterPinnedToSource("Hello.");
    const wf = new WorkingFilesStore([
      makeBook({ bookCode: "GEN", chapters: [seed] }),
    ]);

    wf.commit({
      patch: {
        ...makeChapterPatch({ bookCode: "GEN", chapter: 1, text: "Hi." }),
        selection: cursorAt("t1", 1),
      } as WorkingFilesPatch,
      meta: makeCommitMeta({ kind: "userEdit", bookCode: "GEN", chapter: 1 }),
    });
    const afterRiding = wf.readSelectionFact("GEN", 1);
    expect(afterRiding).toEqual({
      generation: 1,
      selection: cursorAt("t1", 1),
    });

    // Programmatic writer that doesn't know the cursor: no selection
    // field. Absence means "unknown", not "no cursor" — facts unchanged.
    wf.commit({
      patch: makeChapterPatch({ bookCode: "GEN", chapter: 1, text: "Yo." }),
      meta: makeCommitMeta({ kind: "import", bookCode: "GEN", chapter: 1 }),
    });
    expect(wf.readSelectionFact("GEN", 1)).toEqual(afterRiding);
  });

  it("bulk patch records per-chapter selections (undo/redo replay)", () => {
    const wf = new WorkingFilesStore([makeBook({ bookCode: "GEN" })]);

    wf.commit({
      patch: {
        kind: "bulk",
        files: wf.read(),
        selections: [
          { bookCode: "GEN", chapter: 1, selection: cursorAt("t9", 4) },
          { bookCode: "GEN", chapter: 2, selection: null },
        ],
      },
      meta: makeCommitMeta({ kind: "undo", bookCode: "GEN", chapter: 1 }),
    });

    expect(wf.readSelectionFact("GEN", 1)?.selection).toEqual(
      cursorAt("t9", 4),
    );
    expect(wf.readSelectionFact("GEN", 2)?.selection).toBeNull();
    // Plain bulk (no selections field) leaves facts untouched.
    const before = wf.readSelectionFact("GEN", 1);
    wf.commit({
      patch: { kind: "bulk", files: wf.read() },
      meta: makeCommitMeta({ kind: "import", bookCode: "GEN", chapter: 1 }),
    });
    expect(wf.readSelectionFact("GEN", 1)).toEqual(before);
  });

  it("facts are isolated per chapter and cleared by reset()", () => {
    const wf = new WorkingFilesStore([makeBook({ bookCode: "GEN" })]);

    wf.commit({
      patch: {
        kind: "selectionOnly",
        bookCode: "GEN",
        chapter: 1,
        selection: cursorAt("t1", 0),
      },
      meta: selectionOnlyMeta("GEN", 1),
    });

    expect(wf.readSelectionFact("GEN", 2)).toBeNull();
    expect(wf.readSelectionFact("EXO", 1)).toBeNull();

    wf.reset(wf.read());
    expect(wf.readSelectionFact("GEN", 1)).toBeNull();
  });
});
