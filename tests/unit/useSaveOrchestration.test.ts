import { describe, expect, it } from "vitest";

import type { AppliedProjection } from "@/app/domain/project/compare/applyProjection.ts";
import { CompareSessionController } from "@/app/domain/project/compare/CompareSessionController.ts";
import {
  buildApplySaveOptions,
  replaceCompareSource,
  requiresIncomingFlowGuard,
} from "@/app/domain/project/compare/reviewOrchestration.ts";
import { buildCompareSourcePair } from "@/app/domain/project/compare/sourceDescriptors.ts";
import type { CompareSourceDescriptor } from "@/app/domain/project/compare/types.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type {
  DiffScopeItem,
  DiffSkeleton,
  MergeRequest,
  Token,
} from "@/core/domain/usfm/usfmOnionTypes.ts";

function descriptor(
  kind: "saved" | "working" | "existingProject" | "previousVersion",
): CompareSourceDescriptor {
  const projectId = kind === "existingProject" ? "other" : "current";
  const locator =
    kind === "previousVersion"
      ? ({ kind, projectId, oid: "old" } as const)
      : ({ kind, projectId } as const);
  return {
    id: kind,
    label: kind,
    locator,
    writable: kind === "working",
    reload: async () => ({ files: [] }),
  };
}

const saved = descriptor("saved");
const working = descriptor("working");
const external = descriptor("existingProject");
const oldVersion = descriptor("previousVersion");

describe("useSave orchestration contracts", () => {
  it("replaces either physical side symmetrically and never produces two Working sides", () => {
    const initial = buildCompareSourcePair({ left: saved, right: working });

    const workingOnLeft = replaceCompareSource({
      activeSources: initial,
      side: "left",
      descriptor: working,
      defaultLeft: saved,
      defaultRight: working,
      savedFallback: saved,
    });
    expect(workingOnLeft).toMatchObject({
      left: { locator: { kind: "working" } },
      right: { locator: { kind: "saved" } },
      writableSide: "left",
    });

    const externalOnRight = replaceCompareSource({
      activeSources: workingOnLeft,
      side: "right",
      descriptor: external,
      defaultLeft: saved,
      defaultRight: working,
      savedFallback: saved,
    });
    expect(externalOnRight).toMatchObject({
      left: { locator: { kind: "working" } },
      right: { locator: { kind: "existingProject" } },
      writableSide: "left",
    });

    const workingOnRight = replaceCompareSource({
      activeSources: externalOnRight,
      side: "right",
      descriptor: working,
      defaultLeft: saved,
      defaultRight: working,
      savedFallback: saved,
    });
    expect(workingOnRight).toMatchObject({
      left: { locator: { kind: "saved" } },
      right: { locator: { kind: "working" } },
      writableSide: "right",
    });
  });

  it("guards only writable external reconciliation, not side order or read-only inspection", () => {
    expect(
      requiresIncomingFlowGuard(
        buildCompareSourcePair({ left: saved, right: working }),
      ),
    ).toBe(false);
    expect(
      requiresIncomingFlowGuard(
        buildCompareSourcePair({ left: working, right: saved }),
      ),
    ).toBe(false);
    expect(
      requiresIncomingFlowGuard(
        buildCompareSourcePair({ left: external, right: oldVersion }),
      ),
    ).toBe(false);
    expect(
      requiresIncomingFlowGuard(
        buildCompareSourcePair({ left: working, right: external }),
      ),
    ).toBe(true);
  });

  it("passes deletion metadata from the committed artifact unchanged into save", () => {
    const deletedBookCodes = Object.freeze(["EXO"]);
    const structurallyChangedBookCodes = Object.freeze(["GEN"]);
    const applied = {
      files: [],
      changedChapters: [],
      deletedBookCodes,
      structurallyChangedBookCodes,
    } satisfies AppliedProjection;

    const unsaved = buildApplySaveOptions({
      sources: buildCompareSourcePair({ left: working, right: saved }),
      applied,
    });
    expect(unsaved.reviewedRecoveredWork).toBe(true);
    expect(unsaved.deletedBookCodes).toBe(deletedBookCodes);
    expect(unsaved.structurallyChangedBookCodes).toBe(
      structurallyChangedBookCodes,
    );

    const incoming = buildApplySaveOptions({
      sources: buildCompareSourcePair({ left: working, right: external }),
      applied,
    });
    expect(incoming.reviewedRecoveredWork).toBe(false);
  });
});

const leftToken: Token = {
  id: "left",
  kind: "text",
  source: "saved",
  sid: "GEN 1:1",
};
const rightToken: Token = {
  id: "right",
  kind: "text",
  source: "working",
  sid: "GEN 1:1",
};
const skeleton: DiffSkeleton = {
  slots: [{ unitId: "change", role: "pairCurrent" }],
  units: [
    {
      id: "change",
      kind: "coalesced",
      status: "modified",
      baselineSid: "GEN 1:1",
      currentSid: "GEN 1:1",
      baselineTokens: [leftToken],
      currentTokens: [rightToken],
      displaced: false,
      relabeled: false,
      dupContext: { baselineCount: 1, currentCount: 1 },
      isWhitespaceChange: false,
      isUsfmStructureChange: false,
    },
  ],
};

function book(): ScriptureBookState {
  return {
    path: "/GEN.usfm",
    title: "Genesis",
    bookCode: "GEN",
    nextBookId: null,
    prevBookId: null,
    chapters: [
      {
        chapterNumber: 1,
        sourceTokens: [leftToken],
        currentTokens: [rightToken],
        dirty: true,
        eol: "\n",
        direction: "ltr",
      },
    ],
  };
}

function controllerService(): IUsfmOnionService {
  return {
    diffScope: async (scope: DiffScopeItem[]) => scope.map(() => skeleton),
    mergeDiffBlocks: async (
      _left: readonly Token[],
      _right: readonly Token[],
      request: MergeRequest,
    ) => (request.decisions.change === "current" ? [rightToken] : [leftToken]),
  } as unknown as IUsfmOnionService;
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Apply receipt lifecycle", () => {
  it("applies the exact preview artifact and retains its receipt until Refresh", async () => {
    const store = new WorkingFilesStore([book()]);
    const controller = new CompareSessionController({
      workingFilesStore: store,
      usfmOnionService: controllerService(),
    });
    await controller.open({
      left: { ...saved, reload: async () => ({ files: [book()] }) },
      right: {
        ...working,
        reload: async () => ({ files: store.read() }),
      },
    });
    await tick();

    const ready = controller.getSnapshot();
    expect(ready.status).toBe("active");
    if (ready.status !== "active" || ready.projection.status !== "ready")
      return;
    const previewArtifact = ready.projection.artifact;
    const context = controller.beginApply();
    expect(context.artifact).toBe(previewArtifact);

    controller.completeApply(context);
    let state = controller.getSnapshot();
    expect(state.status === "active" && state.session.lifecycle).toEqual({
      status: "applied",
      projectionRevision: context.revision,
    });

    await controller.refresh();
    await tick();
    state = controller.getSnapshot();
    expect(state.status === "active" && state.session.lifecycle.status).toBe(
      "ready",
    );
    if (state.status === "active") {
      expect(state.session.id).not.toBe(context.sessionId);
    }
    await controller.close();
  });
});
