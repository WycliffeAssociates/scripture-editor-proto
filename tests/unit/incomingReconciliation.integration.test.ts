// incomingReconciliation.integration.test.ts
//
// Pins the incoming-reconciliation CONTRACT end-to-end through the seam the
// useExternalCompare executor relocation must preserve: the pure
// planner splits remote diffs by dirty-semantic-SID, and applyIncomingToStore
// applies only the SAFE chapters to a real WorkingFilesStore — a chapter whose
// incoming diff overlaps the user's dirty edits is left for manual review, not
// auto-clobbered.
//
// The planner (incomingReconciliationPlan) and the apply mechanics
// (applyIncomingToStore) each have focused unit tests; this asserts they
// COMPOSE into the right merge policy, so the executor can move with a parity net.

import { describe, expect, it } from "vitest";
import { applyIncomingToStore } from "@/app/domain/project/compare/applyIncomingToStore.ts";
import type { DiffsByChapter, ProjectDiff } from "@/app/domain/project/diffTypes.ts";
import {
  buildAutoAcceptIncomingPlan,
  splitRemoteDiffsByDirtySemanticSid,
} from "@/app/domain/project/remoteSync/incomingReconciliationPlan.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import { WorkspaceGateStore } from "@/app/state/WorkspaceInteractionGate.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";

function book(bookCode: string, current: string, source = current) {
  return {
    path: `/userData/projects/demo/${bookCode}.usfm`,
    title: bookCode,
    bookCode,
    nextBookId: null,
    prevBookId: null,
    chapters: [
      {
        chapterNumber: 1,
        dirty: current !== source,
        sourceTokens: [{ kind: "text", source, id: `s-${bookCode}` }],
        currentTokens: [{ kind: "text", source: current, id: `c-${bookCode}` }],
        lexicalState: { root: { children: [], direction: "ltr" } },
        loadedLexicalState: { root: { children: [], direction: "ltr" } },
      },
    ],
  } as unknown as ScriptureBookState;
}

function diff(bookCode: string, semanticSid: string): ProjectDiff {
  return {
    uniqueKey: `${semanticSid}-key`,
    semanticSid,
    status: "modified",
    originalDisplayText: "",
    currentDisplayText: "",
    bookCode,
    chapterNum: 1,
  } as ProjectDiff;
}

function contentOf(store: WorkingFilesStore, bookCode: string) {
  return (
    store
      .read()
      .find((b) => b.bookCode === bookCode)
      ?.chapters[0].currentTokens.map((t) => t.source)
      .join("") ?? ""
  );
}

describe("incoming reconciliation: dirty-SID split → safe apply", () => {
  it("auto-applies the clean chapter and leaves the dirty-overlapping one for review", async () => {
    // GEN clean; EXO has an unsaved local edit on semantic SID "EXO 1:1".
    const store = new WorkingFilesStore([
      book("GEN", "gen-local"),
      book("EXO", "exo-edited", "exo-source"),
    ]);

    // Remote brings a diff to BOTH chapters.
    const initialDiffsByChapter: DiffsByChapter = {
      GEN: { 1: [diff("GEN", "GEN 1:1")] },
      EXO: { 1: [diff("EXO", "EXO 1:1")] },
    };
    // The user's dirty edit overlaps EXO 1:1 → that diff is blocked.
    const dirtySemanticSidsByChapter = new Map([["EXO:1", new Set(["EXO 1:1"])]]);

    const { blockedDiffsByChapter } = splitRemoteDiffsByDirtySemanticSid({
      diffsByChapter: initialDiffsByChapter,
      dirtySemanticSidsByChapter,
    });
    const { fullChapterApplies, hunkApplies } = buildAutoAcceptIncomingPlan({
      initialDiffsByChapter,
      blockedDiffsByChapter,
    });

    // GEN is fully safe → full-chapter apply; EXO is fully blocked.
    expect(fullChapterApplies).toEqual([{ bookCode: "GEN", chapterNum: 1 }]);
    expect(hunkApplies).toEqual([]);

    const result = await applyIncomingToStore({
      workingFilesStore: store,
      interactionGate: new WorkspaceGateStore(),
      usfmOnionService: {} as unknown as IUsfmOnionService, // no hunks → unused
      fullChapterApplies,
      hunkApplies,
      sourceFiles: [book("GEN", "gen-incoming"), book("EXO", "exo-incoming")],
        shape: "flat",
    });

    expect(result.kind).toBe("committed");
    // Safe chapter took the incoming content...
    expect(contentOf(store, "GEN")).toBe("gen-incoming");
    // ...the dirty-overlapping chapter was NOT clobbered (left for review).
    expect(contentOf(store, "EXO")).toBe("exo-edited");
  });

  it("blocks the whole reconcile (empty plan) when every incoming diff overlaps dirty work", async () => {
    const store = new WorkingFilesStore([book("GEN", "gen-edited", "gen-src")]);
    const initialDiffsByChapter: DiffsByChapter = {
      GEN: { 1: [diff("GEN", "GEN 1:1")] },
    };
    const { blockedDiffsByChapter } = splitRemoteDiffsByDirtySemanticSid({
      diffsByChapter: initialDiffsByChapter,
      dirtySemanticSidsByChapter: new Map([["GEN:1", new Set(["GEN 1:1"])]]),
    });
    const { fullChapterApplies, hunkApplies } = buildAutoAcceptIncomingPlan({
      initialDiffsByChapter,
      blockedDiffsByChapter,
    });

    expect(fullChapterApplies).toEqual([]);
    expect(hunkApplies).toEqual([]);

    const result = await applyIncomingToStore({
      workingFilesStore: store,
      interactionGate: new WorkspaceGateStore(),
      usfmOnionService: {} as unknown as IUsfmOnionService,
      fullChapterApplies,
      hunkApplies,
      sourceFiles: [book("GEN", "gen-incoming")],
        shape: "flat",
    });

    // Nothing to apply → typed empty-plan abort, local edit preserved.
    expect(result).toMatchObject({ kind: "aborted", reason: "empty-plan" });
    expect(contentOf(store, "GEN")).toBe("gen-edited");
  });
});
