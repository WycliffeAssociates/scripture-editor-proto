import { describe, expect, it } from "vitest";

import {
  buildGitRemoteProjectStatus,
  buildStatusFromRemoteRelationship,
  decideRemoteSyncAction,
  getRemoteSyncActionMode,
} from "@/app/domain/project/remoteSync/gitRemoteLifecycle.ts";
import {
  createDefaultGitRemoteProjectStatus,
  type GitRemoteProjectStatus,
} from "@/core/persistence/gitRemoteModels.ts";
import {
  GIT_REMOTE_RELATIONSHIP_AHEAD_ONLY,
  GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY,
  GIT_REMOTE_RELATIONSHIP_DIVERGED,
  GIT_REMOTE_RELATIONSHIP_UNTRACKED,
  GIT_REMOTE_RELATIONSHIP_UP_TO_DATE,
  type GitRemoteRelationship,
} from "@/core/persistence/gitRemoteRelationship.ts";

const checkedAt = "2026-05-29T12:00:00.000Z";
const headMetadata = {
  localAuthoredAt: "2026-05-29T11:00:00.000Z",
  remoteAuthoredAt: "2026-05-29T11:30:00.000Z",
  remoteAuthorName: "Remote Author",
};

function relationship(
  kind: GitRemoteRelationship["kind"],
): GitRemoteRelationship {
  return {
    kind,
    localHead: "local-head",
    remoteHead: "remote-head",
    mergeBase: "base-head",
  };
}

describe("git remote lifecycle status mapping", () => {
  it.each([
    [GIT_REMOTE_RELATIONSHIP_UP_TO_DATE, "connected", null],
    [
      GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY,
      "remoteUpdatesAvailable",
      "Remote Author",
    ],
    [GIT_REMOTE_RELATIONSHIP_DIVERGED, "needsReview", "Remote Author"],
    [GIT_REMOTE_RELATIONSHIP_AHEAD_ONLY, "pendingPublish", null],
    [GIT_REMOTE_RELATIONSHIP_UNTRACKED, "pendingPublish", null],
  ] as const)(
    "maps %s relationship to durable %s status",
    (relationshipKind, expectedKind, expectedAuthor) => {
      const status = buildStatusFromRemoteRelationship({
        existingStatus: createDefaultGitRemoteProjectStatus("/projects/gen"),
        relationship: relationship(relationshipKind),
        localHead: "local-head",
        remoteHead: "remote-head",
        checkedAt,
        headMetadata,
      });

      expect(status.kind).toBe(expectedKind);
      expect(status.latestIncomingAuthorName).toBe(expectedAuthor);
      expect(status.lastKnownLocalHead).toBe("local-head");
      expect(status.lastKnownRemoteHead).toBe("remote-head");
    },
  );

  it("preserves existing published timestamp unless a patch supplies one", () => {
    const existing = {
      ...createDefaultGitRemoteProjectStatus("/projects/gen"),
      lastPublishedAt: "2026-05-29T10:00:00.000Z",
    };

    expect(
      buildGitRemoteProjectStatus(existing, {
        kind: "pendingPublish",
        checkedAt,
        localHead: "local-head",
      }).lastPublishedAt,
    ).toBe("2026-05-29T10:00:00.000Z");

    expect(
      buildGitRemoteProjectStatus(existing, {
        kind: "connected",
        checkedAt,
        localHead: "local-head",
        publishedAt: checkedAt,
      }).lastPublishedAt,
    ).toBe(checkedAt);
  });

  describe("decideRemoteSyncAction", () => {
    const base = createDefaultGitRemoteProjectStatus("/projects/gen");
    const status = (kind: GitRemoteProjectStatus["kind"]) => ({
      ...base,
      kind,
    });

    it("publishes when pending, even if the gate is closed", () => {
      expect(
        decideRemoteSyncAction({
          status: status("pendingPublish"),
          gateOpen: false,
          hasRecoveredConflicts: true,
          autoAcceptIncomingWork: false,
        }),
      ).toEqual({ kind: "publish" });
    });

    it("refreshes only (gated) when incoming work but gate closed", () => {
      expect(
        decideRemoteSyncAction({
          status: status("remoteUpdatesAvailable"),
          gateOpen: false,
          hasRecoveredConflicts: false,
          autoAcceptIncomingWork: true,
        }),
      ).toEqual({ kind: "refresh-only", reason: "gated" });
    });

    it("refreshes only (recovered-conflicts) over auto-accept", () => {
      expect(
        decideRemoteSyncAction({
          status: status("needsReview"),
          gateOpen: true,
          hasRecoveredConflicts: true,
          autoAcceptIncomingWork: true,
        }),
      ).toEqual({ kind: "refresh-only", reason: "recovered-conflicts" });
    });

    it("auto-accepts behind-only without the review modal", () => {
      expect(
        decideRemoteSyncAction({
          status: status("remoteUpdatesAvailable"),
          gateOpen: true,
          hasRecoveredConflicts: false,
          autoAcceptIncomingWork: true,
        }),
      ).toEqual({
        kind: "auto-accept-incoming",
        suppressReviewModal: true,
      });
    });

    it("auto-accepts diverged but keeps the review modal", () => {
      expect(
        decideRemoteSyncAction({
          status: status("needsReview"),
          gateOpen: true,
          hasRecoveredConflicts: false,
          autoAcceptIncomingWork: true,
        }),
      ).toEqual({
        kind: "auto-accept-incoming",
        suppressReviewModal: false,
      });
    });

    it("refreshes only (clean) when incoming work but auto-accept off", () => {
      expect(
        decideRemoteSyncAction({
          status: status("needsReview"),
          gateOpen: true,
          hasRecoveredConflicts: false,
          autoAcceptIncomingWork: false,
        }),
      ).toEqual({ kind: "refresh-only", reason: "clean" });
    });

    it("refreshes only (clean) for connected status", () => {
      expect(
        decideRemoteSyncAction({
          status: status("connected"),
          gateOpen: true,
          hasRecoveredConflicts: false,
          autoAcceptIncomingWork: true,
        }),
      ).toEqual({ kind: "refresh-only", reason: "clean" });
    });
  });

  it("chooses legal sync actions from durable status", () => {
    const base = createDefaultGitRemoteProjectStatus("/projects/gen");

    expect(getRemoteSyncActionMode(null, true)).toBe("none");
    expect(
      getRemoteSyncActionMode({ ...base, kind: "pendingPublish" }, false),
    ).toBe("sync");
    expect(
      getRemoteSyncActionMode(
        { ...base, kind: "remoteUpdatesAvailable" },
        false,
      ),
    ).toBe("review");
    expect(
      getRemoteSyncActionMode(
        { ...base, kind: "remoteUpdatesAvailable" },
        true,
      ),
    ).toBe("sync");
    expect(getRemoteSyncActionMode({ ...base, kind: "offline" }, true)).toBe(
      "none",
    );
  });
});
