import { describe, expect, it, vi } from "vitest";

import { CompareSessionController } from "@/app/domain/project/compare/CompareSessionController.ts";
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

function makeBook(): ScriptureBookState {
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

function descriptor(args: {
  kind: "saved" | "working" | "existingProject";
  writable?: boolean;
  files: () => ScriptureBookState[];
}): CompareSourceDescriptor {
  return {
    id: args.kind,
    label: args.kind,
    locator: { kind: args.kind, projectId: "project" },
    writable: args.writable ?? false,
    reload: async () => ({ files: args.files() }),
  };
}

function service(): IUsfmOnionService {
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

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("CompareSessionController", () => {
  it("opens Saved-vs-Working with Working selected and projects that revision", async () => {
    const store = new WorkingFilesStore([makeBook()]);
    const controller = new CompareSessionController({
      workingFilesStore: store,
      usfmOnionService: service(),
    });

    await controller.open({
      left: descriptor({ kind: "saved", files: () => [makeBook()] }),
      right: descriptor({
        kind: "working",
        writable: true,
        files: () => store.read(),
      }),
    });
    await tick();

    const state = controller.getSnapshot();
    expect(state.status).toBe("active");
    if (state.status !== "active") return;
    expect(state.session.decisions.GEN?.[1]?.units).toEqual({
      change: "right",
    });
    expect(state.projection).toMatchObject({
      status: "ready",
      artifact: { complete: true, revision: 0 },
    });
    await controller.close();
  });

  it("does not stale on selection-only commits but stales on content commits", async () => {
    const store = new WorkingFilesStore([makeBook()]);
    const controller = new CompareSessionController({
      workingFilesStore: store,
      usfmOnionService: service(),
    });
    await controller.open({
      left: descriptor({ kind: "saved", files: () => [makeBook()] }),
      right: descriptor({
        kind: "working",
        writable: true,
        files: () => store.read(),
      }),
    });

    store.commit({
      patch: {
        kind: "selectionOnly",
        bookCode: "GEN",
        chapter: 1,
        selection: null,
      },
      meta: {
        kind: "metadataOnly",
        scope: { chapters: [{ bookCode: "GEN", chapterNum: 1 }] },
        dirtyTextContent: false,
      },
    });
    await tick();
    let state = controller.getSnapshot();
    expect(state.status === "active" && state.session.lifecycle.status).toBe(
      "ready",
    );

    store.commit({
      patch: { kind: "bulk", files: [...store.read()] },
      meta: {
        kind: "import",
        action: "applyIncoming",
        scope: { project: true },
        dirtyTextContent: true,
      },
    });
    await tick();
    state = controller.getSnapshot();
    expect(state.status === "active" && state.session.lifecycle.status).toBe(
      "stale",
    );
    await controller.close();
  });

  it("starts external writable comparison unresolved", async () => {
    const store = new WorkingFilesStore([makeBook()]);
    const controller = new CompareSessionController({
      workingFilesStore: store,
      usfmOnionService: service(),
    });
    await controller.open({
      left: descriptor({
        kind: "working",
        writable: true,
        files: () => store.read(),
      }),
      right: descriptor({
        kind: "existingProject",
        files: () => [makeBook()],
      }),
    });

    const state = controller.getSnapshot();
    expect(state.status).toBe("active");
    if (state.status !== "active") return;
    expect(state.session.decisions.GEN?.[1]?.units).toEqual({});
    expect(state.projection).toMatchObject({
      status: "ready",
      artifact: { complete: false },
    });
    await controller.close();
  });

  it("cleans displaced and newly loaded materials when close cancels Refresh", async () => {
    const store = new WorkingFilesStore([makeBook()]);
    const oldLeftCleanup = vi.fn(async () => {});
    const oldRightCleanup = vi.fn(async () => {});
    const nextLeftCleanup = vi.fn(async () => {});
    const nextRightCleanup = vi.fn(async () => {});
    const nextLeft = deferred<{
      files: ScriptureBookState[];
      cleanup: () => Promise<void>;
    }>();
    const nextRight = deferred<{
      files: ScriptureBookState[];
      cleanup: () => Promise<void>;
    }>();
    let reloadCount = 0;
    const makeReload =
      (oldCleanup: () => Promise<void>, next: typeof nextLeft) => async () => {
        reloadCount += 1;
        if (reloadCount <= 2)
          return { files: [makeBook()], cleanup: oldCleanup };
        return next.promise;
      };
    const controller = new CompareSessionController({
      workingFilesStore: store,
      usfmOnionService: service(),
    });
    await controller.open({
      left: {
        ...descriptor({ kind: "saved", files: () => [makeBook()] }),
        reload: makeReload(oldLeftCleanup, nextLeft),
      },
      right: {
        ...descriptor({
          kind: "working",
          writable: true,
          files: () => store.read(),
        }),
        reload: makeReload(oldRightCleanup, nextRight),
      },
    });

    const refreshing = controller.refresh();
    await tick();
    await controller.close();
    nextLeft.resolve({ files: [makeBook()], cleanup: nextLeftCleanup });
    nextRight.resolve({ files: [makeBook()], cleanup: nextRightCleanup });
    await refreshing;

    expect(oldLeftCleanup).toHaveBeenCalledTimes(1);
    expect(oldRightCleanup).toHaveBeenCalledTimes(1);
    expect(nextLeftCleanup).toHaveBeenCalledTimes(1);
    expect(nextRightCleanup).toHaveBeenCalledTimes(1);
  });

  it("cleans a fulfilled material when its paired source load rejects", async () => {
    const store = new WorkingFilesStore([makeBook()]);
    const cleanup = vi.fn(async () => {});
    const controller = new CompareSessionController({
      workingFilesStore: store,
      usfmOnionService: service(),
    });
    await controller.open({
      left: {
        ...descriptor({ kind: "saved", files: () => [makeBook()] }),
        reload: async () => ({ files: [makeBook()], cleanup }),
      },
      right: {
        ...descriptor({
          kind: "working",
          writable: true,
          files: () => store.read(),
        }),
        reload: async () => {
          throw new Error("source failed");
        },
      },
    });
    expect(cleanup).toHaveBeenCalledTimes(1);
    await controller.close();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("coalesces rapid decision changes into the latest pending projection", async () => {
    const store = new WorkingFilesStore([makeBook()]);
    const firstMerge = deferred<Token[]>();
    const mergeDiffBlocks = vi
      .fn()
      .mockImplementationOnce(() => firstMerge.promise)
      .mockResolvedValue([rightToken]);
    const controller = new CompareSessionController({
      workingFilesStore: store,
      usfmOnionService: {
        ...service(),
        mergeDiffBlocks,
      },
    });
    await controller.open({
      left: descriptor({ kind: "saved", files: () => [makeBook()] }),
      right: descriptor({
        kind: "working",
        writable: true,
        files: () => store.read(),
      }),
    });
    controller.setUnitDecision(
      { bookCode: "GEN", chapterNum: 1 },
      "change",
      "left",
    );
    controller.setUnitDecision(
      { bookCode: "GEN", chapterNum: 1 },
      "change",
      "right",
    );
    firstMerge.resolve([rightToken]);
    await tick();
    await tick();

    expect(mergeDiffBlocks).toHaveBeenCalledTimes(2);
    const state = controller.getSnapshot();
    expect(state.status === "active" && state.projection).toMatchObject({
      status: "ready",
      artifact: { revision: 2 },
    });
    await controller.close();
  });
});
