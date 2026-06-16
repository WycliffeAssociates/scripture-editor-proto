import { t } from "@lingui/core/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { showErrorNotification } from "@/app/ui/components/primitives/notifications.ts";
import type {
  AvailableUpdate,
  CheckResult,
  IUpdaterService,
} from "@/core/domain/updater/IUpdaterService.ts";

const UPDATE_QUERY_KEY = ["updater", "check"] as const;

/**
 * Shared "is there an update?" query, holding the full CheckResult so
 * the banner and Settings can distinguish "update available" from
 * "the check itself failed" — important because the launch-time banner
 * stays silent on errors, but Settings should surface them.
 *
 * Runs once on first mount (after the platform-specific service is wired in)
 * and stays cached indefinitely until something invalidates it. Manual
 * invalidation is the way to retrigger — see `useRecheckForUpdate`.
 */
export function useAvailableUpdate(service: IUpdaterService | null) {
  return useQuery({
    queryKey: UPDATE_QUERY_KEY,
    queryFn: async (): Promise<CheckResult> => {
      if (!service) return { kind: "up-to-date" };
      return service.check();
    },
    enabled: service !== null,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

/** Narrowing helper for callers that only care about the "update found" case. */
export function availableUpdateFrom(
  result: CheckResult | undefined,
): AvailableUpdate | null {
  if (!result || result.kind !== "update") return null;
  return result.update;
}

/**
 * Force a re-run of the update check. Both banner and Settings see the
 * updated state because they share the query key. Returns the async mutation
 * so callers can `await` completion (Settings uses this to show a transient
 * "Checking…" state on its button).
 */
export function useRecheckForUpdate(service: IUpdaterService | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<CheckResult> => {
      if (!service) return { kind: "up-to-date" };
      const result = await service.check();
      queryClient.setQueryData(UPDATE_QUERY_KEY, result);
      return result;
    },
  });
}

/**
 * Install the available update + relaunch the app. Wraps the service call so
 * components don't have to manage the in-flight state themselves.
 *
 * On success the process relaunches and this hook never resolves the caller —
 * `installing` stays true. On failure we flip `installing` back so the UI
 * can re-enable buttons, and surface a localized toast via the shared
 * notification system. Both banner and Settings consumers share the same
 * error UX automatically.
 */
export function useInstallUpdate(service: IUpdaterService | null) {
  const mutation = useMutation({
    mutationFn: async () => {
      if (!service) throw new Error("no updater service");
      await service.installAndRelaunch();
    },
    onError: (error) => {
      console.error("[updater] install failed", error);
      showErrorNotification({
        notification: {
          title: t`Update install failed`,
          message:
            error instanceof Error
              ? error.message
              : t`The update could not be installed.`,
        },
      });
    },
  });

  const install = useCallback(() => {
    if (!service || mutation.isPending) return;
    mutation.mutate();
  }, [service, mutation]);

  return { install, installing: mutation.isPending };
}
