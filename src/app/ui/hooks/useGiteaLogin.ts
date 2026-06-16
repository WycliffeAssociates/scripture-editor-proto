// Manages the login form state and connect action for signing in to the
// app's Gitea instance. Extracted from CloudStatusPopover (reauth flow) and
// the create route (first-time connect) to keep the two in sync.

import { useLingui } from "@lingui/react/macro";
import { useCallback, useState } from "react";

import { showNotificationSuccess } from "@/app/ui/components/primitives/notifications.ts";
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

  const [loginUsername, setLoginUsernameRaw] = useState("");
  const [loginPassword, setLoginPasswordRaw] = useState("");
  const [loginOtp, setLoginOtp] = useState("");
  const [isRunningConnect, setIsRunningConnect] = useState(false);
  // Sign-in failures surface inline beneath the form (see CloudSignInForm),
  // not as a toast — the form is where the user is looking.
  const [loginError, setLoginError] = useState<string | null>(null);

  // Editing either field clears a stale error so it doesn't linger.
  const setLoginUsername = useCallback((value: string) => {
    setLoginUsernameRaw(value);
    setLoginError(null);
  }, []);
  const setLoginPassword = useCallback((value: string) => {
    setLoginPasswordRaw(value);
    setLoginError(null);
  }, []);

  const handleConnect = useCallback(async () => {
    if (!giteaHostBaseUrl || !loginUsername.trim() || !loginPassword.trim()) {
      setLoginError(
        t`Username and password are required to connect your account.`,
      );
      return;
    }
    setIsRunningConnect(true);
    setLoginError(null);
    try {
      const session = await authSessionProvider.loginWithPassword({
        hostBaseUrl: giteaHostBaseUrl,
        username: loginUsername.trim(),
        password: loginPassword,
        otp: loginOtp.trim() || null,
      });
      setLoginPasswordRaw("");
      setLoginOtp("");
      showNotificationSuccess({
        notification: {
          title: t`Account connected`,
          message: t`You can now browse the projects you can edit.`,
        },
      });
      await onSuccess?.(session.username);
    } catch (error) {
      setLoginError(
        error instanceof Error
          ? error.message
          : t`Couldn't connect your account.`,
      );
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
    loginError,
    setLoginUsername,
    setLoginPassword,
    setLoginOtp,
    isRunningConnect,
    handleConnect,
  };
}
