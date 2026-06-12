import type {
  GitRemoteRelationship,
  GitRemoteReplayStrategy,
} from "@/core/persistence/gitRemoteRelationship.ts";

export type CommitOperation = "baseline" | "save";

export type VersionEntry = {
  hash: string;
  authorName: string;
  authoredAtIso: string;
  subject: string;
  isAppCommit: boolean;
  chapterSummary?: string[];
  isExternal: boolean;
};

export type CommitRequest = {
  op: CommitOperation;
  timestampIso: string;
  changedChapters: string[];
};

export type BranchInfo = {
  current: string;
  hasMaster: boolean;
  defaultBranch?: string;
  detached: boolean;
};

export type PreferredBranch = "main" | "master";

export type GitRemoteHeads = {
  localHead: string | null;
  remoteHead: string | null;
  mergeBase: string | null;
};

export type GitRemoteInspection = GitRemoteHeads & {
  relationship: GitRemoteRelationship;
};

export type GitRemoteAuth = {
  username: string;
  token: string;
};

export type GitRemoteReplayPlan = {
  strategy: GitRemoteReplayStrategy;
  commitHashes: string[];
  relationship: GitRemoteRelationship;
};

export const GIT_REMOTE_PUBLISH_OUTCOME_VALUES = [
  "published",
  "remoteAdvanced",
  "offline",
  "authFailed",
] as const;

export type GitRemotePublishOutcome =
  (typeof GIT_REMOTE_PUBLISH_OUTCOME_VALUES)[number];

export const [
  GIT_REMOTE_PUBLISH_PUBLISHED,
  GIT_REMOTE_PUBLISH_REMOTE_ADVANCED,
  GIT_REMOTE_PUBLISH_OFFLINE,
  GIT_REMOTE_PUBLISH_AUTH_FAILED,
] = GIT_REMOTE_PUBLISH_OUTCOME_VALUES;

export type GitRemotePublishResult = {
  outcome: GitRemotePublishOutcome;
  localHead: string | null;
  remoteHead: string | null;
};

export type GitRemoteReplayResult = {
  head: string | null;
  replayedCommitHashes: string[];
};

export type GitRemoteCloneResult = {
  head: string | null;
};

export type GitCommitDetails = {
  hash: string;
  authorName: string;
  authoredAtIso: string;
  subject: string;
};

/**
 * Platform-neutral git contract used by save/history/version flows for editable
 * scripture workspaces.
 */
export interface GitProvider {
  ensureRepo(
    projectPath: string,
    opts: { defaultBranch: PreferredBranch },
  ): Promise<void>;
  getBranchInfo(projectPath: string): Promise<BranchInfo>;
  checkoutPreferredBranch(
    projectPath: string,
    opts: { prefer: PreferredBranch },
  ): Promise<void>;
  listHistory(
    projectPath: string,
    args: { limit: number; offset: number },
  ): Promise<VersionEntry[]>;
  readCommitDetails(
    projectPath: string,
    commitHash: string,
  ): Promise<GitCommitDetails>;
  readProjectSnapshotAtCommit(
    projectPath: string,
    commitHash: string,
  ): Promise<Map<string, string>>;
  restoreTrackedFilesFromCommit(
    projectPath: string,
    commitHash: string,
  ): Promise<void>;
  commitAll(
    projectPath: string,
    request: CommitRequest,
    author: { name: string; email: string },
  ): Promise<{ hash: string }>;
  cloneRemoteRepo(args: {
    projectPath: string;
    remoteUrl: string;
    branch?: string;
    auth: GitRemoteAuth;
  }): Promise<GitRemoteCloneResult>;
  ensureRemote(args: {
    projectPath: string;
    remoteName: string;
    remoteUrl: string;
  }): Promise<void>;
  inspectRemoteHeads(args: {
    projectPath: string;
    remoteName: string;
    branch: string;
    auth: GitRemoteAuth;
  }): Promise<GitRemoteInspection>;
  fetchRemoteHeads(args: {
    projectPath: string;
    remoteName: string;
    branch: string;
    auth: GitRemoteAuth;
  }): Promise<GitRemoteInspection>;
  pushCurrentBranch(args: {
    projectPath: string;
    remoteName: string;
    branch: string;
    auth: GitRemoteAuth;
  }): Promise<GitRemotePublishResult>;
  planReplayOntoRemote(args: {
    projectPath: string;
    remoteName: string;
    branch: string;
    auth: GitRemoteAuth;
  }): Promise<GitRemoteReplayPlan>;
  applyReplayPlanOntoRemote(args: {
    projectPath: string;
    branch: string;
    remoteHead: string;
    commitHashes: string[];
  }): Promise<GitRemoteReplayResult>;
  isRepoHealthy(projectPath: string): Promise<boolean>;
}
