import { describe, expect, it } from "vitest";

import { applyIncomingToStore } from "@/app/domain/project/compare/applyIncomingToStore.ts";
import { projectCompareRevision } from "@/app/domain/project/compare/projection.ts";
import { buildCompareSourcePair } from "@/app/domain/project/compare/sourceDescriptors.ts";
import type {
  CompareResult,
  CompareSourceDescriptor,
} from "@/app/domain/project/compare/types.ts";
import { buildAutoAcceptIncomingDecisionPlan } from "@/app/domain/project/remoteSync/incomingReconciliationPlan.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import { WorkspaceGateStore } from "@/app/state/WorkspaceInteractionGate.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { DecisionUnit, Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

function descriptor(kind: "working" | "remoteLatest", writable = false) {
  return {
    id: kind,
    label: kind,
    locator: { kind, projectId: "p" },
    writable,
    reload: async () => ({ files: [] }),
  } as CompareSourceDescriptor;
}

function text(id: string, sid: string, source: string): Token {
  return { id, kind: "text", sid, source };
}

function unit(
  id: string,
  sid: string,
  left: string,
  right: string,
): DecisionUnit {
  return {
    id,
    kind: "coalesced",
    status: "modified",
    baselineSid: sid,
    currentSid: sid,
    baselineTokens: [text(`${id}-l`, sid, left)],
    currentTokens: [text(`${id}-r`, sid, right)],
    displaced: false,
    relabeled: false,
    dupContext: { baselineCount: 1, currentCount: 1 },
    isWhitespaceChange: false,
    isUsfmStructureChange: false,
  };
}

describe("incoming skeleton decision -> projection -> validated store commit", () => {
  it("applies safe incoming content while preserving dirty-overlapping content", async () => {
    const safe = unit("safe", "GEN 1:1", "local-one", "remote-one");
    const blocked = unit("blocked", "GEN 1:2", "local-two", "remote-two");
    const leftTokens = [...safe.baselineTokens, ...blocked.baselineTokens];
    const rightTokens = [...safe.currentTokens, ...blocked.currentTokens];
    const bookMeta = {
      path: "/GEN.usfm",
      title: "Genesis",
      bookCode: "GEN",
      nextBookId: null,
      prevBookId: null,
    };
    const snapshot: CompareResult = {
      sources: buildCompareSourcePair({
        left: descriptor("working", true),
        right: descriptor("remoteLatest"),
      }),
      chapters: {
        GEN: {
          1: {
            address: { bookCode: "GEN", chapterNum: 1 },
            left: {
              present: true,
              dirty: true,
              eol: "\n",
              direction: "ltr",
              book: bookMeta,
              tokens: leftTokens,
            },
            right: {
              present: true,
              dirty: false,
              eol: "\n",
              direction: "ltr",
              book: bookMeta,
              tokens: rightTokens,
            },
            skeleton: {
              slots: [
                { unitId: "safe", role: "pairBaseline" },
                { unitId: "blocked", role: "pairBaseline" },
              ],
              units: [safe, blocked],
            },
          },
        },
      },
      warnings: [],
      coverage: { leftOnly: [], rightOnly: [], overlapping: [] },
      changedUnitCount: 2,
    };
    const decisions = buildAutoAcceptIncomingDecisionPlan({
      snapshot,
      dirtySemanticSidsByChapter: new Map([["GEN:1", new Set(["GEN 1:2"])]]),
    });
    const service = {
      mergeDiffBlocks: async (
        _left: readonly Token[],
        _right: readonly Token[],
        request: { decisions: Record<string, "baseline" | "current"> },
      ) => [
        ...(request.decisions.safe === "current"
          ? safe.currentTokens
          : safe.baselineTokens),
        ...(request.decisions.blocked === "current"
          ? blocked.currentTokens
          : blocked.baselineTokens),
      ],
    } as unknown as IUsfmOnionService;
    const projection = await projectCompareRevision({
      snapshot,
      decisions: decisions.decisions,
      revision: 7,
      usfmOnionService: service,
    });
    const working: ScriptureBookState[] = [
      {
        ...bookMeta,
        chapters: [
          {
            chapterNumber: 1,
            dirty: true,
            direction: "ltr",
            eol: "\n",
            sourceTokens: leftTokens,
            currentTokens: leftTokens,
          },
        ],
      },
    ];
    const store = new WorkingFilesStore(working);
    const outcome = await applyIncomingToStore({
      workingFilesStore: store,
      interactionGate: new WorkspaceGateStore(),
      artifact: projection,
    });
    expect(outcome.kind).toBe("committed");
    expect(
      store.read()[0]?.chapters[0]?.currentTokens.map((token) => token.source),
    ).toEqual(["remote-one", "local-two"]);
  });
});
