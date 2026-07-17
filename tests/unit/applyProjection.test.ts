import { describe, expect, it } from "vitest";

import { applyCompareProjectionToStore } from "@/app/domain/project/compare/applyProjection.ts";
import type { CompareProjectionArtifact } from "@/app/domain/project/compare/projection.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import { WorkspaceGateStore } from "@/app/state/WorkspaceInteractionGate.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

function tokens(source: string, sid = "GEN 1:1"): Token[] {
  return [{ id: source, kind: "text", source, sid }];
}

function book(chapters = [1, 2]): ScriptureBookState {
  return {
    path: "/project/01-GEN.usfm",
    title: "Genesis",
    bookCode: "GEN",
    nextBookId: null,
    prevBookId: null,
    chapters: chapters.map((chapterNumber) => ({
      chapterNumber,
      sourceTokens: tokens(`saved-${chapterNumber}`, `GEN ${chapterNumber}:1`),
      currentTokens: tokens(
        `working-${chapterNumber}`,
        `GEN ${chapterNumber}:1`,
      ),
      dirty: true,
      eol: "\n" as const,
      direction: "ltr" as const,
    })),
  };
}

function artifact(
  chapters: CompareProjectionArtifact["chapters"],
): CompareProjectionArtifact {
  return Object.freeze({
    revision: 3,
    chapters: Object.freeze(chapters),
    unresolved: Object.freeze([]),
    complete: true,
  });
}

describe("applyCompareProjectionToStore", () => {
  it("commits the exact projected tokens without running merge again", () => {
    const initial = [book()];
    const store = new WorkingFilesStore(initial);
    const projected = tokens("chosen");

    const result = applyCompareProjectionToStore({
      workingFilesStore: store,
      interactionGate: new WorkspaceGateStore(),
      snapshotFiles: initial,
      currentRevision: 3,
      artifact: artifact([
        {
          address: { bookCode: "GEN", chapterNum: 1 },
          tokens: projected,
          present: true,
          eol: "\n",
          direction: "ltr",
          book: null,
          structuralAction: "update",
        },
      ]),
    });

    expect(result.kind).toBe("committed");
    expect(store.read()[0]?.chapters[0]?.currentTokens).toEqual(projected);
    expect(store.read()[0]?.chapters[1]).toBe(initial[0]?.chapters[1]);
  });

  it("keeps a Saved-side projection dirty until the persistence event rebases it", () => {
    const initial = [book([1])];
    const store = new WorkingFilesStore(initial);
    const saved = initial[0]?.chapters[0]?.sourceTokens ?? [];

    const result = applyCompareProjectionToStore({
      workingFilesStore: store,
      interactionGate: new WorkspaceGateStore(),
      snapshotFiles: initial,
      currentRevision: 3,
      artifact: artifact([
        {
          address: { bookCode: "GEN", chapterNum: 1 },
          tokens: saved,
          present: true,
          eol: "\n",
          direction: "ltr",
          book: null,
          structuralAction: "update",
        },
      ]),
    });

    expect(result.kind).toBe("committed");
    expect(store.read()[0]?.chapters[0]).toMatchObject({
      currentTokens: saved,
      dirty: true,
    });
  });

  it("removes a chapter and reports that its remaining book must persist", () => {
    const initial = [book()];
    const store = new WorkingFilesStore(initial);

    const result = applyCompareProjectionToStore({
      workingFilesStore: store,
      interactionGate: new WorkspaceGateStore(),
      snapshotFiles: initial,
      currentRevision: 3,
      artifact: artifact([
        {
          address: { bookCode: "GEN", chapterNum: 1 },
          tokens: [],
          present: false,
          eol: null,
          direction: null,
          book: null,
          structuralAction: "delete",
        },
      ]),
    });

    expect(result).toMatchObject({
      kind: "committed",
      applied: { structurallyChangedBookCodes: ["GEN"], deletedBookCodes: [] },
    });
    expect(
      store.read()[0]?.chapters.map((chapter) => chapter.chapterNumber),
    ).toEqual([2]);
  });

  it("removes the book when its last chapter is deleted", () => {
    const initial = [book([1])];
    const store = new WorkingFilesStore(initial);

    const result = applyCompareProjectionToStore({
      workingFilesStore: store,
      interactionGate: new WorkspaceGateStore(),
      snapshotFiles: initial,
      currentRevision: 3,
      artifact: artifact([
        {
          address: { bookCode: "GEN", chapterNum: 1 },
          tokens: [],
          present: false,
          eol: null,
          direction: null,
          book: null,
          structuralAction: "delete",
        },
      ]),
    });

    expect(result).toMatchObject({
      kind: "committed",
      applied: { deletedBookCodes: ["GEN"] },
    });
    expect(store.read()).toEqual([]);
  });

  it("refuses a frozen projection after any workspace commit", () => {
    const initial = [book()];
    const store = new WorkingFilesStore(initial);
    store.commit({
      patch: { kind: "metadata", bookCode: "GEN", chapter: 1, dirty: false },
      meta: {
        kind: "metadataOnly",
        action: "saveCleanMark",
        scope: { chapters: [{ bookCode: "GEN", chapterNum: 1 }] },
        dirtyTextContent: false,
      },
    });

    const result = applyCompareProjectionToStore({
      workingFilesStore: store,
      interactionGate: new WorkspaceGateStore(),
      snapshotFiles: initial,
      currentRevision: 3,
      artifact: artifact([]),
    });

    expect(result).toEqual({ kind: "aborted", reason: "stale-workspace" });
  });
});
