import { describe, expect, it, vi } from "vitest";
import {
    FsBackedAuthSessionProvider,
    GIT_REMOTE_SESSION_TOKEN_SCOPES,
} from "@/core/persistence/FsBackedAuthSessionProvider.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import {
    readGitRemotePendingRevocation,
    writeGitRemotePendingRevocation,
} from "@/core/persistence/gitRemoteStore.ts";
import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";

const storageRoots: StorageRoots = {
    appDataRoot: "/appData",
    projectsRoot: "/userData/projects",
    tempRoot: "/appData/temp",
    cacheRoot: "/appData/cache",
    logsRoot: "/appData/logs",
    databaseRoot: "/appData/database",
};

describe("FsBackedAuthSessionProvider", () => {
    it("persists exactly one active session per install", async () => {
        const fileSystem = new InMemoryFileSystem();
        const provider = new FsBackedAuthSessionProvider(
            fileSystem,
            storageRoots,
        );

        await provider.replaceSession({
            hostBaseUrl: "https://gitea.example.org",
            username: "alice",
            token: "token-one",
            tokenName: "dovetail-web",
            tokenId: "1",
        });
        await provider.replaceSession({
            hostBaseUrl: "https://gitea.example.org",
            username: "bob",
            token: "token-two",
            tokenName: "dovetail-web",
            tokenId: "2",
        });

        await expect(provider.getCurrentSession()).resolves.toEqual({
            hostBaseUrl: "https://gitea.example.org",
            username: "bob",
            token: "token-two",
            tokenName: "dovetail-web",
            tokenId: "2",
        });
    });

    it("creates and persists a session token using basic auth against the configured Gitea host", async () => {
        const fileSystem = new InMemoryFileSystem();
        const fetchImpl = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                id: 7,
                name: "dovetail-123",
                sha1: "created-token",
            }),
        });
        const provider = new FsBackedAuthSessionProvider(
            fileSystem,
            storageRoots,
            fetchImpl as typeof fetch,
        );

        const session = await provider.loginWithPassword({
            hostBaseUrl: "https://gitea.example.org",
            username: "alice",
            password: "secret",
            otp: "123456",
        });

        expect(fetchImpl).toHaveBeenCalledWith(
            new URL(
                "/api/v1/users/alice/tokens",
                "https://gitea.example.org",
            ),
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    Authorization: expect.stringMatching(/^Basic /u),
                    "Content-Type": "application/json",
                    "X-Gitea-OTP": "123456",
                }),
            }),
        );
        const requestInit = fetchImpl.mock.calls[0]?.[1];
        expect(JSON.parse(String(requestInit?.body))).toEqual({
            name: expect.stringMatching(/^dovetail-/u),
            scopes: [...GIT_REMOTE_SESSION_TOKEN_SCOPES],
        });
        expect(session).toEqual({
            hostBaseUrl: "https://gitea.example.org",
            username: "alice",
            token: "created-token",
            tokenName: "dovetail-123",
            tokenId: "7",
        });
        await expect(provider.getCurrentSession()).resolves.toEqual(session);
    });

    it("logs out by clearing the local session without calling the network", async () => {
        const fileSystem = new InMemoryFileSystem();
        const fetchImpl = vi.fn();
        const provider = new FsBackedAuthSessionProvider(
            fileSystem,
            storageRoots,
            fetchImpl as typeof fetch,
        );
        await provider.replaceSession({
            hostBaseUrl: "https://gitea.example.org",
            username: "alice",
            token: "created-token",
            tokenName: "dovetail-123",
            tokenId: "7",
        });

        await expect(provider.logoutCurrentSession()).resolves.toBeUndefined();
        expect(fetchImpl).not.toHaveBeenCalled();
        await expect(provider.getCurrentSession()).resolves.toBeNull();
    });

    it("clears local session without touching any existing pending revocation record", async () => {
        const fileSystem = new InMemoryFileSystem();
        const provider = new FsBackedAuthSessionProvider(
            fileSystem,
            storageRoots,
        );

        await provider.replaceSession({
            hostBaseUrl: "https://gitea.example.org",
            username: "alice",
            token: "token-one",
            tokenName: "dovetail-web",
            tokenId: "1",
        });
        await writeGitRemotePendingRevocation({
            fileSystem,
            storageRoots,
            pending: {
                hostBaseUrl: "https://gitea.example.org",
                tokenId: "1",
                tokenName: "dovetail-web",
                retryCount: 0,
                lastAttemptedAt: null,
                lastFailureReason: null,
                state: "pending",
            },
        });

        await provider.clearSession();

        await expect(provider.getCurrentSession()).resolves.toBeNull();
        await expect(
            readGitRemotePendingRevocation({
                fileSystem,
                storageRoots,
            }),
        ).resolves.toEqual({
            hostBaseUrl: "https://gitea.example.org",
            tokenId: "1",
            tokenName: "dovetail-web",
            retryCount: 0,
            lastAttemptedAt: null,
            lastFailureReason: null,
            state: "pending",
        });
    });

    it("still reads existing pending revocation bookkeeping from app-data unchanged", async () => {
        const fileSystem = new InMemoryFileSystem();

        await writeGitRemotePendingRevocation({
            fileSystem,
            storageRoots,
            pending: {
                hostBaseUrl: "https://gitea.example.org",
                tokenId: "1",
                tokenName: null,
                retryCount: 0,
                lastAttemptedAt: null,
                lastFailureReason: null,
                state: "pending",
            },
        });

        await expect(
            readGitRemotePendingRevocation({
                fileSystem,
                storageRoots,
            }),
        ).resolves.toEqual({
            hostBaseUrl: "https://gitea.example.org",
            tokenId: "1",
            tokenName: null,
            retryCount: 0,
            lastAttemptedAt: null,
            lastFailureReason: null,
            state: "pending",
        });
    });
});
