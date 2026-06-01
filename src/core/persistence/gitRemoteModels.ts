import * as v from "valibot";
import { normalizeStoragePath } from "@/core/persistence/pathUtils.ts";

/**
 * Shared cloud-publishing state nouns.
 *
 * The product language stays "cloud", but implementation code uses "git remote"
 * so the persistence and transport seams stay precise. This file is the one
 * place that defines the durable record shapes and canonical status values.
 */
export const GIT_REMOTE_INFO_SCHEMA_VERSION = 1;

export const GIT_REMOTE_PROJECT_STATUS_VALUES = [
    "connected",
    "offline",
    "pendingPublish",
    "remoteUpdatesAvailable",
    "needsReview",
    "reauthRequired",
] as const;

export type GitRemoteProjectStatusKind =
    (typeof GIT_REMOTE_PROJECT_STATUS_VALUES)[number];

export const [
    GIT_REMOTE_PROJECT_STATUS_CONNECTED,
    GIT_REMOTE_PROJECT_STATUS_OFFLINE,
    GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH,
    GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE,
    GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW,
    GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED,
] = GIT_REMOTE_PROJECT_STATUS_VALUES;

const LEGACY_GIT_REMOTE_PROJECT_STATUS_SYNCING = "syncing";

const GIT_REMOTE_REVOCATION_STATE_VALUES = [
    "pending",
    "terminalFailure",
    "retryLimitReached",
] as const;

const NonEmptyStringSchema = v.pipe(v.string(), v.nonEmpty());

const GitRemoteProjectInfoSchema = v.object({
    schemaVersion: v.literal(GIT_REMOTE_INFO_SCHEMA_VERSION),
    projectPath: NonEmptyStringSchema,
    hostBaseUrl: NonEmptyStringSchema,
    repoId: NonEmptyStringSchema,
    repoOwner: NonEmptyStringSchema,
    repoName: NonEmptyStringSchema,
    repoUrl: NonEmptyStringSchema,
    trackedBranch: NonEmptyStringSchema,
});

const GitRemoteProjectStatusSchema = v.object({
    projectPath: NonEmptyStringSchema,
    kind: v.picklist(GIT_REMOTE_PROJECT_STATUS_VALUES),
    lastCheckedAt: v.nullish(v.string()),
    lastPublishedAt: v.nullish(v.string()),
    lastKnownLocalHead: v.nullish(v.string()),
    lastKnownRemoteHead: v.nullish(v.string()),
    lastKnownLocalHeadAuthoredAt: v.nullish(v.string()),
    lastKnownRemoteHeadAuthoredAt: v.nullish(v.string()),
    latestIncomingAuthorName: v.nullish(v.string()),
});

const GitRemoteSessionSchema = v.object({
    hostBaseUrl: NonEmptyStringSchema,
    username: NonEmptyStringSchema,
    token: NonEmptyStringSchema,
    tokenName: v.nullish(v.string()),
    tokenId: v.nullish(v.string()),
});

const GitRemotePendingRevocationSchema = v.object({
    hostBaseUrl: NonEmptyStringSchema,
    tokenId: NonEmptyStringSchema,
    tokenName: v.nullish(v.string()),
    retryCount: v.number(),
    lastAttemptedAt: v.nullish(v.string()),
    lastFailureReason: v.nullish(v.string()),
    state: v.picklist(GIT_REMOTE_REVOCATION_STATE_VALUES),
});

export type GitRemoteProjectInfo = v.InferOutput<
    typeof GitRemoteProjectInfoSchema
>;

export type GitRemoteProjectStatus = v.InferOutput<
    typeof GitRemoteProjectStatusSchema
>;

export type GitRemoteSession = v.InferOutput<typeof GitRemoteSessionSchema>;

export type GitRemotePendingRevocation = v.InferOutput<
    typeof GitRemotePendingRevocationSchema
>;

export function normalizeGitRemoteProjectPath(projectPath: string): string {
    return normalizeStoragePath(projectPath);
}

export function createDefaultGitRemoteProjectStatus(
    projectPath: string,
): GitRemoteProjectStatus {
    return {
        projectPath: normalizeGitRemoteProjectPath(projectPath),
        kind: GIT_REMOTE_PROJECT_STATUS_CONNECTED,
        lastCheckedAt: null,
        lastPublishedAt: null,
        lastKnownLocalHead: null,
        lastKnownRemoteHead: null,
        lastKnownLocalHeadAuthoredAt: null,
        lastKnownRemoteHeadAuthoredAt: null,
        latestIncomingAuthorName: null,
    };
}

function isGitRemoteProjectStatusKind(
    value: unknown,
): value is GitRemoteProjectStatusKind {
    return v.is(v.picklist(GIT_REMOTE_PROJECT_STATUS_VALUES), value);
}

export function parseGitRemoteProjectInfo(
    value: unknown,
): GitRemoteProjectInfo {
    const parsed = v.safeParse(GitRemoteProjectInfoSchema, value);
    if (!parsed.success) {
        const record = asLooseRecord(value);
        if (record?.schemaVersion !== GIT_REMOTE_INFO_SCHEMA_VERSION) {
            throw new Error(
                `Unsupported git remote info schema version: ${String(record?.schemaVersion)}`,
            );
        }
        throw new Error(
            v.flatten(parsed.issues).root?.[0] ??
                "Invalid git remote info record",
        );
    }

    return {
        schemaVersion: GIT_REMOTE_INFO_SCHEMA_VERSION,
        projectPath: normalizeGitRemoteProjectPath(parsed.output.projectPath),
        hostBaseUrl: parsed.output.hostBaseUrl,
        repoId: parsed.output.repoId,
        repoOwner: parsed.output.repoOwner,
        repoName: parsed.output.repoName,
        repoUrl: parsed.output.repoUrl,
        trackedBranch: parsed.output.trackedBranch,
    };
}

export function parseGitRemoteProjectStatus(
    value: unknown,
): GitRemoteProjectStatus {
    const parsed = v.safeParse(GitRemoteProjectStatusSchema, value);
    if (!parsed.success) {
        const record = asLooseRecord(value);
        if (
            typeof record?.kind === "string" &&
            !isGitRemoteProjectStatusKind(record.kind)
        ) {
            if (record.kind === LEGACY_GIT_REMOTE_PROJECT_STATUS_SYNCING) {
                if (
                    typeof record.projectPath !== "string" ||
                    record.projectPath.length === 0
                ) {
                    throw new Error("Invalid git remote project status record");
                }
                return {
                    projectPath: normalizeGitRemoteProjectPath(
                        record.projectPath,
                    ),
                    kind: GIT_REMOTE_PROJECT_STATUS_CONNECTED,
                    lastCheckedAt:
                        typeof record.lastCheckedAt === "string"
                            ? record.lastCheckedAt
                            : null,
                    lastPublishedAt:
                        typeof record.lastPublishedAt === "string"
                            ? record.lastPublishedAt
                            : null,
                    lastKnownLocalHead:
                        typeof record.lastKnownLocalHead === "string"
                            ? record.lastKnownLocalHead
                            : null,
                    lastKnownRemoteHead:
                        typeof record.lastKnownRemoteHead === "string"
                            ? record.lastKnownRemoteHead
                            : null,
                    lastKnownLocalHeadAuthoredAt:
                        typeof record.lastKnownLocalHeadAuthoredAt === "string"
                            ? record.lastKnownLocalHeadAuthoredAt
                            : null,
                    lastKnownRemoteHeadAuthoredAt:
                        typeof record.lastKnownRemoteHeadAuthoredAt === "string"
                            ? record.lastKnownRemoteHeadAuthoredAt
                            : null,
                    latestIncomingAuthorName:
                        typeof record.latestIncomingAuthorName === "string"
                            ? record.latestIncomingAuthorName
                            : null,
                };
            }
            throw new Error(
                `Unsupported git remote project status: ${record.kind}`,
            );
        }
        throw new Error(
            v.flatten(parsed.issues).root?.[0] ??
                "Invalid git remote project status record",
        );
    }

    return {
        projectPath: normalizeGitRemoteProjectPath(parsed.output.projectPath),
        kind: parsed.output.kind,
        lastCheckedAt: parsed.output.lastCheckedAt ?? null,
        lastPublishedAt: parsed.output.lastPublishedAt ?? null,
        lastKnownLocalHead: parsed.output.lastKnownLocalHead ?? null,
        lastKnownRemoteHead: parsed.output.lastKnownRemoteHead ?? null,
        lastKnownLocalHeadAuthoredAt:
            parsed.output.lastKnownLocalHeadAuthoredAt ?? null,
        lastKnownRemoteHeadAuthoredAt:
            parsed.output.lastKnownRemoteHeadAuthoredAt ?? null,
        latestIncomingAuthorName:
            parsed.output.latestIncomingAuthorName ?? null,
    };
}

export function parseGitRemoteSession(value: unknown): GitRemoteSession {
    const parsed = v.parse(GitRemoteSessionSchema, value);
    return {
        hostBaseUrl: parsed.hostBaseUrl,
        username: parsed.username,
        token: parsed.token,
        tokenName: parsed.tokenName ?? null,
        tokenId: parsed.tokenId ?? null,
    };
}

export function parseGitRemotePendingRevocation(
    value: unknown,
): GitRemotePendingRevocation {
    const parsed = v.parse(GitRemotePendingRevocationSchema, value);
    return {
        hostBaseUrl: parsed.hostBaseUrl,
        tokenId: parsed.tokenId,
        tokenName: parsed.tokenName ?? null,
        retryCount: parsed.retryCount,
        lastAttemptedAt: parsed.lastAttemptedAt ?? null,
        lastFailureReason: parsed.lastFailureReason ?? null,
        state: parsed.state,
    };
}

function asLooseRecord(value: unknown): Record<string, unknown> | null {
    if (!v.is(v.record(v.string(), v.unknown()), value)) {
        return null;
    }
    return value as Record<string, unknown>;
}
