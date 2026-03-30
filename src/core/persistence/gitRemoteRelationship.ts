/**
 * Shared Git graph helpers for cloud publishing.
 *
 * Higher layers care about user-facing states like "needs review" or "updates
 * available", but those decisions still come from a small set of Git graph
 * relationships. Keeping the classifier pure makes it easy to test the tricky
 * cases before transport or UI code is involved.
 */
export const GIT_REMOTE_RELATIONSHIP_VALUES = [
    "untrackedRemote",
    "upToDate",
    "aheadOnly",
    "behindOnly",
    "diverged",
] as const;

export type GitRemoteRelationshipKind =
    (typeof GIT_REMOTE_RELATIONSHIP_VALUES)[number];

export const [
    GIT_REMOTE_RELATIONSHIP_UNTRACKED,
    GIT_REMOTE_RELATIONSHIP_UP_TO_DATE,
    GIT_REMOTE_RELATIONSHIP_AHEAD_ONLY,
    GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY,
    GIT_REMOTE_RELATIONSHIP_DIVERGED,
] = GIT_REMOTE_RELATIONSHIP_VALUES;

export type GitRemoteRelationship = {
    kind: GitRemoteRelationshipKind;
    localHead: string | null;
    remoteHead: string | null;
    mergeBase: string | null;
};

export const GIT_REMOTE_REPLAY_STRATEGY_VALUES = [
    "none",
    "commitOnRemoteLatest",
    "replayLocalCommitsOntoRemoteLatest",
] as const;

export type GitRemoteReplayStrategy =
    (typeof GIT_REMOTE_REPLAY_STRATEGY_VALUES)[number];

export const [
    GIT_REMOTE_REPLAY_NONE,
    GIT_REMOTE_REPLAY_COMMIT_ON_REMOTE_LATEST,
    GIT_REMOTE_REPLAY_LOCAL_COMMITS,
] = GIT_REMOTE_REPLAY_STRATEGY_VALUES;

export type GitReplayDecision = {
    strategy: GitRemoteReplayStrategy;
    relationship: GitRemoteRelationshipKind;
};

export function chooseCommittedHistoryReplayStrategy(
    relationship: GitRemoteRelationship,
    localOnlyCommitCount: number,
): GitReplayDecision {
    return {
        strategy:
            relationship.kind === GIT_REMOTE_RELATIONSHIP_DIVERGED &&
            localOnlyCommitCount > 0
                ? GIT_REMOTE_REPLAY_LOCAL_COMMITS
                : GIT_REMOTE_REPLAY_NONE,
        relationship: relationship.kind,
    };
}

export function classifyGitRemoteRelationship(args: {
    localHead: string | null;
    remoteHead: string | null;
    mergeBase: string | null;
}): GitRemoteRelationship {
    if (!args.remoteHead) {
        return {
            kind: GIT_REMOTE_RELATIONSHIP_UNTRACKED,
            localHead: args.localHead,
            remoteHead: args.remoteHead,
            mergeBase: args.mergeBase,
        };
    }

    if (args.localHead === args.remoteHead) {
        return {
            kind: GIT_REMOTE_RELATIONSHIP_UP_TO_DATE,
            localHead: args.localHead,
            remoteHead: args.remoteHead,
            mergeBase: args.mergeBase,
        };
    }

    if (!args.localHead || !args.mergeBase) {
        return {
            kind: GIT_REMOTE_RELATIONSHIP_DIVERGED,
            localHead: args.localHead,
            remoteHead: args.remoteHead,
            mergeBase: args.mergeBase,
        };
    }

    if (args.mergeBase === args.localHead) {
        return {
            kind: GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY,
            localHead: args.localHead,
            remoteHead: args.remoteHead,
            mergeBase: args.mergeBase,
        };
    }

    if (args.mergeBase === args.remoteHead) {
        return {
            kind: GIT_REMOTE_RELATIONSHIP_AHEAD_ONLY,
            localHead: args.localHead,
            remoteHead: args.remoteHead,
            mergeBase: args.mergeBase,
        };
    }

    return {
        kind: GIT_REMOTE_RELATIONSHIP_DIVERGED,
        localHead: args.localHead,
        remoteHead: args.remoteHead,
        mergeBase: args.mergeBase,
    };
}

export function chooseGitReplayStrategy(args: {
    relationship: GitRemoteRelationship;
    hasDirtyWorkingMemory: boolean;
    unpublishedLocalCommitCount: number;
}): GitReplayDecision {
    switch (args.relationship.kind) {
        case GIT_REMOTE_RELATIONSHIP_UNTRACKED:
        case GIT_REMOTE_RELATIONSHIP_UP_TO_DATE:
        case GIT_REMOTE_RELATIONSHIP_AHEAD_ONLY:
            return {
                strategy: GIT_REMOTE_REPLAY_NONE,
                relationship: args.relationship.kind,
            };
        case GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY:
            return {
                strategy:
                    args.hasDirtyWorkingMemory &&
                    args.unpublishedLocalCommitCount === 0
                        ? GIT_REMOTE_REPLAY_COMMIT_ON_REMOTE_LATEST
                        : GIT_REMOTE_REPLAY_NONE,
                relationship: args.relationship.kind,
            };
        case GIT_REMOTE_RELATIONSHIP_DIVERGED:
            return {
                strategy:
                    args.unpublishedLocalCommitCount > 0
                        ? GIT_REMOTE_REPLAY_LOCAL_COMMITS
                        : GIT_REMOTE_REPLAY_NONE,
                relationship: args.relationship.kind,
            };
    }
}
