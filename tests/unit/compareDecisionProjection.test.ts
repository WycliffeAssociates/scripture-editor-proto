import { describe, expect, it, vi } from "vitest";

import {
  clearUnitDecision,
  createInitialDecisions,
  decisionCompleteness,
  setUnitDecision,
  setChapterPresenceDecision,
  stampDecisionScope,
  toMergeRequest,
} from "@/app/domain/project/compare/decisionState.ts";
import {
  assertApplyArtifact,
  projectCompareRevision,
  reduceProjectionState,
} from "@/app/domain/project/compare/projection.ts";
import { buildCompareSourcePair } from "@/app/domain/project/compare/sourceDescriptors.ts";
import type {
  CompareResult,
  CompareSourceDescriptor,
} from "@/app/domain/project/compare/types.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { DiffSkeleton, Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

const leftToken: Token = {
  id: "l",
  kind: "text",
  sid: "GEN 1:1",
  source: "left",
};
const rightToken: Token = {
  id: "r",
  kind: "text",
  sid: "GEN 1:1",
  source: "right",
};
const changedSkeleton: DiffSkeleton = {
  slots: [
    { unitId: "move", role: "pairCurrent" },
    { unitId: "move", role: "pairBaseline" },
  ],
  units: [
    {
      id: "move",
      kind: "coalesced",
      status: "moved",
      baselineSid: "GEN 1:1",
      currentSid: "GEN 1:1",
      baselineTokens: [leftToken],
      currentTokens: [rightToken],
      displaced: true,
      relabeled: false,
      dupContext: { baselineCount: 1, currentCount: 1 },
      isWhitespaceChange: false,
      isUsfmStructureChange: false,
    },
  ],
};

function descriptor(
  kind: "saved" | "working" | "existingProject",
  writable = false,
): CompareSourceDescriptor {
  return {
    id: kind,
    label: kind,
    locator: { kind, projectId: "p" },
    writable,
    reload: async () => ({ files: [] }),
  };
}

function result(args?: {
  external?: boolean;
  rightPresent?: boolean;
}): CompareResult {
  const left = args?.external
    ? descriptor("working", true)
    : descriptor("saved");
  const right = args?.external
    ? descriptor("existingProject")
    : descriptor("working", true);
  return {
    sources: buildCompareSourcePair({ left, right }),
    chapters: {
      GEN: {
        1: {
          address: { bookCode: "GEN", chapterNum: 1 },
          left: {
            present: true,
            dirty: false,
            eol: "\r\n",
            direction: "ltr",
            book: {
              path: "/GEN.usfm",
              title: "Genesis",
              bookCode: "GEN",
              nextBookId: null,
              prevBookId: null,
            },
            tokens: Object.freeze([leftToken]),
          },
          right: {
            present: args?.rightPresent ?? true,
            dirty: args?.rightPresent === false ? false : true,
            eol: args?.rightPresent === false ? null : "\n",
            direction: args?.rightPresent === false ? null : "ltr",
            book:
              args?.rightPresent === false
                ? null
                : {
                    path: "/incoming/GEN.usfm",
                    title: "Genesis incoming",
                    bookCode: "GEN",
                    nextBookId: "EXO",
                    prevBookId: null,
                  },
            tokens: Object.freeze(
              args?.rightPresent === false ? [] : [rightToken],
            ),
          },
          skeleton: changedSkeleton,
        },
      },
    },
    warnings: [],
    coverage: {
      leftOnly: [],
      rightOnly: [],
      overlapping: [{ bookCode: "GEN", chapterNum: 1 }],
    },
    changedUnitCount: 1,
  };
}

describe("decision maps", () => {
  it("defaults unsaved Saved-vs-Working to the semantic Working side", () => {
    const decisions = createInitialDecisions(result());
    expect(decisions.GEN?.[1]).toEqual({
      units: { move: "right" },
      presence: null,
    });
  });

  it("starts external reconciliation unresolved and supports reversible radio decisions", () => {
    const snapshot = result({ external: true });
    let decisions = createInitialDecisions(snapshot).GEN?.[1]?.units ?? {};
    expect(decisionCompleteness(changedSkeleton, decisions).complete).toBe(
      false,
    );
    decisions = setUnitDecision({
      previous: decisions,
      skeleton: changedSkeleton,
      unitId: "move",
      decision: "left",
    });
    expect(toMergeRequest({ skeleton: changedSkeleton, decisions })).toEqual({
      decisions: { move: "baseline" },
      defaultSide: "baseline",
    });
    decisions = clearUnitDecision({
      previous: decisions,
      skeleton: changedSkeleton,
      unitId: "move",
    });
    expect(decisions).toEqual({});
    expect(() =>
      setUnitDecision({
        previous: decisions,
        skeleton: changedSkeleton,
        unitId: "stale",
        decision: "right",
      }),
    ).toThrow("Unknown compare unit id");
    expect(() =>
      toMergeRequest({
        skeleton: changedSkeleton,
        decisions: { move: "left", stale: "right" },
      }),
    ).toThrow("Unknown compare unit id: stale");
  });

  it("bulk stamps the skeleton scope independently of row filters", () => {
    expect(
      stampDecisionScope({
        previous: {},
        skeleton: changedSkeleton,
        decision: "right",
      }),
    ).toEqual({ move: "right" });
  });
});

describe("revision-tagged merge projection", () => {
  it("reuses a frozen side when every decision selects it", async () => {
    const snapshot = result();
    const chapter = snapshot.chapters.GEN?.[1];
    const mergeDiffBlocks = vi.fn(
      async (
        _baselineTokens: readonly Token[],
        _currentTokens: readonly Token[],
        _request: unknown,
      ) => [rightToken],
    );
    const artifact = await projectCompareRevision({
      snapshot,
      decisions: createInitialDecisions(snapshot),
      revision: 3,
      usfmOnionService: { mergeDiffBlocks } as unknown as IUsfmOnionService,
    });

    expect(mergeDiffBlocks).not.toHaveBeenCalled();
    expect(artifact.chapters[0]?.tokens).toBe(chapter?.right.tokens);
    expect(artifact).toMatchObject({ revision: 3, complete: true });
    expect(artifact.chapters[0]).toMatchObject({
      present: true,
      structuralAction: "update",
      eol: "\n",
    });
    expect(assertApplyArtifact({ artifact, currentRevision: 3 })).toBe(
      artifact,
    );
  });

  it("passes the frozen snapshot arrays to Onion for mixed decisions", async () => {
    const snapshot = result();
    const chapter = snapshot.chapters.GEN![1]!;
    const mixedSkeleton: DiffSkeleton = {
      slots: [
        ...chapter.skeleton.slots,
        { unitId: "second", role: "pairCurrent" },
      ],
      units: [
        ...chapter.skeleton.units,
        { ...chapter.skeleton.units[0]!, id: "second" },
      ],
    };
    const mixedSnapshot: CompareResult = {
      ...snapshot,
      chapters: {
        GEN: { 1: { ...chapter, skeleton: mixedSkeleton } },
      },
    };
    const mergeDiffBlocks = vi.fn(
      async (_left: readonly Token[], _right: readonly Token[]) => [rightToken],
    );

    await projectCompareRevision({
      snapshot: mixedSnapshot,
      decisions: {
        GEN: {
          1: { units: { move: "left", second: "right" }, presence: null },
        },
      },
      revision: 1,
      usfmOnionService: { mergeDiffBlocks } as unknown as IUsfmOnionService,
    });

    expect(mergeDiffBlocks.mock.calls[0]?.[0]).toBe(chapter.left.tokens);
    expect(mergeDiffBlocks.mock.calls[0]?.[1]).toBe(chapter.right.tokens);
  });

  it("reuses unchanged chapter projections across decision revisions", async () => {
    const snapshot = result();
    const decisions = createInitialDecisions(snapshot);
    const mergeDiffBlocks = vi.fn(async () => [rightToken]);
    const first = await projectCompareRevision({
      snapshot,
      decisions,
      revision: 1,
      usfmOnionService: { mergeDiffBlocks } as unknown as IUsfmOnionService,
    });
    const second = await projectCompareRevision({
      snapshot,
      decisions,
      revision: 2,
      usfmOnionService: { mergeDiffBlocks } as unknown as IUsfmOnionService,
      previous: { artifact: first, decisions },
    });

    expect(mergeDiffBlocks).not.toHaveBeenCalled();
    expect(second.chapters[0]).toBe(first.chapters[0]);
  });

  it("models choosing the absent side as a real chapter deletion", async () => {
    const snapshot = result({ external: true, rightPresent: false });
    const decisions = {
      GEN: { 1: { units: { move: "right" as const }, presence: null } },
    };
    const artifact = await projectCompareRevision({
      snapshot,
      decisions,
      revision: 1,
      usfmOnionService: {
        mergeDiffBlocks: async () => [],
      } as unknown as IUsfmOnionService,
    });
    expect(artifact.chapters[0]).toMatchObject({
      present: false,
      structuralAction: "delete",
      eol: null,
    });
  });

  it("carries source book metadata when projection adds a new book", async () => {
    const incomingBook = {
      path: "/incoming/GEN.usfm",
      title: "Genesis incoming",
      bookCode: "GEN",
      nextBookId: "EXO",
      prevBookId: null,
      sort: 1,
    } as const;
    const addedSkeleton: DiffSkeleton = {
      slots: [{ unitId: "added", role: "currentOnly" }],
      units: [
        {
          id: "added",
          kind: "added",
          status: "added",
          currentSid: "GEN 1:1",
          baselineTokens: [],
          currentTokens: [rightToken],
          displaced: false,
          relabeled: false,
          dupContext: { baselineCount: 0, currentCount: 1 },
          isWhitespaceChange: false,
          isUsfmStructureChange: false,
        },
      ],
    };
    const snapshot: CompareResult = {
      sources: buildCompareSourcePair({
        left: descriptor("working", true),
        right: descriptor("existingProject"),
      }),
      chapters: {
        GEN: {
          1: {
            address: { bookCode: "GEN", chapterNum: 1 },
            left: {
              present: false,
              dirty: false,
              eol: null,
              direction: null,
              book: null,
              tokens: [],
            },
            right: {
              present: true,
              dirty: false,
              eol: "\r\n",
              direction: "rtl",
              book: incomingBook,
              tokens: [rightToken],
            },
            skeleton: addedSkeleton,
          },
        },
      },
      warnings: [],
      coverage: {
        leftOnly: [],
        rightOnly: [{ bookCode: "GEN", chapterNum: 1 }],
        overlapping: [],
      },
      changedUnitCount: 1,
    };
    const artifact = await projectCompareRevision({
      snapshot,
      decisions: {
        GEN: {
          1: { units: { added: "right" }, presence: null },
        },
      },
      revision: 1,
      usfmOnionService: {
        mergeDiffBlocks: async () => [rightToken],
      } as unknown as IUsfmOnionService,
    });

    expect(artifact.chapters[0]).toMatchObject({
      present: true,
      structuralAction: "add",
      eol: "\r\n",
      direction: "rtl",
      book: incomingBook,
    });
  });

  it("keeps empty-present distinct from absent with an explicit coverage decision", async () => {
    const emptySkeleton: DiffSkeleton = { slots: [], units: [] };
    const snapshot: CompareResult = {
      sources: buildCompareSourcePair({
        left: descriptor("working", true),
        right: descriptor("existingProject"),
      }),
      chapters: {
        GEN: {
          1: {
            address: { bookCode: "GEN", chapterNum: 1 },
            left: {
              present: true,
              dirty: false,
              eol: "\r\n",
              direction: "ltr",
              book: {
                path: "/GEN.usfm",
                title: "Genesis",
                bookCode: "GEN",
                nextBookId: null,
                prevBookId: null,
              },
              tokens: [],
            },
            right: {
              present: false,
              dirty: false,
              eol: null,
              direction: null,
              book: null,
              tokens: [],
            },
            skeleton: emptySkeleton,
          },
        },
      },
      warnings: [],
      coverage: {
        leftOnly: [{ bookCode: "GEN", chapterNum: 1 }],
        rightOnly: [],
        overlapping: [],
      },
      changedUnitCount: 1,
    };
    const chapter = snapshot.chapters.GEN![1]!;
    const initial = createInitialDecisions(snapshot);
    expect(initial.GEN?.[1]).toEqual({ units: {}, presence: null });

    const unresolved = await projectCompareRevision({
      snapshot,
      decisions: initial,
      revision: 1,
      usfmOnionService: {
        mergeDiffBlocks: async () => [],
      } as unknown as IUsfmOnionService,
    });
    expect(unresolved).toMatchObject({ complete: false });
    expect(unresolved.unresolved).toEqual([{ bookCode: "GEN", chapterNum: 1 }]);

    const keepPresent = setChapterPresenceDecision({
      chapter,
      previous: initial.GEN![1]!,
      decision: "left",
    });
    const kept = await projectCompareRevision({
      snapshot,
      decisions: { GEN: { 1: keepPresent } },
      revision: 2,
      usfmOnionService: {
        mergeDiffBlocks: async () => [],
      } as unknown as IUsfmOnionService,
    });
    expect(kept.chapters[0]).toMatchObject({
      present: true,
      structuralAction: "unchanged",
      eol: "\r\n",
    });

    const chooseAbsent = setChapterPresenceDecision({
      chapter,
      previous: keepPresent,
      decision: "right",
    });
    const deleted = await projectCompareRevision({
      snapshot,
      decisions: { GEN: { 1: chooseAbsent } },
      revision: 3,
      usfmOnionService: {
        mergeDiffBlocks: async () => [],
      } as unknown as IUsfmOnionService,
    });
    expect(deleted.chapters[0]).toMatchObject({
      present: false,
      structuralAction: "delete",
    });
  });

  it("ignores completion from an obsolete switch-mapped revision", () => {
    const running = reduceProjectionState(
      { status: "idle", revision: 0 },
      { type: "started", revision: 2 },
    );
    const oldArtifact = {
      revision: 1,
      chapters: [],
      unresolved: [],
      complete: true,
    } as const;
    expect(
      reduceProjectionState(running, {
        type: "completed",
        artifact: oldArtifact,
      }),
    ).toBe(running);
  });
});
