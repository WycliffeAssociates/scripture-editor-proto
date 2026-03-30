import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import { GIT_COMMIT_AUTHOR } from "@/core/persistence/gitConstants.ts";
import { readGitRemoteProjectInfo } from "@/core/persistence/gitRemoteStore.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

export async function resolveGitCommitAuthorForProject(args: {
    projectPath: string;
    fileSystem: FileSystem;
    storageRoots: StorageRoots;
    authSessionProvider: AuthSessionProvider;
}): Promise<{ name: string; email: string }> {
    const remoteInfo = await readGitRemoteProjectInfo({
        fileSystem: args.fileSystem,
        storageRoots: args.storageRoots,
        projectPath: args.projectPath,
    });
    if (!remoteInfo) {
        return GIT_COMMIT_AUTHOR;
    }

    const session = await args.authSessionProvider.getCurrentSession();
    if (!session || session.hostBaseUrl !== remoteInfo.hostBaseUrl) {
        return GIT_COMMIT_AUTHOR;
    }

    return {
        name: session.username,
        email: buildNoreplyEmail(session.username, session.hostBaseUrl),
    };
}

function buildNoreplyEmail(username: string, hostBaseUrl: string): string {
    try {
        const hostname = new URL(hostBaseUrl).hostname;
        return `${username}@users.noreply.${hostname}`;
    } catch {
        return `${username}@users.noreply.dovetail.local`;
    }
}
