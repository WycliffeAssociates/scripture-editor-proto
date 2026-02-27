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

export interface GitProvider {
    ensureRepo(
        projectPath: string,
        opts: { defaultBranch: "master" },
    ): Promise<void>;
    getBranchInfo(projectPath: string): Promise<BranchInfo>;
    checkoutPreferredBranch(
        projectPath: string,
        opts: { prefer: "master" },
    ): Promise<void>;
    listHistory(
        projectPath: string,
        args: { limit: number; offset: number },
    ): Promise<VersionEntry[]>;
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
    isRepoHealthy(projectPath: string): Promise<boolean>;
}
