import type { GitRemoteSession } from "@/core/persistence/gitRemoteModels.ts";

/**
 * App-global auth/session seam for cloud publishing.
 *
 * Session state is machine-local and deliberately separate from repository
 * state. This provider owns the one-active-session rule for the current app
 * install and does not attempt to manage cloud-side token lifecycle on logout.
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
    logoutCurrentSession(): Promise<void>;
    clearSession(): Promise<void>;
}
