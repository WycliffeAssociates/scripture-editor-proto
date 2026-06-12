// runIncomingReconciliation.test.ts
//
// Covers the incoming-reconciliation executor's OUTCOME contract on the branches
// that need no git-snapshot stubs (the gate-blocked early return and the
// diverged manual-review fallback). The executor now returns a single
// IncomingReconciliationOutcome — the hook applies it (setCompareResult +
// fast-forward). The snapshot-driven branches (diverged-disjoint, behind-only)
// are validated by tsc + the applyIncomingToStore integration test; this pins
// that the executor routes the no-mutation paths to the right outcome and never
// offers a fast-forward while review remains.

import { describe, expect, it } from "vitest";

import type { DiffsByChapter } from "@/app/domain/project/diffTypes.ts";
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

// These branches never touch the store/git, so a bare cast is enough — calling
// any method would throw and fail the test loudly rather than pass silently.
const args = {} as IncomingReconciliationArgs;

function input(
  relationship: GitRemoteRelationshipKind,
  overrides: Partial<IncomingReconciliationInput> = {},
): IncomingReconciliationInput {
  return {
    sourceFiles: [],
    metadata: {} as never,
    initialWarnings: [],
    remoteSync: {
      remoteHead: "remote",
      localHead: null,
      mergeBase: null,
      trackedBranch: "master",
      relationship,
    },
    initialDiffsByChapter: {},
    ...overrides,
  };
}

const diffs: DiffsByChapter = {
  GEN: {
    1: [
      {
        uniqueKey: "k",
        semanticSid: "GEN 1:1",
        status: "modified",
        originalDisplayText: "",
        currentDisplayText: "",
        bookCode: "GEN",
        chapterNum: 1,
      },
    ],
  },
};

const deps = {
  args,
  commitIncoming: () => true,
  listCompareChapterRefs: () => [],
};

describe("runIncomingReconciliation", () => {
  it("returns requiresReview:false and no compare result when incoming flows are blocked", async () => {
    const outcome = await runIncomingReconciliation(
      { ...deps, incomingFlowsBlocked: () => true },
      input(GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY),
    );

    expect(outcome.requiresReview).toBe(false);
    // Gate blocked the whole flow — leave the existing compare state alone,
    // and never offer a fast-forward.
    expect(outcome.nextCompareResult).toBeUndefined();
    expect(outcome.remoteAccept).toBeUndefined();
  });

  it("diverged with no merge base: returns the diff for manual review, remoteSync attached", async () => {
    const outcome = await runIncomingReconciliation(
      { ...deps, incomingFlowsBlocked: () => false },
      input(GIT_REMOTE_RELATIONSHIP_DIVERGED, {
        initialDiffsByChapter: diffs,
      }),
    );

    // No merge base → diverged-disjoint fast path bails; manual review.
    expect(outcome.requiresReview).toBe(true);
    expect(outcome.nextCompareResult?.diffsByChapter).toBe(diffs);
    expect(outcome.nextCompareResult?.remoteSync?.relationship).toBe(
      GIT_REMOTE_RELATIONSHIP_DIVERGED,
    );
    // Diverged never fast-forwards inline.
    expect(outcome.remoteAccept).toBeUndefined();
  });

  it("diverged with no diffs: returns empty review, requiresReview false, no fast-forward", async () => {
    const outcome = await runIncomingReconciliation(
      { ...deps, incomingFlowsBlocked: () => false },
      input(GIT_REMOTE_RELATIONSHIP_DIVERGED),
    );

    expect(outcome.requiresReview).toBe(false);
    expect(outcome.nextCompareResult).toBeDefined();
    expect(outcome.remoteAccept).toBeUndefined();
  });
});

const behindRemoteSync = {
  remoteHead: "remote",
  localHead: "local",
  mergeBase: "base",
  trackedBranch: "master",
  relationship: GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY,
};

// The structural enforcer of the P1 invariant: a behind-only fast-forward must
// never be offered while any review state remains, and remoteSync must stay
// attached so the next save adopts remote latest. (Regression: the executor
// used to accept + clear remoteSync even with blocked diffs present.)
describe("finalizeOutcome (never fast-forward while review remains)", () => {
  it("DROPS the fast-forward and KEEPS remoteSync when diffs remain", () => {
    const outcome = finalizeOutcome({
      nextCompareResult: {
        diffsByChapter: diffs,
        warnings: [],
        remoteSync: behindRemoteSync,
      },
      behindOnlyFastForward: {
        trackedBranch: "master",
        remoteHead: "remote",
      },
    });

    expect(outcome.requiresReview).toBe(true);
    expect(outcome.remoteAccept).toBeUndefined();
    // Partial behind-only acceptance adopts remote latest on the next save.
    expect(outcome.nextCompareResult?.remoteSync).toBe(behindRemoteSync);
  });

  it("KEEPS the fast-forward and CLEARS remoteSync when no diffs remain", () => {
    const outcome = finalizeOutcome({
      nextCompareResult: {
        diffsByChapter: {},
        warnings: [],
        remoteSync: behindRemoteSync,
      },
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
    // Fully adopted → nothing pending.
    expect(outcome.nextCompareResult?.remoteSync).toBeUndefined();
  });

  it("forces requiresReview false (diverged-disjoint handoff) without offering a fast-forward", () => {
    const outcome = finalizeOutcome({
      nextCompareResult: {
        diffsByChapter: diffs,
        warnings: [],
        remoteSync: behindRemoteSync,
      },
      requiresReviewOverride: false,
    });

    expect(outcome.requiresReview).toBe(false);
    expect(outcome.remoteAccept).toBeUndefined();
    expect(outcome.nextCompareResult?.remoteSync).toBe(behindRemoteSync);
  });
});
