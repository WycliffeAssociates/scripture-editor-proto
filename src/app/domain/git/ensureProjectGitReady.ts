import {
    GIT_COMMIT_AUTHOR,
    GIT_DEFAULT_BRANCH,
} from "@/app/domain/git/gitConstants.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";

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

async function ensureProjectGitIgnore(loadedProject: Project): Promise<void> {
    const rootDir = loadedProject.projectDir.asDirectoryHandle();
    if (!rootDir) return;

    const fileHandle = await rootDir.getFileHandle(".gitignore", {
        create: true,
    });
    const currentContents = await fileHandle
        .getFile()
        .then((file) => file.text())
        .catch(() => "");
    const existingLines = new Set(
        currentContents
            .split(/\r?\n/u)
            .map((line) => line.trim())
            .filter(Boolean),
    );

    let changed = false;
    for (const pattern of DEFAULT_GITIGNORE_PATTERNS) {
        if (existingLines.has(pattern)) continue;
        existingLines.add(pattern);
        changed = true;
    }
    if (!changed) return;

    const nextContents = `${[...existingLines].join("\n")}\n`;
    const writer = await fileHandle.createWritable();
    await writer.write(nextContents);
    await writer.close();
}

export async function ensureProjectGitReady(args: {
    gitProvider: GitProvider;
    loadedProject: Project;
}): Promise<void> {
    const projectPath = args.loadedProject.projectDir.path;
    await ensureProjectGitIgnore(args.loadedProject);
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
