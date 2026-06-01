import {
    GIT_REMOTE_PROJECT_STATUS_CONNECTED,
    GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW,
    GIT_REMOTE_PROJECT_STATUS_OFFLINE,
    GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH,
    GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED,
    GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE,
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

export type GitRemoteHeadMetadata = {
    localAuthoredAt: string | null;
    remoteAuthoredAt: string | null;
    remoteAuthorName: string | null;
};

export type GitRemoteStatusPatch = {
    kind: GitRemoteProjectStatus["kind"];
    checkedAt: string;
    localHead?: string | null;
    remoteHead?: string | null;
    localHeadAuthoredAt?: string | null;
    remoteHeadAuthoredAt?: string | null;
    latestIncomingAuthorName?: string | null;
    publishedAt?: string;
};

export type RemoteSyncActionMode = "none" | "sync" | "review";

/**
 * Builds the durable cloud status record from one explicit lifecycle decision.
 *
 * Open, save, and manual sync paths all update the same persisted model. Keeping
 * this merge logic here prevents each caller from inventing slightly different
 * fallback behavior for heads, timestamps, and incoming-author metadata.
 */
export function buildGitRemoteProjectStatus(
    existingStatus: GitRemoteProjectStatus,
    patch: GitRemoteStatusPatch,
): GitRemoteProjectStatus {
    return {
        ...existingStatus,
        kind: patch.kind,
        lastCheckedAt: patch.checkedAt,
        lastPublishedAt: patch.publishedAt ?? existingStatus.lastPublishedAt,
        lastKnownLocalHead:
            patch.localHead ?? existingStatus.lastKnownLocalHead,
        lastKnownRemoteHead:
            patch.remoteHead ?? existingStatus.lastKnownRemoteHead,
        lastKnownLocalHeadAuthoredAt:
            patch.localHeadAuthoredAt ??
            existingStatus.lastKnownLocalHeadAuthoredAt,
        lastKnownRemoteHeadAuthoredAt:
            patch.remoteHeadAuthoredAt ??
            existingStatus.lastKnownRemoteHeadAuthoredAt,
        latestIncomingAuthorName: patch.latestIncomingAuthorName ?? null,
    };
}

export function buildStatusFromRemoteRelationship(args: {
    existingStatus: GitRemoteProjectStatus;
    relationship: GitRemoteRelationship;
    localHead: string | null;
    remoteHead: string | null;
    checkedAt: string;
    headMetadata: GitRemoteHeadMetadata;
}): GitRemoteProjectStatus {
    const latestIncomingAuthorName =
        args.relationship.kind === GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY ||
        args.relationship.kind === GIT_REMOTE_RELATIONSHIP_DIVERGED
            ? args.headMetadata.remoteAuthorName
            : null;

    switch (args.relationship.kind) {
        case GIT_REMOTE_RELATIONSHIP_UP_TO_DATE:
            return buildGitRemoteProjectStatus(args.existingStatus, {
                kind: GIT_REMOTE_PROJECT_STATUS_CONNECTED,
                checkedAt: args.checkedAt,
                localHead: args.localHead,
                remoteHead: args.remoteHead,
                localHeadAuthoredAt: args.headMetadata.localAuthoredAt,
                remoteHeadAuthoredAt: args.headMetadata.remoteAuthoredAt,
                latestIncomingAuthorName: null,
            });
        case GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY:
            return buildGitRemoteProjectStatus(args.existingStatus, {
                kind: GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE,
                checkedAt: args.checkedAt,
                localHead: args.localHead,
                remoteHead: args.remoteHead,
                localHeadAuthoredAt: args.headMetadata.localAuthoredAt,
                remoteHeadAuthoredAt: args.headMetadata.remoteAuthoredAt,
                latestIncomingAuthorName,
            });
        case GIT_REMOTE_RELATIONSHIP_DIVERGED:
            return buildGitRemoteProjectStatus(args.existingStatus, {
                kind: GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW,
                checkedAt: args.checkedAt,
                localHead: args.localHead,
                remoteHead: args.remoteHead,
                localHeadAuthoredAt: args.headMetadata.localAuthoredAt,
                remoteHeadAuthoredAt: args.headMetadata.remoteAuthoredAt,
                latestIncomingAuthorName,
            });
        case GIT_REMOTE_RELATIONSHIP_AHEAD_ONLY:
        case GIT_REMOTE_RELATIONSHIP_UNTRACKED:
            return buildGitRemoteProjectStatus(args.existingStatus, {
                kind: GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH,
                checkedAt: args.checkedAt,
                localHead: args.localHead,
                remoteHead: args.remoteHead,
                localHeadAuthoredAt: args.headMetadata.localAuthoredAt,
                remoteHeadAuthoredAt: args.headMetadata.remoteAuthoredAt,
                latestIncomingAuthorName: null,
            });
    }
}

/**
 * The decision `syncNow` makes before doing any IO.
 *
 * Pulling this out of the React hook lets us unit-test "given this durable
 * status + gate + settings, what should sync do?" without mounting anything,
 * and keeps the hook as a thin dispatcher over IO.
 */
export type RemoteSyncDecision =
    | { kind: "publish" }
    | { kind: "auto-accept-incoming"; suppressReviewModal: boolean }
    | {
          kind: "refresh-only";
          reason: "gated" | "recovered-conflicts" | "clean";
      };

export function decideRemoteSyncAction(args: {
    status: GitRemoteProjectStatus | null;
    gateOpen: boolean;
    hasRecoveredConflicts: boolean;
    autoAcceptIncomingWork: boolean;
}): RemoteSyncDecision {
    // Pending-publish is actionable regardless of the local gate: pushing
    // already-committed local work never touches the working buffer.
    if (args.status?.kind === GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH) {
        return { kind: "publish" };
    }

    // Incoming reconciliation mutates the working buffer, so it must not run
    // while the workspace is gated or unreviewed recovered conflicts remain.
    if (!args.gateOpen) return { kind: "refresh-only", reason: "gated" };
    if (args.hasRecoveredConflicts) {
        return { kind: "refresh-only", reason: "recovered-conflicts" };
    }

    const hasIncoming =
        args.status?.kind ===
            GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE ||
        args.status?.kind === GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW;
    if (hasIncoming && args.autoAcceptIncomingWork) {
        return {
            kind: "auto-accept-incoming",
            // behind-only (remoteUpdatesAvailable) is a safe fast-forward, so we
            // skip the review modal; diverged (needsReview) still surfaces it.
            suppressReviewModal:
                args.status?.kind ===
                GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE,
        };
    }

    return { kind: "refresh-only", reason: "clean" };
}

export function getRemoteSyncActionMode(
    status: GitRemoteProjectStatus | null,
    autoAcceptIncomingWork: boolean,
): RemoteSyncActionMode {
    if (!status) return "none";
    switch (status.kind) {
        case GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH:
            return "sync";
        case GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE:
        case GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW:
            return autoAcceptIncomingWork ? "sync" : "review";
        case GIT_REMOTE_PROJECT_STATUS_CONNECTED:
        case GIT_REMOTE_PROJECT_STATUS_OFFLINE:
        case GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED:
            return "none";
    }
}
