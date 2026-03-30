import { describe, expect, it, vi } from "vitest";
import { resolveGitCommitAuthorForProject } from "@/app/domain/project/gitCommitAuthorResolver.ts";
import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";
import { GIT_COMMIT_AUTHOR } from "@/core/persistence/gitConstants.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import { writeGitRemoteProjectInfo } from "@/core/persistence/gitRemoteStore.ts";
import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";

const storageRoots: StorageRoots = {
    appDataRoot: "/appData",
    projectsRoot: "/userData/projects",
    tempRoot: "/appData/temp",
    cacheRoot: "/appData/cache",
    logsRoot: "/appData/logs",
    databaseRoot: "/appData/database",
};

function createAuthSessionProvider(
    session: Awaited<ReturnType<AuthSessionProvider["getCurrentSession"]>>,
): AuthSessionProvider {
    return {
        getCurrentSession: vi.fn().mockResolvedValue(session),
        replaceSession: vi.fn(),
        clearSession: vi.fn(),
        getPendingRevocation: vi.fn(),
        queueTokenRevocation: vi.fn(),
        recordRevocationFailure: vi.fn(),
        clearPendingRevocation: vi.fn(),
    };
}

async function seedLinkedProject(fileSystem: InMemoryFileSystem, hostBaseUrl: string) {
    await writeGitRemoteProjectInfo({
        fileSystem,
        storageRoots,
        info: {
            schemaVersion: 1,
            projectPath: "/userData/projects/foo",
            hostBaseUrl,
            repoId: "1",
            repoOwner: "alice",
            repoName: "foo",
            repoUrl: `${hostBaseUrl}/alice/foo`,
            trackedBranch: "master",
        },
    });
}

describe("resolveGitCommitAuthorForProject", () => {
    it("falls back to the default app author when the project is not linked", async () => {
        const fileSystem = new InMemoryFileSystem();

        await expect(
            resolveGitCommitAuthorForProject({
                projectPath: "/userData/projects/foo",
                fileSystem,
                storageRoots,
                authSessionProvider: createAuthSessionProvider({
                    hostBaseUrl: "https://gitea.example.org",
                    username: "alice",
                    token: "token",
                    tokenId: "1",
                    tokenName: "dovetail-web",
                }),
            }),
        ).resolves.toEqual(GIT_COMMIT_AUTHOR);
    });

    it("falls back to the default app author when the active session does not match the linked host", async () => {
        const fileSystem = new InMemoryFileSystem();
        await seedLinkedProject(fileSystem, "https://gitea.example.org");

        await expect(
            resolveGitCommitAuthorForProject({
                projectPath: "/userData/projects/foo",
                fileSystem,
                storageRoots,
                authSessionProvider: createAuthSessionProvider({
                    hostBaseUrl: "https://other.example.org",
                    username: "alice",
                    token: "token",
                    tokenId: "1",
                    tokenName: "dovetail-web",
                }),
            }),
        ).resolves.toEqual(GIT_COMMIT_AUTHOR);
    });

    it("uses the logged-in username for linked projects on the same host", async () => {
        const fileSystem = new InMemoryFileSystem();
        await seedLinkedProject(fileSystem, "https://gitea.example.org");

        await expect(
            resolveGitCommitAuthorForProject({
                projectPath: "/userData/projects/foo",
                fileSystem,
                storageRoots,
                authSessionProvider: createAuthSessionProvider({
                    hostBaseUrl: "https://gitea.example.org",
                    username: "alice",
                    token: "token",
                    tokenId: "1",
                    tokenName: "dovetail-web",
                }),
            }),
        ).resolves.toEqual({
            name: "alice",
            email: "alice@users.noreply.gitea.example.org",
        });
    });
});
