// workingFileCommand.test.ts
//
// The lost-update + post-commit contract for the ACTIVE working-files mutation
// seam. Real WorkingFilesStore + WorkspaceGateStore; the mutator is a plain fn
// so we can inject a concurrent commit "during" its await.

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
  scope: { project: true },
  dirtyTextContent: true,
} as const;

/** Mutator that rewrites GEN:1's content and reports it changed. */
function rewriteGen1(to: string) {
  return async (scratch: ScriptureBookState[]) => {
    const ch = scratch
      .find((b) => b.bookCode === "GEN")
      ?.chapters.find((c) => c.chapterNumber === 1);
    if (ch)
      ch.currentTokens = [{ kind: "text", source: to, id: "c-new" }] as never;
    return { affected: [{ bookCode: "GEN", chapterNum: 1 }], value: to };
  };
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
      draftRefs: [{ bookCode: "GEN", chapterNum: 1 }],
      commitMeta,
      mutate: rewriteGen1("gen1-formatted"),
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
  });

  it("preserves a concurrent commit to a DIFFERENT chapter (overlay, not clobber)", async () => {
    const store = new WorkingFilesStore([
      book("GEN", chapter(1, "gen1"), chapter(2, "gen2")),
    ]);
    const gate = new WorkspaceGateStore();

    const result = await withWorkingFilesDraft({
      workingFilesStore: store,
      interactionGate: gate,
      draftRefs: [{ bookCode: "GEN", chapterNum: 1 }],
      commitMeta,
      mutate: async (scratch) => {
        // Simulate a concurrent user edit to chapter 2 landing mid-await.
        const draft = store.draftWithChapters([
          { bookCode: "GEN", chapterNum: 2 },
        ]);
        const ch2 = draft[0].chapters.find((c) => c.chapterNumber === 2);
        if (ch2)
          ch2.currentTokens = [
            { kind: "text", source: "gen2-edited", id: "c2e" },
          ] as never;
        store.commit({
          patch: { kind: "bulk", files: draft },
          meta: commitMeta,
        });
        return (await rewriteGen1("gen1-formatted")(scratch)) as never;
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
      draftRefs: [{ bookCode: "GEN", chapterNum: 1 }],
      commitMeta,
      mutate: async (scratch) => {
        // Concurrent commit replaces GEN:1's object identity.
        const draft = store.draftWithChapters([
          { bookCode: "GEN", chapterNum: 1 },
        ]);
        const ch = draft[0].chapters[0];
        ch.currentTokens = [
          { kind: "text", source: "gen1-user", id: "cu" },
        ] as never;
        store.commit({
          patch: { kind: "bulk", files: draft },
          meta: commitMeta,
        });
        return (await rewriteGen1("gen1-formatted")(scratch)) as never;
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
      draftRefs: [{ bookCode: "GEN", chapterNum: 1 }],
      commitMeta,
      mutate: rewriteGen1("gen1-formatted"),
    });

    // The contract: callers branch on `kind` before any follow-through,
    // so a write that never landed publishes no side effect.
    expect(result).toEqual({ kind: "aborted", reason: "gate-closed" });
    expect(commitSpy).not.toHaveBeenCalled();
  });

  describe('scope: "workspace" (whole-state rebuild)', () => {
    it("commits the scratch bulk after validating no concurrent commit", async () => {
      const store = new WorkingFilesStore([
        book("GEN", chapter(1, "gen1")),
        book("EXO", chapter(1, "exo1")),
      ]);
      const gate = new WorkspaceGateStore();

      const result = await withWorkingFilesDraft({
        workingFilesStore: store,
        interactionGate: gate,
        draftRefs: [
          { bookCode: "GEN", chapterNum: 1 },
          { bookCode: "EXO", chapterNum: 1 },
        ],
        commitMeta,
        scope: "workspace",
        // Simulate a wholesale rebuild: replace GEN's chapters array.
        mutate: async (scratch) => {
          const gen = scratch.find((b) => b.bookCode === "GEN");
          if (gen)
            gen.chapters = [chapter(1, "gen1-rebuilt"), chapter(2, "gen2-new")];
          return {
            affected: [{ bookCode: "GEN", chapterNum: 1 }],
            value: undefined,
          };
        },
      });

      expect(result.kind).toBe("committed");
      expect(contentOf(store, "GEN", 1)).toBe("gen1-rebuilt");
      // A chapter ADDED by the rebuild survives (overlay couldn't do this).
      expect(contentOf(store, "GEN", 2)).toBe("gen2-new");
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
        draftRefs: [{ bookCode: "GEN", chapterNum: 1 }],
        commitMeta,
        scope: "workspace",
        mutate: async (scratch) => {
          // Concurrent commit to an unrelated book replaces read().
          const draft = store.draftWithChapters([
            { bookCode: "EXO", chapterNum: 1 },
          ]);
          const exo = draft.find((b) => b.bookCode === "EXO");
          if (exo)
            exo.chapters[0].currentTokens = [
              { kind: "text", source: "exo-edited", id: "e" },
            ] as never;
          store.commit({
            patch: { kind: "bulk", files: draft },
            meta: commitMeta,
          });
          const gen = scratch.find((b) => b.bookCode === "GEN");
          if (gen) gen.chapters = [chapter(1, "gen1-rebuilt")];
          return {
            affected: [{ bookCode: "GEN", chapterNum: 1 }],
            value: undefined,
          };
        },
      });

      expect(result).toEqual({ kind: "aborted", reason: "stale-workspace" });
      // Only the concurrent commit ran; the stale rebuild did NOT clobber it.
      expect(commitSpy).toHaveBeenCalledTimes(1);
      expect(contentOf(store, "EXO", 1)).toBe("exo-edited");
      expect(contentOf(store, "GEN", 1)).toBe("gen1");
    });
  });

  it("returns unchanged (no commit) when nothing was affected", async () => {
    const store = new WorkingFilesStore([book("GEN", chapter(1, "gen1"))]);
    const gate = new WorkspaceGateStore();
    const commitSpy = vi.spyOn(store, "commit");

    const result = await withWorkingFilesDraft({
      workingFilesStore: store,
      interactionGate: gate,
      draftRefs: [{ bookCode: "GEN", chapterNum: 1 }],
      commitMeta,
      mutate: async () => ({ affected: [], value: "noop" }),
    });

    expect(result).toEqual({ kind: "unchanged", value: "noop" });
    expect(commitSpy).not.toHaveBeenCalled();
  });
});
