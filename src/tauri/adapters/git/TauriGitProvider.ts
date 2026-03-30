import { invoke } from "@tauri-apps/api/core";
import type {
    BranchInfo,
    CommitRequest,
    GitProvider,
    GitRemoteAuth,
    GitRemoteInspection,
    GitRemotePublishResult,
    GitRemoteReplayPlan,
    VersionEntry,
} from "@/core/persistence/GitProvider.ts";
import {
    buildCommitMessage,
    parseAppCommitMetadata,
} from "@/core/persistence/gitVersionUtils.ts";

/**
 * Desktop git adapter for the shared {@link GitProvider} seam.
 *
 * The app uses this after a scripture item has already been imported and loaded.
 * From the rest of the app's perspective, git history and restore operations are
 * just capabilities on an editable scripture workspace. This adapter isolates the
 * Tauri/Rust IPC needed to make that possible on desktop.
 */
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

type TauriRemoteRelationship = {
    kind: string;
    local_head: string | null;
    remote_head: string | null;
    merge_base: string | null;
};

type TauriRemoteInspection = {
    local_head: string | null;
    remote_head: string | null;
    merge_base: string | null;
    relationship: TauriRemoteRelationship;
};

type TauriRemoteReplayPlan = {
    strategy: string;
    commit_hashes: string[];
    relationship: TauriRemoteRelationship;
};

type TauriRemotePublishResult = {
    outcome: GitRemotePublishResult["outcome"];
    local_head: string | null;
    remote_head: string | null;
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

    async inspectRemoteHeads(_args: {
        projectPath: string;
        remoteName: string;
        branch: string;
        auth: GitRemoteAuth;
    }): Promise<GitRemoteInspection> {
        const raw = await invoke<TauriRemoteInspection>(
            "git_inspect_remote_heads",
            {
                repoPath: _args.projectPath,
                remoteName: _args.remoteName,
                branch: _args.branch,
            },
        );
        return {
            localHead: raw.local_head,
            remoteHead: raw.remote_head,
            mergeBase: raw.merge_base,
            relationship: {
                kind: raw.relationship
                    .kind as GitRemoteInspection["relationship"]["kind"],
                localHead: raw.relationship.local_head,
                remoteHead: raw.relationship.remote_head,
                mergeBase: raw.relationship.merge_base,
            },
        };
    }

    async fetchRemoteHeads(_args: {
        projectPath: string;
        remoteName: string;
        branch: string;
        auth: GitRemoteAuth;
    }): Promise<GitRemoteInspection> {
        const raw = await invoke<TauriRemoteInspection>(
            "git_fetch_remote_heads",
            {
                repoPath: _args.projectPath,
                remoteName: _args.remoteName,
                branch: _args.branch,
                username: _args.auth.username,
                token: _args.auth.token,
            },
        );
        return {
            localHead: raw.local_head,
            remoteHead: raw.remote_head,
            mergeBase: raw.merge_base,
            relationship: {
                kind: raw.relationship
                    .kind as GitRemoteInspection["relationship"]["kind"],
                localHead: raw.relationship.local_head,
                remoteHead: raw.relationship.remote_head,
                mergeBase: raw.relationship.merge_base,
            },
        };
    }

    async pushCurrentBranch(_args: {
        projectPath: string;
        remoteName: string;
        branch: string;
        auth: GitRemoteAuth;
    }): Promise<GitRemotePublishResult> {
        const raw = await invoke<TauriRemotePublishResult>(
            "git_push_current_branch",
            {
                repoPath: _args.projectPath,
                remoteName: _args.remoteName,
                branch: _args.branch,
                username: _args.auth.username,
                token: _args.auth.token,
            },
        );
        return {
            outcome: raw.outcome,
            localHead: raw.local_head,
            remoteHead: raw.remote_head,
        };
    }

    async planReplayOntoRemote(_args: {
        projectPath: string;
        remoteName: string;
        branch: string;
        auth: GitRemoteAuth;
    }): Promise<GitRemoteReplayPlan> {
        const raw = await invoke<TauriRemoteReplayPlan>(
            "git_plan_replay_onto_remote",
            {
                repoPath: _args.projectPath,
                remoteName: _args.remoteName,
                branch: _args.branch,
            },
        );
        return {
            strategy: raw.strategy as GitRemoteReplayPlan["strategy"],
            commitHashes: raw.commit_hashes,
            relationship: {
                kind: raw.relationship
                    .kind as GitRemoteInspection["relationship"]["kind"],
                localHead: raw.relationship.local_head,
                remoteHead: raw.relationship.remote_head,
                mergeBase: raw.relationship.merge_base,
            },
        };
    }

    async isRepoHealthy(projectPath: string): Promise<boolean> {
        return invoke<boolean>("git_is_repo_healthy", {
            repoPath: projectPath,
        });
    }
}
