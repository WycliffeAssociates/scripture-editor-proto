import { invoke } from "@tauri-apps/api/core";
import type {
    BranchInfo,
    CommitRequest,
    GitProvider,
    VersionEntry,
} from "@/core/persistence/GitProvider.ts";
import {
    buildCommitMessage,
    parseAppCommitMetadata,
} from "@/core/persistence/gitVersionUtils.ts";

type TauriBranchInfo = {
    current: string;
    has_master: boolean;
    default_branch?: string | null;
    detached: boolean;
};

type TauriHistoryEntry = {
    hash: string;
    author_name: string;
    authored_at_unix: number;
    subject: string;
    body: string;
};

export class TauriGitProvider implements GitProvider {
    async ensureRepo(
        projectPath: string,
        opts: { defaultBranch: "main" | "master" },
    ): Promise<void> {
        await invoke("git_ensure_repo", {
            repoPath: projectPath,
            defaultBranch: opts.defaultBranch,
        });
    }

    async getBranchInfo(projectPath: string): Promise<BranchInfo> {
        const raw = await invoke<TauriBranchInfo>("git_get_branch_info", {
            repoPath: projectPath,
        });
        return {
            current: raw.current,
            hasMaster: raw.has_master,
            defaultBranch: raw.default_branch ?? undefined,
            detached: raw.detached,
        };
    }

    async checkoutPreferredBranch(
        projectPath: string,
        opts: { prefer: "main" | "master" },
    ): Promise<void> {
        await invoke("git_checkout_preferred_branch", {
            repoPath: projectPath,
            prefer: opts.prefer,
        });
    }

    async listHistory(
        projectPath: string,
        args: { limit: number; offset: number },
    ): Promise<VersionEntry[]> {
        const history = await invoke<TauriHistoryEntry[]>("git_list_history", {
            repoPath: projectPath,
            limit: args.limit,
            offset: args.offset,
        });
        return history.map((entry) => {
            const parsed = parseAppCommitMetadata({
                subject: entry.subject,
                body: entry.body,
            });
            return {
                hash: entry.hash,
                authorName: entry.author_name,
                authoredAtIso: new Date(
                    entry.authored_at_unix * 1000,
                ).toISOString(),
                subject: entry.subject,
                isAppCommit: parsed.isAppCommit,
                chapterSummary: parsed.chapterSummary,
                isExternal: parsed.isExternal,
            };
        });
    }

    async readProjectSnapshotAtCommit(
        projectPath: string,
        commitHash: string,
    ): Promise<Map<string, string>> {
        const raw = await invoke<Record<string, string>>(
            "git_read_project_snapshot_at_commit",
            {
                repoPath: projectPath,
                commitHash,
            },
        );
        return new Map(Object.entries(raw));
    }

    async restoreTrackedFilesFromCommit(
        projectPath: string,
        commitHash: string,
    ): Promise<void> {
        await invoke("git_restore_tracked_files_from_commit", {
            repoPath: projectPath,
            commitHash,
        });
    }

    async commitAll(
        projectPath: string,
        request: CommitRequest,
        author: { name: string; email: string },
    ): Promise<{ hash: string }> {
        const message = buildCommitMessage(request);
        const hash = await invoke<string>("git_commit_all", {
            repoPath: projectPath,
            message,
            authorName: author.name,
            authorEmail: author.email,
        });
        return { hash };
    }

    async isRepoHealthy(projectPath: string): Promise<boolean> {
        return invoke<boolean>("git_is_repo_healthy", {
            repoPath: projectPath,
        });
    }
}
