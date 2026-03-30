import { describe, expect, it, vi } from "vitest";
import {
    FsBackedAuthSessionProvider,
    GIT_REMOTE_SESSION_TOKEN_SCOPES,
} from "@/core/persistence/FsBackedAuthSessionProvider.ts";
import { GIT_REMOTE_REVOCATION_STATE_VALUES } from "@/core/persistence/gitRemoteModels.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import { readGitRemotePendingRevocation } from "@/core/persistence/gitRemoteStore.ts";
import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";

const storageRoots: StorageRoots = {
    appDataRoot: "/appData",
    projectsRoot: "/userData/projects",
    tempRoot: "/appData/temp",
    cacheRoot: "/appData/cache",
    logsRoot: "/appData/logs",
    databaseRoot: "/appData/database",
};

const [
    GIT_REMOTE_REVOCATION_PENDING,
    GIT_REMOTE_REVOCATION_TERMINAL_FAILURE,
    GIT_REMOTE_REVOCATION_RETRY_LIMIT_REACHED,
] = GIT_REMOTE_REVOCATION_STATE_VALUES;

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

    it("clears local session immediately without touching pending revocation state", async () => {
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
        await provider.queueTokenRevocation({
            hostBaseUrl: "https://gitea.example.org",
            tokenId: "1",
            tokenName: "dovetail-web",
        });

        await provider.clearSession();

        await expect(provider.getCurrentSession()).resolves.toBeNull();
        await expect(provider.getPendingRevocation()).resolves.toEqual({
            hostBaseUrl: "https://gitea.example.org",
            tokenId: "1",
            tokenName: "dovetail-web",
            retryCount: 0,
            lastAttemptedAt: null,
            lastFailureReason: null,
            state: GIT_REMOTE_REVOCATION_PENDING,
        });
    });

    it("keeps retryable revocation failures pending until the retry limit is reached", async () => {
        const fileSystem = new InMemoryFileSystem();
        const provider = new FsBackedAuthSessionProvider(
            fileSystem,
            storageRoots,
        );

        await provider.queueTokenRevocation({
            hostBaseUrl: "https://gitea.example.org",
            tokenId: "1",
        });

        await expect(
            provider.recordRevocationFailure({
                attemptedAt: "2026-03-30T16:00:00.000Z",
                failureReason: "offline",
                terminal: false,
            }),
        ).resolves.toEqual({
            hostBaseUrl: "https://gitea.example.org",
            tokenId: "1",
            tokenName: null,
            retryCount: 1,
            lastAttemptedAt: "2026-03-30T16:00:00.000Z",
            lastFailureReason: "offline",
            state: GIT_REMOTE_REVOCATION_PENDING,
        });

        await provider.recordRevocationFailure({
            attemptedAt: "2026-03-30T16:01:00.000Z",
            failureReason: "still-offline",
            terminal: false,
        });
        const exhausted = await provider.recordRevocationFailure({
            attemptedAt: "2026-03-30T16:02:00.000Z",
            failureReason: "still-offline",
            terminal: false,
        });

        expect(exhausted?.state).toBe(GIT_REMOTE_REVOCATION_RETRY_LIMIT_REACHED);
        await expect(provider.getPendingRevocation()).resolves.toEqual(
            exhausted,
        );
    });

    it("marks terminal revocation failures without retrying forever", async () => {
        const fileSystem = new InMemoryFileSystem();
        const provider = new FsBackedAuthSessionProvider(
            fileSystem,
            storageRoots,
        );

        await provider.queueTokenRevocation({
            hostBaseUrl: "https://gitea.example.org",
            tokenId: "1",
            tokenName: "dovetail-web",
        });

        await expect(
            provider.recordRevocationFailure({
                attemptedAt: "2026-03-30T16:00:00.000Z",
                failureReason: "404",
                terminal: true,
            }),
        ).resolves.toEqual({
            hostBaseUrl: "https://gitea.example.org",
            tokenId: "1",
            tokenName: "dovetail-web",
            retryCount: 1,
            lastAttemptedAt: "2026-03-30T16:00:00.000Z",
            lastFailureReason: "404",
            state: GIT_REMOTE_REVOCATION_TERMINAL_FAILURE,
        });
    });

    it("stores revocation bookkeeping in the same app-data boundary as session state", async () => {
        const fileSystem = new InMemoryFileSystem();
        const provider = new FsBackedAuthSessionProvider(
            fileSystem,
            storageRoots,
        );

        await provider.queueTokenRevocation({
            hostBaseUrl: "https://gitea.example.org",
            tokenId: "1",
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
            state: GIT_REMOTE_REVOCATION_PENDING,
        });
    });
});
