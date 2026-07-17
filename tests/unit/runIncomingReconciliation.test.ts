import { describe, expect, it } from "vitest";

import { buildCompareSourcePair } from "@/app/domain/project/compare/sourceDescriptors.ts";
import type {
  CompareRemoteSync,
  CompareResult,
  CompareSourceDescriptor,
} from "@/app/domain/project/compare/types.ts";
import {
  finalizeOutcome,
  type IncomingReconciliationArgs,
  type IncomingReconciliationInput,
  runIncomingReconciliation,
} from "@/app/domain/project/remoteSync/runIncomingReconciliation.ts";
import {
  GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY,
  GIT_REMOTE_RELATIONSHIP_DIVERGED,
  type GitRemoteRelationshipKind,
} from "@/core/persistence/gitRemoteRelationship.ts";

const args = {} as IncomingReconciliationArgs;

function descriptor(kind: "working" | "remoteLatest", writable = false) {
  return {
    id: kind,
    label: kind,
    locator: { kind, projectId: "p" },
    writable,
    reload: async () => ({ files: [] }),
  } as CompareSourceDescriptor;
}

function snapshot(changedUnitCount: number): CompareResult {
  return {
    sources: buildCompareSourcePair({
      left: descriptor("working", true),
      right: descriptor("remoteLatest"),
    }),
    chapters: {},
    warnings: [],
    coverage: { leftOnly: [], rightOnly: [], overlapping: [] },
    changedUnitCount,
  };
}

function remoteSync(
  relationship: GitRemoteRelationshipKind,
): CompareRemoteSync {
  return {
    remoteHead: "remote",
    localHead: null,
    mergeBase: null,
    trackedBranch: "master",
    relationship,
  };
}

function input(
  relationship: GitRemoteRelationshipKind,
  changed = 0,
): IncomingReconciliationInput {
  return {
    sourceFiles: [],
    metadata: {},
    remoteSync: remoteSync(relationship),
    initialSnapshot: snapshot(changed),
  };
}

const deps = {
  args,
  commitIncoming: () => true,
  listCompareChapterRefs: () => [],
};

describe("runIncomingReconciliation outcome handoff", () => {
  it("leaves state untouched when incoming flows are blocked", async () => {
    const outcome = await runIncomingReconciliation(
      { ...deps, incomingFlowsBlocked: () => true },
      input(GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY),
    );
    expect(outcome).toEqual({ requiresReview: false });
  });

  it("returns the frozen skeleton snapshot for diverged manual review", async () => {
    const initial = input(GIT_REMOTE_RELATIONSHIP_DIVERGED, 1);
    const outcome = await runIncomingReconciliation(
      { ...deps, incomingFlowsBlocked: () => false },
      initial,
    );
    expect(outcome.requiresReview).toBe(true);
    expect(outcome.nextCompareResult?.snapshot).toBe(initial.initialSnapshot);
    expect(outcome.nextCompareResult?.remoteSync).toBe(initial.remoteSync);
    expect(outcome.remoteAccept).toBeUndefined();
  });

  it("returns an empty diverged snapshot without offering fast-forward", async () => {
    const outcome = await runIncomingReconciliation(
      { ...deps, incomingFlowsBlocked: () => false },
      input(GIT_REMOTE_RELATIONSHIP_DIVERGED),
    );
    expect(outcome.requiresReview).toBe(false);
    expect(outcome.nextCompareResult).toBeDefined();
    expect(outcome.remoteAccept).toBeUndefined();
  });
});

describe("finalizeOutcome never fast-forwards while review remains", () => {
  const sync = remoteSync(GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY);

  it("drops fast-forward and retains remote state when changes remain", () => {
    const outcome = finalizeOutcome({
      nextCompareResult: { snapshot: snapshot(1), remoteSync: sync },
      behindOnlyFastForward: {
        trackedBranch: "master",
        remoteHead: "remote",
      },
    });
    expect(outcome.requiresReview).toBe(true);
    expect(outcome.remoteAccept).toBeUndefined();
    expect(outcome.nextCompareResult?.remoteSync).toBe(sync);
  });

  it("keeps fast-forward and clears remote state when no changes remain", () => {
    const outcome = finalizeOutcome({
      nextCompareResult: { snapshot: snapshot(0), remoteSync: sync },
      behindOnlyFastForward: {
        trackedBranch: "master",
        remoteHead: "remote",
      },
    });
    expect(outcome.requiresReview).toBe(false);
    expect(outcome.remoteAccept).toEqual({
      trackedBranch: "master",
      remoteHead: "remote",
    });
    expect(outcome.nextCompareResult?.remoteSync).toBeUndefined();
  });

  it("allows diverged disjoint to hand off to reconciliation save", () => {
    const outcome = finalizeOutcome({
      nextCompareResult: { snapshot: snapshot(1), remoteSync: sync },
      requiresReviewOverride: false,
      requiresReconciliationSave: {
        trackedBranch: "master",
        remoteHead: "remote",
        relationship: GIT_REMOTE_RELATIONSHIP_DIVERGED,
      },
    });
    expect(outcome.requiresReview).toBe(false);
    expect(outcome.remoteAccept).toBeUndefined();
    expect(outcome.requiresReconciliationSave).toBeDefined();
  });
});
