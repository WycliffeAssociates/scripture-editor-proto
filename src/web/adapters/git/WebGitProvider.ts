import * as git from "isomorphic-git";
import type {
    BranchInfo,
    CommitRequest,
    GitProvider,
    VersionEntry,
} from "@/core/persistence/GitProvider.ts";
import {
    buildCommitMessage,
    parseAppCommitMetadata,
    resolvePreferredBranch,
} from "@/core/persistence/gitVersionUtils.ts";
import { WebZenFsRuntime } from "@/web/zenfs/WebZenFsRuntime.ts";

function normalizeDir(path: string): string {
    return path.startsWith("/") ? path : `/${path}`;
}

function dirname(path: string): string {
    const idx = path.lastIndexOf("/");
    if (idx <= 0) return "/";
    return path.slice(0, idx);
}

function isMissingHeadError(error: unknown): boolean {
    const message =
        error instanceof Error ? error.message : String(error ?? "");
    return (
        message.includes("Could not find refs/heads/") ||
        message.includes("Could not find HEAD")
    );
}

export class WebGitProvider implements GitProvider {
    constructor(
        private readonly runtime: Pick<
            WebZenFsRuntime,
            "ensureReady" | "fs"
        > = new WebZenFsRuntime(),
    ) {}

    private async getFs() {
        await this.runtime.ensureReady();
        return this.runtime.fs;
    }

    private async fileExists(path: string): Promise<boolean> {
        const fs = await this.getFs();
        try {
            await fs.promises.stat(path);
            return true;
        } catch {
            return false;
        }
    }

    private async isHealthy(dir: string): Promise<boolean> {
        const fs = await this.getFs();
        if (!(await this.fileExists(`${dir}/.git`))) return false;
        try {
            await git.listBranches({ fs, dir });
            await git.statusMatrix({ fs, dir });
            return true;
        } catch {
            return false;
        }
    }

    async ensureRepo(
        projectPath: string,
        opts: { defaultBranch: "master" },
    ): Promise<void> {
        const fs = await this.getFs();
        const dir = normalizeDir(projectPath);
        await fs.promises.mkdir(dir, { recursive: true });
        const gitDir = `${dir}/.git`;
        if (await this.fileExists(gitDir)) {
            if (await this.isHealthy(dir)) return;
            await fs.promises.rm(gitDir, { recursive: true, force: true });
        }
        await git.init({ fs, dir, defaultBranch: opts.defaultBranch });
    }

    async getBranchInfo(projectPath: string): Promise<BranchInfo> {
        const fs = await this.getFs();
        const dir = normalizeDir(projectPath);
        const branches = await git.listBranches({ fs, dir });
        const current =
            (await git.currentBranch({ fs, dir, fullname: false })) ?? "";
        const detached = current.length === 0;
        return {
            current,
            hasMaster: branches.includes("master"),
            defaultBranch:
                current ||
                (branches.includes("main")
                    ? "main"
                    : branches.includes("master")
                      ? "master"
                      : branches[0]),
            detached,
        };
    }

    async checkoutPreferredBranch(
        projectPath: string,
        opts: { prefer: "master" },
    ): Promise<void> {
        const fs = await this.getFs();
        const dir = normalizeDir(projectPath);
        const info = await this.getBranchInfo(projectPath);
        const target = resolvePreferredBranch({ ...info, prefer: opts.prefer });
        if (!target) {
            throw new Error("No branch available to checkout.");
        }
        await git.checkout({ fs, dir, ref: target, force: true });
    }

    async listHistory(
        projectPath: string,
        args: { limit: number; offset: number },
    ): Promise<VersionEntry[]> {
        const fs = await this.getFs();
        const dir = normalizeDir(projectPath);
        let logEntries: Awaited<ReturnType<typeof git.log>>;
        try {
            logEntries = await git.log({
                fs,
                dir,
                depth: args.limit + args.offset,
                ref: "HEAD",
            });
        } catch (error) {
            if (isMissingHeadError(error)) {
                return [];
            }
            throw error;
        }
        return logEntries
            .slice(args.offset, args.offset + args.limit)
            .map((entry) => {
                const fullMessage = entry.commit.message ?? "";
                const [subject, ...bodyLines] = fullMessage.split(/\r?\n/u);
                const body = bodyLines.join("\n");
                const parsed = parseAppCommitMetadata({ subject, body });
                return {
                    hash: entry.oid,
                    authorName: entry.commit.author.name,
                    authoredAtIso: new Date(
                        (entry.commit.author.timestamp ?? 0) * 1000,
                    ).toISOString(),
                    subject,
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
        const fs = await this.getFs();
        const dir = normalizeDir(projectPath);
        const files = await git.listFiles({ fs, dir, ref: commitHash });
        const snapshot = new Map<string, string>();
        for (const filepath of files) {
            const blob = await git.readBlob({
                fs,
                dir,
                oid: commitHash,
                filepath,
            });
            snapshot.set(filepath, new TextDecoder().decode(blob.blob));
        }
        return snapshot;
    }

    async restoreTrackedFilesFromCommit(
        projectPath: string,
        commitHash: string,
    ): Promise<void> {
        const fs = await this.getFs();
        const dir = normalizeDir(projectPath);
        const targetFiles = new Set(
            await git.listFiles({ fs, dir, ref: commitHash }),
        );
        const currentFiles = new Set(
            await git.listFiles({ fs, dir, ref: "HEAD" }),
        );

        for (const currentFile of currentFiles) {
            if (targetFiles.has(currentFile)) continue;
            await fs.promises.rm(`${dir}/${currentFile}`);
        }

        for (const filepath of targetFiles) {
            const blob = await git.readBlob({
                fs,
                dir,
                oid: commitHash,
                filepath,
            });
            const fullPath = `${dir}/${filepath}`;
            await fs.promises.mkdir(dirname(fullPath), { recursive: true });
            await fs.promises.writeFile(fullPath, blob.blob);
        }
    }

    async commitAll(
        projectPath: string,
        request: CommitRequest,
        author: { name: string; email: string },
    ): Promise<{ hash: string }> {
        const fs = await this.getFs();
        const dir = normalizeDir(projectPath);
        const matrix = await git.statusMatrix({ fs, dir });
        let hasChanges = false;

        for (const [filepath, head, workdir, stage] of matrix) {
            if (workdir === 0) {
                if (head !== 0 || stage !== 0) {
                    await git.remove({ fs, dir, filepath });
                    hasChanges = true;
                }
                continue;
            }

            if (head !== workdir || stage !== workdir) {
                await git.add({ fs, dir, filepath });
                hasChanges = true;
            }
        }

        let headHash: string | null = null;
        try {
            headHash = await git.resolveRef({ fs, dir, ref: "HEAD" });
        } catch (error) {
            if (!isMissingHeadError(error)) {
                throw error;
            }
        }

        if (!hasChanges && headHash) {
            return { hash: headHash };
        }

        const hash = await git.commit({
            fs,
            dir,
            author: {
                name: author.name,
                email: author.email,
            },
            message: buildCommitMessage(request),
        });
        return { hash };
    }

    async isRepoHealthy(projectPath: string): Promise<boolean> {
        const dir = normalizeDir(projectPath);
        return this.isHealthy(dir);
    }
}
