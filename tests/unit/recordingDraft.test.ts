// recordingDraft.test.ts
//
// The recording draft is the canonical scope-fact reducer: obtaining write
// access IS the bookkeeping, so `affected` is measured from checkouts. These
// tests pin checkout idempotence, measured affected, originals capture, the
// shallow COW identity contract, and the wholesale chapter-set→project rule.

import { describe, expect, it } from "vitest";

import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import { makeRecordingDraft } from "@/app/state/recordingDraft.ts";

function chapter(chapterNumber: number, source: string): ScriptureChapterState {
  return {
    chapterNumber,
    dirty: false,
    eol: "\n",
    sourceTokens: [],
    currentTokens: [{ kind: "text", source, id: `c-${chapterNumber}` }],
    lexicalState: { root: { children: [], direction: "ltr" } },
    loadedLexicalState: { root: { children: [], direction: "ltr" } },
  } as unknown as ScriptureChapterState;
}

function book(bookCode: string, ...chapters: ScriptureChapterState[]) {
  return {
    path: `/p/${bookCode}.usfm`,
    title: bookCode,
    bookCode,
    nextBookId: null,
    prevBookId: null,
    chapters,
  } as ScriptureBookState;
}

function snapshot() {
  return [
    book("GEN", chapter(1, "gen1"), chapter(2, "gen2")),
    book("EXO", chapter(1, "exo1")),
  ];
}

describe("makeRecordingDraft", () => {
  it("measures affected from checkouts only", async () => {
    const draft = makeRecordingDraft(snapshot());
    draft.chapterForWrite({ bookCode: "GEN", chapterNum: 2 });
    const { affected } = draft.result();
    expect(affected).toEqual([{ bookCode: "GEN", chapterNum: 2 }]);
  });

  it("reports unchanged (empty affected) when nothing is checked out", () => {
    const draft = makeRecordingDraft(snapshot());
    draft.read(); // plain reads never record a checkout
    expect(draft.result().affected).toEqual([]);
  });

  it("re-checkout is idempotent — same writable object", () => {
    const draft = makeRecordingDraft(snapshot());
    const first = draft.chapterForWrite({ bookCode: "GEN", chapterNum: 1 });
    const second = draft.chapterForWrite({ bookCode: "GEN", chapterNum: 1 });
    expect(first).toBe(second);
    expect(draft.result().affected).toEqual([
      { bookCode: "GEN", chapterNum: 1 },
    ]);
  });

  it("shallow COW: copies array → book → chapter once, aliases the rest", () => {
    const initial = snapshot();
    const draft = makeRecordingDraft(initial);
    draft.chapterForWrite({ bookCode: "GEN", chapterNum: 1 });
    const next = draft.read();

    // Touched book + chapter are fresh objects.
    expect(next[0]).not.toBe(initial[0]);
    expect(next[0].chapters[0]).not.toBe(initial[0].chapters[0]);
    // Untouched sibling chapter and untouched book keep identity.
    expect(next[0].chapters[1]).toBe(initial[0].chapters[1]);
    expect(next[1]).toBe(initial[1]);
  });

  it("read() is a coherent merged view — later reads see earlier writes", () => {
    const draft = makeRecordingDraft(snapshot());
    const writable = draft.chapterForWrite({ bookCode: "GEN", chapterNum: 1 });
    if (writable)
      writable.currentTokens = [{ kind: "text", source: "edited", id: "x" }];
    const seen = draft
      .read()
      .find((b) => b.bookCode === "GEN")
      ?.chapters.find((c) => c.chapterNumber === 1)?.currentTokens[0].source;
    expect(seen).toBe("edited");
  });

  it("returns null for a missing chapter or book", () => {
    const draft = makeRecordingDraft(snapshot());
    expect(
      draft.chapterForWrite({ bookCode: "LEV", chapterNum: 1 }),
    ).toBeNull();
    expect(draft.bookForWrite("LEV")).toBeNull();
  });

  describe("bookForWrite (wholesale)", () => {
    it("checks out every chapter and reports POST-state chapters", () => {
      const draft = makeRecordingDraft(snapshot());
      const gen = draft.bookForWrite("GEN");
      if (gen)
        gen.chapters = [chapter(1, "r1"), chapter(2, "r2"), chapter(3, "r3")];
      const { affected, wholesaleBooks } = draft.result();
      expect(wholesaleBooks.has("GEN")).toBe(true);
      // Post-state chapters (the added ch3 included).
      expect(affected).toEqual([
        { bookCode: "GEN", chapterNum: 1 },
        { bookCode: "GEN", chapterNum: 2 },
        { bookCode: "GEN", chapterNum: 3 },
      ]);
    });

    it("records the pre-state chapter numbers for set-change detection", () => {
      const draft = makeRecordingDraft(snapshot());
      draft.bookForWrite("GEN");
      expect([
        ...(draft.result().wholesaleOriginalChapterNums.get("GEN") ?? []),
      ]).toEqual([1, 2]);
    });
  });
});
