import type {
    GitRemotePendingRevocation,
    GitRemoteSession,
} from "@/core/persistence/gitRemoteModels.ts";

/**
 * App-global auth/session seam for cloud publishing.
 *
 * Session state is machine-local and deliberately separate from repository
 * state. This provider owns the one-active-session rule and the bounded retry
 * bookkeeping for logout token revocation.
 */
export interface AuthSessionProvider {
    getCurrentSession(): Promise<GitRemoteSession | null>;
    loginWithPassword(args: {
        hostBaseUrl: string;
        username: string;
        password: string;
        otp?: string | null;
    }): Promise<GitRemoteSession>;
    replaceSession(session: GitRemoteSession): Promise<void>;
    clearSession(): Promise<void>;
    getPendingRevocation(): Promise<GitRemotePendingRevocation | null>;
    queueTokenRevocation(args: {
        hostBaseUrl: string;
        tokenId: string;
        tokenName?: string | null;
    }): Promise<void>;
    recordRevocationFailure(args: {
        attemptedAt: string;
        failureReason: string;
        terminal: boolean;
    }): Promise<GitRemotePendingRevocation | null>;
    clearPendingRevocation(): Promise<void>;
}
