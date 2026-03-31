import * as v from "valibot";
import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { GitRemoteSession } from "@/core/persistence/gitRemoteModels.ts";
import {
    deleteGitRemoteSession,
    ensureGitRemoteStateRoot,
    readGitRemoteSession,
    writeGitRemoteSession,
} from "@/core/persistence/gitRemoteStore.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

export const GIT_REMOTE_SESSION_TOKEN_SCOPES = [
    "read:activitypub",
    "read:issue",
    "write:misc",
    "read:notification",
    "read:organization",
    "read:package",
    "write:repository",
    "read:user",
] as const;
export const GIT_REMOTE_SESSION_TOKEN_NAME_PREFIX = "dovetail";
const GiteaCreatedTokenSchema = v.object({
    id: v.union([v.number(), v.string()]),
    name: v.string(),
    sha1: v.string(),
});

type FetchLike = typeof fetch;

/**
 * File-system-backed session provider shared by web and desktop.
 *
 * Both platforms already expose the same managed-storage filesystem seam, so
 * session persistence can stay platform-neutral here. Later beads can layer
 * Gitea API transport on top of this without teaching UI code where auth files
 * live or how retry bookkeeping is stored.
 */
export class FsBackedAuthSessionProvider implements AuthSessionProvider {
    constructor(
        private readonly fileSystem: FileSystem,
        private readonly storageRoots: StorageRoots,
        private readonly fetchImpl: FetchLike = getDefaultFetch(),
    ) {}

    async getCurrentSession(): Promise<GitRemoteSession | null> {
        return readGitRemoteSession({
            fileSystem: this.fileSystem,
            storageRoots: this.storageRoots,
        });
    }

    async loginWithPassword(args: {
        hostBaseUrl: string;
        username: string;
        password: string;
        otp?: string | null;
    }): Promise<GitRemoteSession> {
        const tokenName = buildSessionTokenName();
        const response = await this.fetchImpl(
            new URL(
                `/api/v1/users/${encodeURIComponent(args.username)}/tokens`,
                args.hostBaseUrl,
            ),
            {
                method: "POST",
                headers: {
                    Authorization: `Basic ${toBasicAuth(
                        args.username,
                        args.password,
                    )}`,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    ...(args.otp
                        ? {
                              "X-Gitea-OTP": args.otp,
                          }
                        : {}),
                },
                body: JSON.stringify({
                    name: tokenName,
                    scopes: [...GIT_REMOTE_SESSION_TOKEN_SCOPES],
                }),
            },
        );

        await throwIfNotOk(response, "Failed to create cloud API token");

        const createdToken = v.parse(
            GiteaCreatedTokenSchema,
            await response.json(),
        );
        const session: GitRemoteSession = {
            hostBaseUrl: args.hostBaseUrl,
            username: args.username,
            token: createdToken.sha1,
            tokenName: createdToken.name,
            tokenId: String(createdToken.id),
        };
        await this.replaceSession(session);
        return session;
    }

    async replaceSession(session: GitRemoteSession): Promise<void> {
        await ensureGitRemoteStateRoot({
            fileSystem: this.fileSystem,
            storageRoots: this.storageRoots,
        });
        await writeGitRemoteSession({
            fileSystem: this.fileSystem,
            storageRoots: this.storageRoots,
            session,
        });
    }

    async logoutCurrentSession(): Promise<void> {
        await this.clearSession();
    }

    async clearSession(): Promise<void> {
        await deleteGitRemoteSession({
            fileSystem: this.fileSystem,
            storageRoots: this.storageRoots,
        });
    }
}

function getDefaultFetch(): FetchLike {
    return globalThis.fetch.bind(globalThis);
}

function buildSessionTokenName(): string {
    return `${GIT_REMOTE_SESSION_TOKEN_NAME_PREFIX}-${Date.now()}`;
}

function toBasicAuth(username: string, password: string): string {
    const credentials = `${username}:${password}`;
    if (typeof btoa === "function") {
        return btoa(credentials);
    }
    const bufferCtor = globalThis.Buffer;
    if (bufferCtor) {
        return bufferCtor.from(credentials, "utf-8").toString("base64");
    }
    throw new Error("Basic auth encoding is not available in this runtime");
}

async function throwIfNotOk(response: Response, fallbackMessage: string) {
    if (response.ok) return;
    let details = "";
    try {
        details = await response.text();
    } catch {
        details = "";
    }
    throw new Error(details || fallbackMessage);
}
