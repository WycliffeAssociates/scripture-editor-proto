import git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import { getFs, tauriFs } from "./tauriFs";

type ProgressCallback = (progress: {
    phase: string;
    loaded: number;
    total: number;
}) => void;

export class GitService {
    private static instance: GitService;
    private fs = tauriFs;
    private http = http;

    private constructor() {
        // Private constructor to enforce singleton
    }

    public static async getInstance(): Promise<GitService> {
        if (!GitService.instance) {
            const instance = new GitService();
            instance.fs = await getFs();
            GitService.instance = instance;
        }
        return GitService.instance;
    }

    /**
     * Initialize a new Git repository
     */
    async initRepo(dir: string): Promise<void> {
        try {
            await git.init({
                fs: this.fs,
                dir,
                defaultBranch: "main",
            });
        } catch (error) {
            console.error("Error initializing Git repository:", error);
            throw error;
        }
    }

    /**
     * Clone a remote repository
     */
    async cloneRepo({
        url,
        dir,
        onProgress,
        // todo: meh, not sure here?
        corsProxy = "https://cors.isomorphic-git.org",
    }: {
        url: string;
        dir: string;
        onProgress?: ProgressCallback;
        corsProxy?: string;
    }): Promise<void> {
        try {
            await git.clone({
                fs: this.fs,
                http: this.http,
                dir,
                url,
                corsProxy,
                onProgress: onProgress
                    ? ({ phase, loaded, total }) =>
                          onProgress({ phase, loaded, total: total || 0 })
                    : undefined,
            });
        } catch (error) {
            console.error("Error cloning repository:", error);
            throw error;
        }
    }

    /**
     * Stage files for commit
     */
    async add({
        dir,
        filepath,
    }: {
        dir: string;
        filepath: string | string[];
    }): Promise<void> {
        try {
            await git.add({
                fs: this.fs,
                dir,
                filepath,
            });
        } catch (error) {
            console.error(`Error adding ${filepath} to git:`, error);
            throw error;
        }
    }

    /**
     * Create a new commit
     */
    async commit({
        dir,
        message,
        author,
    }: {
        dir: string;
        message: string;
        author: { name: string; email: string };
    }): Promise<string | undefined> {
        try {
            const sha = await git.commit({
                fs: this.fs,
                dir,
                message,
                author,
            });
            return sha;
        } catch (error) {
            console.error("Error committing changes:", error);
            throw error;
        }
    }

    /**
     * Get the status of files in the working directory
     */
    async statusMatrix({
        dir,
        filter = () => true,
    }: {
        dir: string;
        filter?: (filepath: string) => boolean;
    }): Promise<Array<[string, number, number, number]>> {
        try {
            return await git.statusMatrix({
                fs: this.fs,
                dir,
                filter,
            });
        } catch (error) {
            console.error("Error getting status matrix:", error);
            throw error;
        }
    }

    /**
     * Get the current branch
     */
    async currentBranch(dir: string) {
        try {
            return await git.currentBranch({
                fs: this.fs,
                dir,
                fullname: false,
            });
        } catch (error) {
            console.error("Error getting current branch:", error);
            return undefined;
        }
    }

    /**
     * List all branches
     */
    async listBranches(dir: string): Promise<string[]> {
        try {
            return await git.listBranches({
                fs: this.fs,
                dir,
            });
        } catch (error) {
            console.error("Error listing branches:", error);
            return [];
        }
    }

    /**
     * Pull changes from remote
     */
    async pull({
        dir,
        remote = "origin",
        ref = "main",
        onProgress,
    }: {
        dir: string;
        remote?: string;
        ref?: string;
        onProgress?: ProgressCallback;
    }): Promise<void> {
        try {
            await git.pull({
                fs: this.fs,
                http: this.http,
                dir,
                remote,
                ref,
                singleBranch: true,
                onProgress: onProgress
                    ? ({ phase, loaded, total }) =>
                          onProgress({ phase, loaded, total: total || 0 })
                    : undefined,
            });
        } catch (error) {
            console.error("Error pulling changes:", error);
            throw error;
        }
    }

    /**
     * Push changes to remote
     */
    async push({
        dir,
        remote = "origin",
        ref = "main",
        onProgress,
    }: {
        dir: string;
        remote?: string;
        ref?: string;
        onProgress?: ProgressCallback;
    }): Promise<void> {
        try {
            await git.push({
                fs: this.fs,
                http: this.http,
                dir,
                remote,
                ref,
                onProgress: onProgress
                    ? ({ phase, loaded, total }) =>
                          onProgress({ phase, loaded, total: total || 0 })
                    : undefined,
            });
        } catch (error) {
            console.error("Error pushing changes:", error);
            throw error;
        }
    }

    /**
     * Get commit history
     */
    async log({ dir, depth = 10 }: { dir: string; depth?: number }) {
        try {
            return await git.log({
                fs: this.fs,
                dir,
                depth,
            });
        } catch (error) {
            console.error("Error getting commit history:", error);
            return [];
        }
    }

    /**
     * Get file content at a specific commit
     */
    async readFileAtCommit({
        dir,
        filepath,
        ref = "HEAD",
    }: {
        dir: string;
        filepath: string;
        ref?: string;
    }): Promise<string> {
        try {
            const { blob } = await git.readBlob({
                fs: this.fs,
                dir,
                oid: ref,
                filepath,
            });
            return Buffer.from(blob).toString("utf8");
        } catch (error) {
            console.error(`Error reading file ${filepath} at ${ref}:`, error);
            throw error;
        }
    }
}
