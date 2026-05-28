import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import {
    GIT_COMMIT_AUTHOR,
    GIT_DEFAULT_BRANCH,
} from "@/core/persistence/gitConstants.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";

/**
 * Best-effort git bootstrap for editable scripture workspaces.
 *
 * Import/load decides whether something is editable scripture. Once that exists,
 * this helper ensures the workspace has the git scaffolding needed for version
 * history without forcing route/UI code to know the git setup sequence.
 */
const DEFAULT_GITIGNORE_PATTERNS = [".DS_Store", "Thumbs.db", "node_modules"];

function isRecoverableBaselineGitError(error: unknown): boolean {
    const message =
        error instanceof Error ? error.message : String(error ?? "");
    return (
        message.includes("NotFoundError") ||
        message.includes("Could not find") ||
        /ENOENT|No such file or directory/i.test(message) ||
        message.includes("setUVMessage") ||
        message.includes('setting getter-only property "message"')
    );
}

async function ensureProjectGitIgnore(
    fileSystem: FileSystem,
    loadedProject: Project,
): Promise<void> {
    const gitIgnorePath = `${loadedProject.projectPath}/.gitignore`;
    const currentContents = await fileSystem
        .readText(gitIgnorePath)
        .catch(() => "");
    const existingLines = new Set(
        currentContents.split(/\r?\n/u).flatMap((line) => {
            const trimmed = line.trim();
            return trimmed ? [trimmed] : [];
        }),
    );

    let changed = false;
    for (const pattern of DEFAULT_GITIGNORE_PATTERNS) {
        if (existingLines.has(pattern)) continue;
        existingLines.add(pattern);
        changed = true;
    }
    if (!changed) return;

    const nextContents = `${[...existingLines].join("\n")}\n`;
    await fileSystem.writeText(gitIgnorePath, nextContents);
}

export async function ensureProjectGitReady(args: {
    fileSystem: FileSystem;
    gitProvider: GitProvider;
    loadedProject: Project;
}): Promise<void> {
    const projectPath = args.loadedProject.projectPath;
    await ensureProjectGitIgnore(args.fileSystem, args.loadedProject);
    await args.gitProvider.ensureRepo(projectPath, {
        defaultBranch: GIT_DEFAULT_BRANCH,
    });

    const healthy = await args.gitProvider.isRepoHealthy(projectPath);
    if (!healthy) {
        await args.gitProvider.ensureRepo(projectPath, {
            defaultBranch: GIT_DEFAULT_BRANCH,
        });
    }

    const history = await args.gitProvider.listHistory(projectPath, {
        limit: 1,
        offset: 0,
    });

    if (history.length === 0) {
        try {
            await args.gitProvider.commitAll(
                projectPath,
                {
                    op: "baseline",
                    timestampIso: new Date().toISOString(),
                    changedChapters: [],
                },
                GIT_COMMIT_AUTHOR,
            );
        } catch (error) {
            if (!isRecoverableBaselineGitError(error)) {
                throw error;
            }
        }
        return;
    }

    const branchInfo = await args.gitProvider.getBranchInfo(projectPath);
    if (branchInfo.detached) {
        try {
            await args.gitProvider.checkoutPreferredBranch(projectPath, {
                prefer: GIT_DEFAULT_BRANCH,
            });
        } catch (error) {
            console.warn(
                "Project opened in detached HEAD and checkout fallback failed.",
                error,
            );
        }
    }
}
