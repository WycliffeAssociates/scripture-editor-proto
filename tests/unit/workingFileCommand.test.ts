// workingFileCommand.test.ts
//
// The lost-update + post-commit contract for the ACTIVE working-files mutation
// seam, now on the recording-draft checkout shape. Real WorkingFilesStore +
// WorkspaceGateStore; the mutator is a plain fn so we can inject a concurrent
// commit "during" its await. `affected` is MEASURED from checkouts, never
// declared — the mutators here check out the chapters/books they write.

import { describe, expect, it, vi } from "vitest";

import { withWorkingFilesDraft } from "@/app/domain/project/workingFileCommand.ts";
import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import { WorkspaceGateStore } from "@/app/state/WorkspaceInteractionGate.ts";

function chapter(
  chapterNumber: number,
  current: string,
  source = current,
): ScriptureChapterState {
  return {
    chapterNumber,
    dirty: current !== source,
    sourceTokens: [{ kind: "text", source, id: `s-${chapterNumber}` }],
    currentTokens: [
      { kind: "text", source: current, id: `c-${chapterNumber}` },
    ],
    lexicalState: { root: { children: [], direction: "ltr" } },
    loadedLexicalState: { root: { children: [], direction: "ltr" } },
  } as unknown as ScriptureChapterState;
}

function book(bookCode: string, ...chapters: ScriptureChapterState[]) {
  return {
    path: `/userData/projects/demo/${bookCode}.usfm`,
    title: bookCode,
    bookCode,
    nextBookId: null,
    prevBookId: null,
    chapters,
  } as ScriptureBookState;
}

function contentOf(store: WorkingFilesStore, bookCode: string, chap: number) {
  return (
    store
      .read()
      .find((b) => b.bookCode === bookCode)
      ?.chapters.find((c) => c.chapterNumber === chap)
      ?.currentTokens.map((t) => t.source)
      .join("") ?? ""
  );
}

const commitMeta = {
  kind: "programmaticFix",
  dirtyTextContent: true,
} as const;

function tokens(source: string, id: string) {
  return [{ kind: "text", source, id }] as never;
}

describe("withWorkingFilesDraft", () => {
  it("commits once, overlays only affected chapters, and returns the committed result", async () => {
    const store = new WorkingFilesStore([
      book("GEN", chapter(1, "gen1"), chapter(2, "gen2")),
    ]);
    const gate = new WorkspaceGateStore();
    const commitSpy = vi.spyOn(store, "commit");

    const result = await withWorkingFilesDraft({
      workingFilesStore: store,
      interactionGate: gate,
      commitMeta,
      mutate: async (draft) => {
        const ch = draft.chapterForWrite({ bookCode: "GEN", chapterNum: 1 });
        if (ch) ch.currentTokens = tokens("gen1-formatted", "c-new");
        return "gen1-formatted";
      },
    });

    // The typed result carries the committed chapters + value — the
    // caller's follow-through (toast, report) sequences on this.
    expect(result).toEqual({
      kind: "committed",
      value: "gen1-formatted",
      committedChapters: [{ bookCode: "GEN", chapterNum: 1 }],
    });
    expect(commitSpy).toHaveBeenCalledTimes(1);
    expect(contentOf(store, "GEN", 1)).toBe("gen1-formatted");
    // Untouched chapter aliased through.
    expect(contentOf(store, "GEN", 2)).toBe("gen2");
    // A pure chapter checkout stamps a chapter list, never project:true.
    expect(commitSpy.mock.calls[0][0].meta.scope).toEqual({
      chapters: [{ bookCode: "GEN", chapterNum: 1 }],
    });
  });

  it("preserves a concurrent commit to a DIFFERENT chapter (overlay, not clobber)", async () => {
    const store = new WorkingFilesStore([
      book("GEN", chapter(1, "gen1"), chapter(2, "gen2")),
    ]);
    const gate = new WorkspaceGateStore();

    const result = await withWorkingFilesDraft({
      workingFilesStore: store,
      interactionGate: gate,
      commitMeta,
      mutate: async (draft) => {
        // Simulate a concurrent user edit to chapter 2 landing mid-await.
        const concurrent = store.draftWithChapters([
          { bookCode: "GEN", chapterNum: 2 },
        ]);
        const ch2 = concurrent[0].chapters.find((c) => c.chapterNumber === 2);
        if (ch2) ch2.currentTokens = tokens("gen2-edited", "c2e");
        store.commit({
          patch: { kind: "bulk", files: concurrent },
          meta: { ...commitMeta, scope: { project: true } },
        });
        const ch = draft.chapterForWrite({ bookCode: "GEN", chapterNum: 1 });
        if (ch) ch.currentTokens = tokens("gen1-formatted", "c-new");
        return "gen1-formatted";
      },
    });

    expect(result.kind).toBe("committed");
    expect(contentOf(store, "GEN", 1)).toBe("gen1-formatted");
    // The concurrent edit to ch2 survived — NOT clobbered by a stale bulk.
    expect(contentOf(store, "GEN", 2)).toBe("gen2-edited");
  });

  it("aborts (stale-chapter) when an AFFECTED chapter changed during the mutation", async () => {
    const store = new WorkingFilesStore([book("GEN", chapter(1, "gen1"))]);
    const gate = new WorkspaceGateStore();
    const commitSpy = vi.spyOn(store, "commit");

    const result = await withWorkingFilesDraft({
      workingFilesStore: store,
      interactionGate: gate,
      commitMeta,
      mutate: async (draft) => {
        // Check out FIRST (records the pre-image), then a concurrent commit
        // replaces GEN:1's object identity → staleness must abort.
        const ch = draft.chapterForWrite({ bookCode: "GEN", chapterNum: 1 });
        if (ch) ch.currentTokens = tokens("gen1-formatted", "c-new");
        const concurrent = store.draftWithChapters([
          { bookCode: "GEN", chapterNum: 1 },
        ]);
        concurrent[0].chapters[0].currentTokens = tokens("gen1-user", "cu");
        store.commit({
          patch: { kind: "bulk", files: concurrent },
          meta: { ...commitMeta, scope: { project: true } },
        });
        return "gen1-formatted";
      },
    });

    expect(result).toEqual({ kind: "aborted", reason: "stale-chapter" });
    // Only the concurrent commit ran; the stale mutation did NOT commit.
    expect(commitSpy).toHaveBeenCalledTimes(1);
    expect(contentOf(store, "GEN", 1)).toBe("gen1-user");
  });

  it("aborts (gate-closed) without committing", async () => {
    const store = new WorkingFilesStore([book("GEN", chapter(1, "gen1"))]);
    const gate = new WorkspaceGateStore({ kind: "saving" });
    const commitSpy = vi.spyOn(store, "commit");

    const result = await withWorkingFilesDraft({
      workingFilesStore: store,
      interactionGate: gate,
      commitMeta,
      mutate: async (draft) => {
        const ch = draft.chapterForWrite({ bookCode: "GEN", chapterNum: 1 });
        if (ch) ch.currentTokens = tokens("gen1-formatted", "c-new");
        return "gen1-formatted";
      },
    });

    // The contract: callers branch on `kind` before any follow-through,
    // so a write that never landed publishes no side effect.
    expect(result).toEqual({ kind: "aborted", reason: "gate-closed" });
    expect(commitSpy).not.toHaveBeenCalled();
  });

  describe("wholesale book (bookForWrite)", () => {
    it("commits the draft as a bulk after validating no concurrent commit", async () => {
      const store = new WorkingFilesStore([
        book("GEN", chapter(1, "gen1")),
        book("EXO", chapter(1, "exo1")),
      ]);
      const gate = new WorkspaceGateStore();
      const commitSpy = vi.spyOn(store, "commit");

      const result = await withWorkingFilesDraft({
        workingFilesStore: store,
        interactionGate: gate,
        commitMeta,
        // Simulate a wholesale rebuild: replace GEN's chapters array.
        mutate: async (draft) => {
          const gen = draft.bookForWrite("GEN");
          if (gen)
            gen.chapters = [chapter(1, "gen1-rebuilt"), chapter(2, "gen2-new")];
          return undefined;
        },
      });

      expect(result.kind).toBe("committed");
      expect(contentOf(store, "GEN", 1)).toBe("gen1-rebuilt");
      // A chapter ADDED by the rebuild survives (overlay couldn't do this).
      expect(contentOf(store, "GEN", 2)).toBe("gen2-new");
      // Chapter SET changed (added ch2) → project:true.
      expect(commitSpy.mock.calls[0][0].meta.scope).toEqual({ project: true });
    });

    it("stamps a chapter list when a wholesale rebuild keeps the same chapter set", async () => {
      const store = new WorkingFilesStore([book("GEN", chapter(1, "gen1"))]);
      const gate = new WorkspaceGateStore();
      const commitSpy = vi.spyOn(store, "commit");

      await withWorkingFilesDraft({
        workingFilesStore: store,
        interactionGate: gate,
        commitMeta,
        mutate: async (draft) => {
          const gen = draft.bookForWrite("GEN");
          if (gen) gen.chapters = [chapter(1, "gen1-rebuilt")];
          return undefined;
        },
      });

      expect(commitSpy.mock.calls[0][0].meta.scope).toEqual({
        chapters: [{ bookCode: "GEN", chapterNum: 1 }],
      });
    });

    it("aborts (stale-workspace) if ANY concurrent commit landed", async () => {
      const store = new WorkingFilesStore([
        book("GEN", chapter(1, "gen1")),
        book("EXO", chapter(1, "exo1")),
      ]);
      const gate = new WorkspaceGateStore();
      const commitSpy = vi.spyOn(store, "commit");

      const result = await withWorkingFilesDraft({
        workingFilesStore: store,
        interactionGate: gate,
        commitMeta,
        mutate: async (draft) => {
          const gen = draft.bookForWrite("GEN");
          if (gen) gen.chapters = [chapter(1, "gen1-rebuilt")];
          // Concurrent commit to a book this draft checked out replaces read().
          const concurrent = store.draftWithChapters([
            { bookCode: "GEN", chapterNum: 1 },
          ]);
          concurrent[0].chapters[0].currentTokens = tokens("gen1-user", "gu");
          store.commit({
            patch: { kind: "bulk", files: concurrent },
            meta: { ...commitMeta, scope: { project: true } },
          });
          return undefined;
        },
      });

      expect(result).toEqual({ kind: "aborted", reason: "stale-workspace" });
      // Only the concurrent commit ran; the stale rebuild did NOT clobber it.
      expect(commitSpy).toHaveBeenCalledTimes(1);
      expect(contentOf(store, "GEN", 1)).toBe("gen1-user");
    });

    it("aborts (stale-workspace) when a concurrent commit lands on an UNRELATED book", async () => {
      const store = new WorkingFilesStore([
        book("GEN", chapter(1, "gen1")),
        book("EXO", chapter(1, "exo1")),
      ]);
      const gate = new WorkspaceGateStore();
      const commitSpy = vi.spyOn(store, "commit");

      const result = await withWorkingFilesDraft({
        workingFilesStore: store,
        interactionGate: gate,
        commitMeta,
        mutate: async (draft) => {
          // The rebuild touches only GEN, but a bulk commit writes the draft's
          // whole `files` array — so a concurrent commit to EXO (outside the
          // affected set) would be clobbered. Whole-state identity must abort.
          const gen = draft.bookForWrite("GEN");
          if (gen) gen.chapters = [chapter(1, "gen1-rebuilt")];
          const concurrent = store.draftWithChapters([
            { bookCode: "EXO", chapterNum: 1 },
          ]);
          const exo = concurrent
            .find((b) => b.bookCode === "EXO")
            ?.chapters.find((c) => c.chapterNumber === 1);
          if (exo) exo.currentTokens = tokens("exo1-user", "eu");
          store.commit({
            patch: { kind: "bulk", files: concurrent },
            meta: { ...commitMeta, scope: { project: true } },
          });
          return undefined;
        },
      });

      expect(result).toEqual({ kind: "aborted", reason: "stale-workspace" });
      // Only the concurrent commit ran; the unrelated EXO edit survived.
      expect(commitSpy).toHaveBeenCalledTimes(1);
      expect(contentOf(store, "EXO", 1)).toBe("exo1-user");
    });
  });

  it("returns unchanged (no commit) when nothing was checked out", async () => {
    const store = new WorkingFilesStore([book("GEN", chapter(1, "gen1"))]);
    const gate = new WorkspaceGateStore();
    const commitSpy = vi.spyOn(store, "commit");

    const result = await withWorkingFilesDraft({
      workingFilesStore: store,
      interactionGate: gate,
      commitMeta,
      mutate: async () => "noop",
    });

    expect(result).toEqual({ kind: "unchanged", value: "noop" });
    expect(commitSpy).not.toHaveBeenCalled();
  });
});
