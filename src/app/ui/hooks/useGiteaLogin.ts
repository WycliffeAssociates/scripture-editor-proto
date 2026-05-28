// Manages the login form state and connect action for signing in to the
// app's Gitea instance. Extracted from CloudStatusPopover (reauth flow) and
// the create route (first-time connect) to keep the two in sync.

import { useLingui } from "@lingui/react/macro";
import { useCallback, useState } from "react";
import {
    showErrorNotification,
    showNotificationSuccess,
} from "@/app/ui/components/primitives/notifications.ts";
import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";

type UseGiteaLoginArgs = {
    authSessionProvider: AuthSessionProvider;
    giteaHostBaseUrl: string | null;
    // Called after a successful login. Receives the authenticated username so
    // callers can update their own session state without re-fetching.
    onSuccess?: (username: string) => void | Promise<void>;
};

export function useGiteaLogin(args: UseGiteaLoginArgs) {
    const { t } = useLingui();
    const { authSessionProvider, giteaHostBaseUrl, onSuccess } = args;

    const [loginUsername, setLoginUsername] = useState("");
    const [loginPassword, setLoginPassword] = useState("");
    const [loginOtp, setLoginOtp] = useState("");
    const [isRunningConnect, setIsRunningConnect] = useState(false);

    const handleConnect = useCallback(async () => {
        if (!giteaHostBaseUrl) {
            showErrorNotification({
                notification: {
                    title: t`Enter your credentials`,
                    message: t`Username and password are required to connect your cloud account.`,
                },
            });
            return;
        }
        if (!loginUsername.trim() || !loginPassword.trim()) {
            showErrorNotification({
                notification: {
                    title: t`Enter your credentials`,
                    message: t`Username and password are required to connect your cloud account.`,
                },
            });
            return;
        }
        setIsRunningConnect(true);
        try {
            const session = await authSessionProvider.loginWithPassword({
                hostBaseUrl: giteaHostBaseUrl,
                username: loginUsername.trim(),
                password: loginPassword,
                otp: loginOtp.trim() || null,
            });
            setLoginPassword("");
            setLoginOtp("");
            showNotificationSuccess({
                notification: {
                    title: t`Cloud account connected`,
                    message: t`You can now browse your writable cloud projects.`,
                },
            });
            await onSuccess?.(session.username);
        } catch (error) {
            showErrorNotification({
                notification: {
                    title: t`Cloud login failed`,
                    message:
                        error instanceof Error
                            ? error.message
                            : t`Could not connect your cloud account.`,
                },
            });
        } finally {
            setIsRunningConnect(false);
        }
    }, [
        authSessionProvider,
        giteaHostBaseUrl,
        loginOtp,
        loginPassword,
        loginUsername,
        onSuccess,
        t,
    ]);

    return {
        loginUsername,
        loginPassword,
        loginOtp,
        setLoginUsername,
        setLoginPassword,
        setLoginOtp,
        isRunningConnect,
        handleConnect,
    };
}
