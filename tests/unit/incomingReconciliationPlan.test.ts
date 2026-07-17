import { describe, expect, it } from "vitest";

import { buildCompareSourcePair } from "@/app/domain/project/compare/sourceDescriptors.ts";
import type {
  CompareResult,
  CompareSourceDescriptor,
} from "@/app/domain/project/compare/types.ts";
import {
  buildAutoAcceptIncomingDecisionPlan,
  buildBookTextByCodeFromSnapshot,
  buildDivergedAutoAcceptScopePlan,
  collectChangedSkeletonSemanticAddresses,
  collectUnitSemanticAddresses,
  extractBookCodeFromStorageKey,
  hasCompareChanges,
  hasWholeBookOrChapterDeletion,
  listChangedChapterRefs,
} from "@/app/domain/project/remoteSync/incomingReconciliationPlan.ts";
import type {
  DecisionUnit,
  DiffSkeleton,
  Token,
} from "@/core/domain/usfm/usfmOnionTypes.ts";

function source(kind: "working" | "remoteLatest", writable = false) {
  return {
    id: kind,
    label: kind,
    locator: { kind, projectId: "p" },
    writable,
    reload: async () => ({ files: [] }),
  } as CompareSourceDescriptor;
}

function unit(overrides: Partial<DecisionUnit> = {}): DecisionUnit {
  const left: Token = {
    id: "l",
    kind: "text",
    sid: "GEN 1:1",
    source: "local",
  };
  const right: Token = {
    id: "r",
    kind: "text",
    sid: "GEN 1:1",
    source: "remote",
  };
  return {
    id: "u1",
    kind: "coalesced",
    status: "modified",
    baselineSid: "GEN 1:1",
    currentSid: "GEN 1:1",
    baselineTokens: [left],
    currentTokens: [right],
    displaced: false,
    relabeled: false,
    dupContext: { baselineCount: 1, currentCount: 1 },
    isWhitespaceChange: false,
    isUsfmStructureChange: false,
    ...overrides,
  };
}

function snapshot(
  args: {
    units?: DecisionUnit[];
    leftPresent?: boolean;
    rightPresent?: boolean;
  } = {},
): CompareResult {
  const units = args.units ?? [unit()];
  const skeleton: DiffSkeleton = {
    slots: units.map((entry) => ({
      unitId: entry.id,
      role: "pairBaseline",
    })),
    units,
  };
  return {
    sources: buildCompareSourcePair({
      left: source("working", true),
      right: source("remoteLatest"),
    }),
    chapters: {
      GEN: {
        1: {
          address: { bookCode: "GEN", chapterNum: 1 },
          left: {
            present: args.leftPresent ?? true,
            dirty: true,
            eol: "\n",
            direction: "ltr",
            book: {
              path: "/GEN.usfm",
              title: "Genesis",
              bookCode: "GEN",
              nextBookId: null,
              prevBookId: null,
            },
            tokens: units.flatMap((entry) => entry.baselineTokens),
          },
          right: {
            present: args.rightPresent ?? true,
            dirty: false,
            eol: "\n",
            direction: "ltr",
            book: {
              path: "/GEN.usfm",
              title: "Genesis",
              bookCode: "GEN",
              nextBookId: null,
              prevBookId: null,
            },
            tokens: units.flatMap((entry) => entry.currentTokens),
          },
          skeleton,
        },
      },
    },
    warnings: [],
    coverage: { leftOnly: [], rightOnly: [], overlapping: [] },
    changedUnitCount:
      units.filter((entry) => entry.status !== "unchanged").length ||
      ((args.leftPresent ?? true) !== (args.rightPresent ?? true) ? 1 : 0),
  };
}

describe("skeleton-native incoming planning", () => {
  it("collects baseline/current, coveredBy, and token SIDs conservatively", () => {
    const moved = unit({
      baselineSid: "GEN 1:1",
      currentSid: "GEN 1:2",
      coveredBy: { unitId: "cover", sid: "GEN 1:3", side: "baseline" },
      baselineTokens: [{ id: "a", kind: "text", sid: "GEN 1:4", source: "a" }],
      currentTokens: [{ id: "b", kind: "text", sid: "GEN 1:5", source: "b" }],
    });
    expect(collectUnitSemanticAddresses(moved)).toEqual(
      new Set(["GEN 1:1", "GEN 1:2", "GEN 1:3", "GEN 1:4", "GEN 1:5"]),
    );
    expect(
      collectChangedSkeletonSemanticAddresses({ slots: [], units: [moved] }),
    ).toEqual(collectUnitSemanticAddresses(moved));
  });

  it("takes safe remote units and keeps dirty-overlapping units on Working", () => {
    const first = unit({ id: "safe", baselineSid: "GEN 1:1" });
    const second = unit({
      id: "blocked",
      baselineSid: "GEN 1:2",
      currentSid: "GEN 1:2",
      baselineTokens: [
        { id: "l2", kind: "text", sid: "GEN 1:2", source: "l2" },
      ],
      currentTokens: [{ id: "r2", kind: "text", sid: "GEN 1:2", source: "r2" }],
    });
    const plan = buildAutoAcceptIncomingDecisionPlan({
      snapshot: snapshot({ units: [first, second] }),
      dirtySemanticSidsByChapter: new Map([["GEN:1", new Set(["GEN 1:2"])]]),
    });
    expect(plan.decisions.GEN?.[1]?.units).toEqual({
      safe: "right",
      blocked: "left",
    });
    expect(plan.autoAcceptedUnitCount).toBe(1);
    expect(plan.blockedUnitCount).toBe(1);
  });

  it("never auto-accepts a whole-chapter deletion", () => {
    const plan = buildAutoAcceptIncomingDecisionPlan({
      snapshot: snapshot({ rightPresent: false }),
      dirtySemanticSidsByChapter: new Map(),
    });
    expect(plan.decisions.GEN?.[1]?.units.u1).toBe("left");
    expect(plan.autoAcceptedUnitCount).toBe(0);
    expect(plan.blockedUnitCount).toBe(1);
  });

  it("lists changed chapters and derives change presence from the snapshot", () => {
    const result = snapshot();
    expect(hasCompareChanges(result)).toBe(true);
    expect(listChangedChapterRefs(result)).toEqual([
      { bookCode: "GEN", chapterNum: 1 },
    ]);
  });
});

describe("diverged committed-history auto-accept scope", () => {
  const base = new Map([
    ["GEN", "\\id GEN\n\\c 1\n\\v 1 one\n\\v 2 two\n\\c 2\n\\v 1 three\n"],
    ["EXO", "\\id EXO\n\\c 1\n\\v 1 exodus\n"],
  ]);

  it.each([
    ["project", true],
    ["book", true],
    ["chapter", false],
    ["verse", false],
  ] as const)("classifies disjoint changes at %s scope", (scope, overlap) => {
    const local = new Map(base);
    local.set(
      "GEN",
      "\\id GEN\n\\c 1\n\\v 1 local\n\\v 2 two\n\\c 2\n\\v 1 three\n",
    );
    const remote = new Map(base);
    remote.set(
      "GEN",
      "\\id GEN\n\\c 1\n\\v 1 one\n\\v 2 two\n\\c 2\n\\v 1 remote\n",
    );
    expect(
      buildDivergedAutoAcceptScopePlan({
        baseByBook: base,
        localByBook: local,
        remoteByBook: remote,
        scope,
      }).hasOverlap,
    ).toBe(overlap);
  });

  it("forces review for whole-book and whole-chapter deletion", () => {
    const withoutBook = new Map(base);
    withoutBook.delete("EXO");
    expect(
      hasWholeBookOrChapterDeletion({
        baseByBook: base,
        remoteByBook: withoutBook,
      }),
    ).toBe(true);
    const withoutChapter = new Map(base);
    withoutChapter.set("GEN", "\\id GEN\n\\c 1\n\\v 1 one\n\\v 2 two\n");
    expect(
      hasWholeBookOrChapterDeletion({
        baseByBook: base,
        remoteByBook: withoutChapter,
      }),
    ).toBe(true);
  });
});

describe("snapshot path helpers", () => {
  it.each([
    ["ingredients/01-GEN.usfm", "GEN"],
    ["GEN.usfm", "GEN"],
    ["notes.txt", null],
  ])("%s -> %s", (path, expected) => {
    expect(extractBookCodeFromStorageKey(path)).toBe(expected);
  });

  it("keys snapshot text by book code", () => {
    expect(
      buildBookTextByCodeFromSnapshot(
        new Map([
          ["ingredients/01-GEN.usfm", "text"],
          ["metadata.json", "{}"],
        ]),
      ),
    ).toEqual(new Map([["GEN", "text"]]));
  });
});
