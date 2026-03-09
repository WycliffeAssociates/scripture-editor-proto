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
import { OpfsGitFs } from "@/web/adapters/git/OpfsGitFs.ts";

type WebGitRuntime = {
    ensureReady(): Promise<void>;
    fs: {
        promises: {
            lstat: (path: string) => Promise<unknown>;
            mkdir: (path: string, options?: unknown) => Promise<void>;
            readFile: (path: string, options?: unknown) => Promise<unknown>;
            readlink: (path: string, options?: unknown) => Promise<unknown>;
            readdir: (path: string, options?: unknown) => Promise<unknown>;
            rm: (path: string, options?: unknown) => Promise<void>;
            rmdir: (path: string, options?: unknown) => Promise<void>;
            stat: (path: string) => Promise<unknown>;
            symlink: (
                target: string,
                path: string,
                type?: unknown,
            ) => Promise<void>;
            unlink: (path: string) => Promise<void>;
            writeFile: (
                path: string,
                content: Uint8Array | string,
                options?: unknown,
            ) => Promise<void>;
        };
    };
};

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
        message.includes("Could not find HEAD") ||
        message.includes("reference 'refs/heads/") ||
        message.includes("headContent is null") ||
        (message.includes("startsWith") && message.includes("null")) ||
        message.includes("not found")
    );
}

function isLikelyGitDirRace(error: unknown): boolean {
    const message =
        error instanceof Error ? error.message : String(error ?? "");
    return /ENOENT/i.test(message) && message.includes(".git/");
}

function isNoEntryError(error: unknown): boolean {
    const message =
        error instanceof Error ? error.message : String(error ?? "");
    return /ENOENT|No such file or directory/i.test(message);
}

function isZenFsMessageMutationError(error: unknown): boolean {
    const message =
        error instanceof Error ? error.message : String(error ?? "");
    return (
        message.includes('setting getter-only property "message"') ||
        message.includes("setUVMessage")
    );
}

function isGitNotFoundError(error: unknown): boolean {
    const message =
        error instanceof Error ? error.message : String(error ?? "");
    return (
        message.includes("Could not find") ||
        message.includes("NotFoundError") ||
        /ENOENT|No such file or directory/i.test(message)
    );
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryFsMutation<T>(
    action: () => Promise<T>,
    shouldRetry: (error: unknown) => boolean,
): Promise<T> {
    const attempts = [0, 50, 250, 1000];
    let lastError: unknown = null;

    for (const waitMs of attempts) {
        if (waitMs > 0) {
            await delay(waitMs);
        }
        try {
            return await action();
        } catch (error) {
            lastError = error;
            if (!shouldRetry(error)) {
                throw error;
            }
        }
    }

    throw lastError;
}

export class WebGitProvider implements GitProvider {
    private readonly ensureRepoInFlight = new Map<string, Promise<void>>();
    private readonly commitAllInFlight = new Map<
        string,
        Promise<{ hash: string }>
    >();

    constructor(private readonly runtime: WebGitRuntime = new OpfsGitFs()) {}

    private async getFs() {
        await this.runtime.ensureReady();
        return this.runtime.fs;
    }

    private async fileExists(path: string): Promise<boolean> {
        const fs = await this.getFs();
        try {
            await fs.promises.stat(path);
            return true;
        } catch (error) {
            if (isNoEntryError(error)) {
                return false;
            }
            console.error("Error checking if file exists:", error);
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
        } catch (error) {
            console.error("Error checking if repo is healthy:", error);
            return false;
        }
    }

    async ensureRepo(
        projectPath: string,
        opts: { defaultBranch: "main" | "master" },
    ): Promise<void> {
        const dir = normalizeDir(projectPath);
        const inFlight = this.ensureRepoInFlight.get(dir);
        if (inFlight) {
            await inFlight;
            return;
        }

        const work = this.ensureRepoInternal(dir, opts).finally(() => {
            this.ensureRepoInFlight.delete(dir);
        });
        this.ensureRepoInFlight.set(dir, work);
        await work;
    }

    private async ensureRepoInternal(
        dir: string,
        opts: { defaultBranch: "main" | "master" },
    ): Promise<void> {
        const fs = await this.getFs();
        await fs.promises.mkdir(dir, { recursive: true });
        const gitDir = `${dir}/.git`;
        if (await this.fileExists(gitDir)) {
            if (await this.isHealthy(dir)) return;
            await this.tryRemoveDir(fs, gitDir);
        }

        await this.initRepoWithRetry(fs, dir, opts.defaultBranch);
        if (!(await this.waitForHealthyRepo(dir))) {
            throw new Error(
                `Repository init did not become healthy for ${dir}`,
            );
        }
    }

    private async initRepoWithRetry(
        fs: Awaited<ReturnType<WebGitProvider["getFs"]>>,
        dir: string,
        defaultBranch: "main" | "master",
    ): Promise<void> {
        const gitDir = `${dir}/.git`;
        const attempts = [0, 50, 250, 1000];
        let lastError: unknown = null;

        for (const waitMs of attempts) {
            if (waitMs > 0) {
                await delay(waitMs);
            }
            try {
                await git.init({ fs, dir, defaultBranch });
                return;
            } catch (error) {
                lastError = error;
                if (
                    !isLikelyGitDirRace(error) &&
                    !isZenFsMessageMutationError(error)
                ) {
                    throw error;
                }
                await this.tryRemoveDir(fs, gitDir);
            }
        }

        throw lastError;
    }

    private async waitForHealthyRepo(dir: string): Promise<boolean> {
        const attempts = [0, 50, 250, 1000];

        for (const waitMs of attempts) {
            if (waitMs > 0) {
                await delay(waitMs);
            }
            if (await this.isHealthy(dir)) {
                return true;
            }
        }

        return false;
    }

    private async tryRemoveDir(
        fs: Awaited<ReturnType<WebGitProvider["getFs"]>>,
        path: string,
    ): Promise<void> {
        try {
            await fs.promises.rm(path, { recursive: true, force: true });
        } catch (error) {
            if (!isNoEntryError(error)) {
                throw error;
            }
        }
    }

    async getBranchInfo(projectPath: string): Promise<BranchInfo> {
        const fs = await this.getFs();
        const dir = normalizeDir(projectPath);
        let branches: string[] = [];
        try {
            branches = await git.listBranches({ fs, dir });
        } catch (error) {
            if (!isMissingHeadError(error)) {
                throw error;
            }
        }
        let current = "";
        try {
            current =
                (await git.currentBranch({ fs, dir, fullname: false })) ?? "";
        } catch (error) {
            if (!isMissingHeadError(error)) {
                throw error;
            }
        }
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
        opts: { prefer: "main" | "master" },
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
        const dir = normalizeDir(projectPath);
        const inFlight = this.commitAllInFlight.get(dir);
        if (inFlight) {
            await inFlight;
        }

        const work = this.commitAllInternal(dir, request, author).finally(
            () => {
                this.commitAllInFlight.delete(dir);
            },
        );
        this.commitAllInFlight.set(dir, work);
        return await work;
    }

    private async repairGitLayout(
        fs: Awaited<ReturnType<WebGitProvider["getFs"]>>,
        dir: string,
    ) {
        await retryFsMutation(
            () => fs.promises.mkdir(`${dir}/.git`, { recursive: true }),
            (error) =>
                isNoEntryError(error) || isZenFsMessageMutationError(error),
        );
        await retryFsMutation(
            () => fs.promises.mkdir(`${dir}/.git/hooks`, { recursive: true }),
            (error) =>
                isNoEntryError(error) || isZenFsMessageMutationError(error),
        );
        await retryFsMutation(
            () => fs.promises.mkdir(`${dir}/.git/objects`, { recursive: true }),
            (error) =>
                isNoEntryError(error) || isZenFsMessageMutationError(error),
        );
        await retryFsMutation(
            () => fs.promises.mkdir(`${dir}/.git/refs`, { recursive: true }),
            (error) =>
                isNoEntryError(error) || isZenFsMessageMutationError(error),
        );
        await retryFsMutation(
            () =>
                fs.promises.mkdir(`${dir}/.git/refs/heads`, {
                    recursive: true,
                }),
            (error) =>
                isNoEntryError(error) || isZenFsMessageMutationError(error),
        );
    }

    private async stageMatrix(
        fs: Awaited<ReturnType<WebGitProvider["getFs"]>>,
        dir: string,
        matrix: Awaited<ReturnType<typeof git.statusMatrix>>,
    ): Promise<boolean> {
        let hasChanges = false;
        for (const [filepath, head, workdir, stage] of matrix) {
            if (workdir === 0) {
                if (head !== 0 || stage !== 0) {
                    await this.stageWithRetry({
                        fs,
                        dir,
                        filepath,
                        op: "remove",
                    });
                    hasChanges = true;
                }
                continue;
            }

            if (head !== workdir || stage !== workdir) {
                await this.stageWithRetry({
                    fs,
                    dir,
                    filepath,
                    op: "add",
                });
                hasChanges = true;
            }
        }
        return hasChanges;
    }

    private async stageWithRetry(args: {
        fs: Awaited<ReturnType<WebGitProvider["getFs"]>>;
        dir: string;
        filepath: string;
        op: "add" | "remove";
    }): Promise<void> {
        const attempts = [0, 50, 250, 1000];
        let lastError: unknown = null;

        for (const waitMs of attempts) {
            if (waitMs > 0) {
                await delay(waitMs);
            }
            try {
                if (args.op === "add") {
                    await git.add({
                        fs: args.fs,
                        dir: args.dir,
                        filepath: args.filepath,
                    });
                } else {
                    await git.remove({
                        fs: args.fs,
                        dir: args.dir,
                        filepath: args.filepath,
                    });
                }
                return;
            } catch (error) {
                lastError = error;
                if (!isGitNotFoundError(error)) {
                    throw error;
                }
            }
        }

        // `.gitignore` is created immediately before baseline commit on web.
        // If ZenFS still cannot observe it after a short retry window, skip it
        // for this commit rather than failing project open.
        if (args.filepath === ".gitignore") {
            return;
        }

        throw lastError;
    }

    private async commitAllInternal(
        dir: string,
        request: CommitRequest,
        author: { name: string; email: string },
    ): Promise<{ hash: string }> {
        const fs = await this.getFs();
        let matrix = await git.statusMatrix({ fs, dir });
        let hasChanges = false;
        try {
            hasChanges = await this.stageMatrix(fs, dir, matrix);
        } catch (error) {
            if (!isZenFsMessageMutationError(error)) {
                throw error;
            }
            await this.repairGitLayout(fs, dir);
            matrix = await git.statusMatrix({ fs, dir });
            hasChanges = await this.stageMatrix(fs, dir, matrix);
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

        let hash: string;
        try {
            hash = await git.commit({
                fs,
                dir,
                author: {
                    name: author.name,
                    email: author.email,
                },
                message: buildCommitMessage(request),
            });
        } catch (error) {
            if (!isZenFsMessageMutationError(error)) {
                throw error;
            }
            await this.repairGitLayout(fs, dir);
            hash = await git.commit({
                fs,
                dir,
                author: {
                    name: author.name,
                    email: author.email,
                },
                message: buildCommitMessage(request),
            });
        }
        return { hash };
    }

    async isRepoHealthy(projectPath: string): Promise<boolean> {
        const dir = normalizeDir(projectPath);
        return this.isHealthy(dir);
    }
}
