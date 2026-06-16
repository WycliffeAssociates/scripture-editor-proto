import { describe, expect, it } from "vitest";

import {
  GIT_REMOTE_RELATIONSHIP_AHEAD_ONLY,
  GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY,
  GIT_REMOTE_RELATIONSHIP_DIVERGED,
  GIT_REMOTE_RELATIONSHIP_UNTRACKED,
  GIT_REMOTE_RELATIONSHIP_UP_TO_DATE,
  GIT_REMOTE_REPLAY_COMMIT_ON_REMOTE_LATEST,
  GIT_REMOTE_REPLAY_LOCAL_COMMITS,
  GIT_REMOTE_REPLAY_NONE,
  chooseGitReplayStrategy,
  classifyGitRemoteRelationship,
} from "@/core/persistence/gitRemoteRelationship.ts";
describe("classifyGitRemoteRelationship", () => {
  it("classifies a missing remote head as untracked remote", () => {
    expect(
      classifyGitRemoteRelationship({
        localHead: "abc",
        remoteHead: null,
        mergeBase: null,
      }),
    ).toEqual({
      kind: GIT_REMOTE_RELATIONSHIP_UNTRACKED,
      localHead: "abc",
      remoteHead: null,
      mergeBase: null,
    });
  });

  it("classifies matching heads as up to date", () => {
    expect(
      classifyGitRemoteRelationship({
        localHead: "abc",
        remoteHead: "abc",
        mergeBase: "abc",
      }),
    ).toEqual({
      kind: GIT_REMOTE_RELATIONSHIP_UP_TO_DATE,
      localHead: "abc",
      remoteHead: "abc",
      mergeBase: "abc",
    });
  });

  it("classifies local-head merge-base matches as behind only", () => {
    expect(
      classifyGitRemoteRelationship({
        localHead: "base",
        remoteHead: "remote",
        mergeBase: "base",
      }),
    ).toEqual({
      kind: GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY,
      localHead: "base",
      remoteHead: "remote",
      mergeBase: "base",
    });
  });

  it("classifies remote-head merge-base matches as ahead only", () => {
    expect(
      classifyGitRemoteRelationship({
        localHead: "local",
        remoteHead: "base",
        mergeBase: "base",
      }),
    ).toEqual({
      kind: GIT_REMOTE_RELATIONSHIP_AHEAD_ONLY,
      localHead: "local",
      remoteHead: "base",
      mergeBase: "base",
    });
  });

  it("classifies split history as diverged", () => {
    expect(
      classifyGitRemoteRelationship({
        localHead: "local",
        remoteHead: "remote",
        mergeBase: "base",
      }),
    ).toEqual({
      kind: GIT_REMOTE_RELATIONSHIP_DIVERGED,
      localHead: "local",
      remoteHead: "remote",
      mergeBase: "base",
    });
  });
});

describe("chooseGitReplayStrategy", () => {
  it("uses direct commit-on-remote-latest when only in-memory edits exist over a behind branch", () => {
    const relationship = classifyGitRemoteRelationship({
      localHead: "base",
      remoteHead: "remote",
      mergeBase: "base",
    });

    expect(
      chooseGitReplayStrategy({
        relationship,
        hasDirtyWorkingMemory: true,
        unpublishedLocalCommitCount: 0,
      }),
    ).toEqual({
      strategy: GIT_REMOTE_REPLAY_COMMIT_ON_REMOTE_LATEST,
      relationship: GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY,
    });
  });

  it("chooses hidden replay when local unpublished commits diverged from remote", () => {
    const relationship = classifyGitRemoteRelationship({
      localHead: "local",
      remoteHead: "remote",
      mergeBase: "base",
    });

    expect(
      chooseGitReplayStrategy({
        relationship,
        hasDirtyWorkingMemory: true,
        unpublishedLocalCommitCount: 3,
      }),
    ).toEqual({
      strategy: GIT_REMOTE_REPLAY_LOCAL_COMMITS,
      relationship: GIT_REMOTE_RELATIONSHIP_DIVERGED,
    });
  });

  it("does not choose replay for ahead-only history", () => {
    const relationship = classifyGitRemoteRelationship({
      localHead: "local",
      remoteHead: "base",
      mergeBase: "base",
    });

    expect(
      chooseGitReplayStrategy({
        relationship,
        hasDirtyWorkingMemory: false,
        unpublishedLocalCommitCount: 2,
      }),
    ).toEqual({
      strategy: GIT_REMOTE_REPLAY_NONE,
      relationship: GIT_REMOTE_RELATIONSHIP_AHEAD_ONLY,
    });
  });
});
