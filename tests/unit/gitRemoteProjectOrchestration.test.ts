import { describe, expect, it, vi } from "vitest";
import { GitRemoteProjectService } from "@/app/domain/project/gitRemoteProjectService.ts";
import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";
import type { RemoteRepoProvider } from "@/core/persistence/RemoteRepoProvider.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import { readGitRemoteProjectInfo } from "@/core/persistence/gitRemoteStore.ts";
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
        loginWithPassword: vi.fn(),
        replaceSession: vi.fn(),
        logoutCurrentSession: vi.fn().mockResolvedValue(undefined),
        clearSession: vi.fn(),
    };
}

function createRemoteRepoProvider(): RemoteRepoProvider {
    return {
        listWritableRepos: vi.fn(),
        listOwnedRepos: vi.fn(),
        createRepo: vi.fn(),
        inspectProjectMetadata: vi.fn(),
    };
}

describe("GitRemoteProjectService", () => {
    it("passes paging and default topic filtering through to the remote repo provider", async () => {
        const fileSystem = new InMemoryFileSystem();
        const remoteRepoProvider = createRemoteRepoProvider();
        vi.mocked(remoteRepoProvider.listWritableRepos).mockResolvedValue({
            repos: [],
            nextPage: null,
            rawResultCount: 0,
        });
        const service = new GitRemoteProjectService(
            fileSystem,
            storageRoots,
            createAuthSessionProvider({
                hostBaseUrl: "https://gitea.example.org",
                username: "alice",
                token: "token",
                tokenId: "1",
                tokenName: "dovetail-web",
            }),
            remoteRepoProvider,
        );

        await service.listWritableRepos({
            page: 2,
            pageSize: 25,
        });

        expect(remoteRepoProvider.listWritableRepos).toHaveBeenCalledWith({
            hostBaseUrl: "https://gitea.example.org",
            username: "alice",
            token: "token",
            page: 2,
            pageSize: 25,
            topic: "consolidated",
        });
    });

    it("passes owned-only listing through to the remote repo provider", async () => {
        const fileSystem = new InMemoryFileSystem();
        const remoteRepoProvider = createRemoteRepoProvider();
        vi.mocked(remoteRepoProvider.listOwnedRepos).mockResolvedValue({
            repos: [],
            nextPage: null,
            rawResultCount: 0,
        });
        const service = new GitRemoteProjectService(
            fileSystem,
            storageRoots,
            createAuthSessionProvider({
                hostBaseUrl: "https://gitea.example.org",
                username: "alice",
                token: "token",
                tokenId: "1",
                tokenName: "dovetail-web",
            }),
            remoteRepoProvider,
        );

        await service.listOwnedRepos({
            page: 3,
            pageSize: 10,
        });

        expect(remoteRepoProvider.listOwnedRepos).toHaveBeenCalledWith({
            hostBaseUrl: "https://gitea.example.org",
            username: "alice",
            token: "token",
            page: 3,
            pageSize: 10,
            topic: "consolidated",
        });
    });

    it("creates a remote repo from a local project and persists the resulting link info", async () => {
        const fileSystem = new InMemoryFileSystem();
        const remoteRepoProvider = createRemoteRepoProvider();
        vi.mocked(remoteRepoProvider.createRepo).mockResolvedValue({
            id: "1",
            owner: "alice",
            name: "bho-bible",
            fullName: "alice/bho-bible",
            htmlUrl: "https://gitea.example.org/alice/bho-bible",
            cloneUrl: "https://gitea.example.org/alice/bho-bible.git",
            defaultBranch: "master",
            topics: ["consolidated"],
            canWrite: true,
        });
        const service = new GitRemoteProjectService(
            fileSystem,
            storageRoots,
            createAuthSessionProvider({
                hostBaseUrl: "https://gitea.example.org",
                username: "alice",
                token: "token",
                tokenId: "1",
                tokenName: "dovetail-web",
            }),
            remoteRepoProvider,
        );

        const result = await service.createRemoteForProject({
            projectPath: "/userData/projects/foo",
            displayName: "Bho Bible",
            projectId: "Bible",
            language: {
                code: "bho",
                name: "Bhojpuri",
                direction: "ltr",
            },
        });

        expect(remoteRepoProvider.createRepo).toHaveBeenCalledWith({
            hostBaseUrl: "https://gitea.example.org",
            username: "alice",
            token: "token",
            request: {
                name: "bho-bible",
                visibility: "public",
                topics: ["consolidated"],
                defaultBranch: "master",
            },
        });
        expect(result.remoteInfo).toEqual({
            schemaVersion: 1,
            projectPath: "/userData/projects/foo",
            hostBaseUrl: "https://gitea.example.org",
            repoId: "1",
            repoOwner: "alice",
            repoName: "bho-bible",
            repoUrl: "https://gitea.example.org/alice/bho-bible",
            trackedBranch: "master",
        });
        await expect(
            readGitRemoteProjectInfo({
                fileSystem,
                storageRoots,
                projectPath: "/userData/projects/foo",
            }),
        ).resolves.toEqual(result.remoteInfo);
    });

    it("attaches an existing local project to a writable remote repo", async () => {
        const fileSystem = new InMemoryFileSystem();
        const remoteRepoProvider = createRemoteRepoProvider();
        vi.mocked(remoteRepoProvider.inspectProjectMetadata).mockResolvedValue({
            format: "scripture-burrito",
            metadataPath: "metadata.json",
            languageTag: "bho",
            isScriptureTextTranslation: true,
        });
        const service = new GitRemoteProjectService(
            fileSystem,
            storageRoots,
            createAuthSessionProvider({
                hostBaseUrl: "https://gitea.example.org",
                username: "alice",
                token: "token",
                tokenId: "1",
                tokenName: "dovetail-web",
            }),
            remoteRepoProvider,
        );

        const remoteInfo = await service.attachProjectToRemote({
            project: {
                projectPath: "/userData/projects/foo",
                displayName: "Bho Bible",
                language: {
                    code: "bho",
                    name: "Bhojpuri",
                    direction: "ltr",
                },
            },
            repo: {
                id: "2",
                owner: "alice",
                name: "bho-bible",
                htmlUrl: "https://gitea.example.org/alice/bho-bible",
                defaultBranch: "master",
            },
        });

        expect(remoteInfo).toEqual({
            schemaVersion: 1,
            projectPath: "/userData/projects/foo",
            hostBaseUrl: "https://gitea.example.org",
            repoId: "2",
            repoOwner: "alice",
            repoName: "bho-bible",
            repoUrl: "https://gitea.example.org/alice/bho-bible",
            trackedBranch: "master",
        });
    });

    it("refuses to attach a remote repo whose metadata language does not match the local project", async () => {
        const fileSystem = new InMemoryFileSystem();
        const remoteRepoProvider = createRemoteRepoProvider();
        vi.mocked(remoteRepoProvider.inspectProjectMetadata).mockResolvedValue({
            format: "resource-container",
            metadataPath: "manifest.yaml",
            languageTag: "eng",
            isScriptureTextTranslation: true,
        });
        const service = new GitRemoteProjectService(
            fileSystem,
            storageRoots,
            createAuthSessionProvider({
                hostBaseUrl: "https://gitea.example.org",
                username: "alice",
                token: "token",
                tokenId: "1",
                tokenName: "dovetail-web",
            }),
            remoteRepoProvider,
        );

        await expect(
            service.attachProjectToRemote({
                project: {
                    projectPath: "/userData/projects/foo",
                    displayName: "Bho Bible",
                    language: {
                        code: "bho",
                        name: "Bhojpuri",
                        direction: "ltr",
                    },
                },
                repo: {
                    id: "2",
                    owner: "alice",
                    name: "eng-bible",
                    htmlUrl: "https://gitea.example.org/alice/eng-bible",
                    defaultBranch: "master",
                },
            }),
        ).rejects.toThrow(/eng.*bho/u);
    });

    it("requires an active session for remote project operations", async () => {
        const fileSystem = new InMemoryFileSystem();
        const service = new GitRemoteProjectService(
            fileSystem,
            storageRoots,
            createAuthSessionProvider(null),
            createRemoteRepoProvider(),
        );

        await expect(
            service.listWritableRepos({
                page: 1,
                pageSize: 20,
            }),
        ).rejects.toThrow(/active session/u);
    });
});
