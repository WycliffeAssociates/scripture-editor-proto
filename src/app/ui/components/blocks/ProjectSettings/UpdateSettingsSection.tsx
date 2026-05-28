import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { type RefObject, useState } from "react";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { showErrorNotification } from "@/app/ui/components/primitives/notifications.ts";
import { SelectPrimitive } from "@/app/ui/components/primitives/Select/Select.tsx";
import {
    availableUpdateFrom,
    useAvailableUpdate,
    useInstallUpdate,
    useRecheckForUpdate,
} from "@/app/ui/hooks/useUpdateCheck.ts";
import type { IUpdaterService } from "@/core/domain/updater/IUpdaterService.ts";
import * as styles from "./settings.css.ts";

/**
 * Desktop-only updates section for Settings → Advanced.
 *
 * Three responsibilities:
 *   1. "Check for updates now" — re-runs the same check that fires at launch.
 *      Result is surfaced inline (and the launch banner also picks it up via
 *      the shared React Query cache).
 *   2. Inline install — when an update is available, show version + Install
 *      button right in Settings so the user doesn't have to hunt for the
 *      top-of-viewport banner. Same `installAndRelaunch` action as the
 *      banner uses.
 *   3. Manual version switch — lists recent releases for the current channel
 *      and installs the picked version (including downgrades, with a confirm).
 *
 * Renders nothing when `updaterService` is null; web entrypoint passes null.
 */
export function UpdateSettingsSection({
    updaterService,
    portalContainer,
}: {
    updaterService: IUpdaterService | null;
    portalContainer: RefObject<HTMLElement | null>;
}) {
    if (!updaterService) return null;
    return (
        <UpdateSettingsBody
            updaterService={updaterService}
            portalContainer={portalContainer}
        />
    );
}

function UpdateSettingsBody({
    updaterService,
    portalContainer,
}: {
    updaterService: IUpdaterService;
    portalContainer: RefObject<HTMLElement | null>;
}) {
    const currentVersion = updaterService.currentVersion();
    const currentChannel = updaterService.currentChannel();
    const [switching, setSwitching] = useState(false);
    const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

    const { data: result } = useAvailableUpdate(updaterService);
    const update = availableUpdateFrom(result);
    const { install, installing } = useInstallUpdate(updaterService);
    const recheck = useRecheckForUpdate(updaterService);

    const versionsQuery = useQuery({
        queryKey: ["updater", "versions", currentChannel],
        queryFn: () => updaterService.listVersions(),
        staleTime: 60_000,
    });

    const versions = versionsQuery.data ?? [];
    const selectItems: { value: string; label: string }[] = [];
    for (const release of versions) {
        if (release.version === currentVersion) continue;
        selectItems.push({
            value: release.version,
            label: formatVersionLabel(release.version, release.publishedAt),
        });
    }

    const handleCheck = async () => {
        if (recheck.isPending) return;
        await recheck.mutateAsync();
        // Result lands in the shared React Query cache via the mutation. The
        // inline status block below reads it directly; no toast — toasts
        // render in a portal beneath the settings overlay and aren't visible
        // while this panel is open.
    };

    const handleSwitch = async () => {
        if (!selectedVersion || switching) return;
        const isDowngrade =
            compareSemverLoose(selectedVersion, currentVersion) < 0;
        if (
            isDowngrade &&
            !window.confirm(
                t`Switching to v${selectedVersion} will downgrade from v${currentVersion}. The app will restart. Continue?`,
            )
        ) {
            return;
        }
        setSwitching(true);
        try {
            await updaterService.installVersion(selectedVersion);
            // installVersion relaunches on success; this line only runs on
            // unrecoverable failure.
            showErrorNotification({
                notification: {
                    title: t`Switch failed`,
                    message: t`Could not install v${selectedVersion}.`,
                },
            });
        } catch (error) {
            console.error("[updater] installVersion failed", error);
            showErrorNotification({
                notification: {
                    title: t`Switch failed`,
                    message:
                        error instanceof Error
                            ? error.message
                            : t`Could not install v${selectedVersion}.`,
                },
            });
        } finally {
            setSwitching(false);
        }
    };

    // Inline status replaces the previous toast-based "up to date" message.
    // The toast portal renders beneath the settings overlay, so the toast
    // was effectively invisible while the panel was open.
    const checkStatus = renderCheckStatus({
        result,
        update,
        isChecking: recheck.isPending,
    });

    return (
        <div className={styles.section}>
            <div className={styles.sectionRow}>
                <div className={styles.rowText}>
                    <div className={styles.rowTitle}>
                        <Trans>App updates</Trans>
                    </div>
                    <div className={styles.rowDescription}>
                        <Trans>
                            Current version: v{currentVersion} ({currentChannel}
                            )
                        </Trans>
                    </div>
                    {checkStatus ? (
                        <div className={styles.rowDescription}>
                            {checkStatus}
                        </div>
                    ) : null}
                </div>
                <div className={styles.rowControl}>
                    <Button
                        variant="secondary"
                        onClick={handleCheck}
                        disabled={recheck.isPending || installing}
                    >
                        {recheck.isPending
                            ? t`Checking…`
                            : t`Check for updates`}
                    </Button>
                </div>
            </div>

            {update ? (
                <div className={styles.sectionRow}>
                    <div className={styles.rowText}>
                        <div className={styles.rowTitle}>
                            <Trans>Update available</Trans>
                        </div>
                        <div className={styles.rowDescription}>
                            <Trans>
                                v{update.version} is ready to install.
                            </Trans>
                        </div>
                    </div>
                    <div className={styles.rowControl}>
                        <Button
                            variant="primary"
                            onClick={install}
                            disabled={installing}
                        >
                            {installing ? t`Installing…` : t`Install`}
                        </Button>
                    </div>
                </div>
            ) : null}

            <div className={styles.sectionRow}>
                <div className={styles.rowText}>
                    <div className={styles.rowTitle}>
                        <Trans>Switch version</Trans>
                    </div>
                    <div className={styles.rowDescription}>
                        <Trans>
                            Install a specific release for this channel. Older
                            picks will downgrade the app.
                        </Trans>
                    </div>
                </div>
                <div className={styles.rowControl}>
                    <SelectPrimitive
                        items={selectItems}
                        value={selectedVersion ?? undefined}
                        onValueChange={(value) => setSelectedVersion(value)}
                        placeholder={
                            versionsQuery.isLoading
                                ? t`Loading…`
                                : selectItems.length === 0
                                  ? t`No other versions available`
                                  : t`Select a version`
                        }
                        disabled={
                            switching ||
                            versionsQuery.isLoading ||
                            selectItems.length === 0
                        }
                        portalContainer={portalContainer}
                        popupClassName={styles.versionSelectPopup}
                        listClassName={styles.versionSelectList}
                    />
                    <Button
                        variant="primary"
                        onClick={handleSwitch}
                        disabled={!selectedVersion || switching}
                    >
                        {switching ? t`Switching…` : t`Switch`}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function formatVersionLabel(
    version: string,
    publishedAt: string | null,
): string {
    if (!publishedAt) return `v${version}`;
    const date = publishedAt.slice(0, 10);
    return `v${version} — ${date}`;
}

/**
 * Inline status string for the App-updates row, replacing the previous
 * toast-based "up to date" message. Returns null before the user has run
 * a check (initial state — we don't want to assume anything).
 *
 * Three states from the shared `CheckResult`:
 *   - `update`     — the "Update available" row below renders, so this
 *                    short line stays empty to avoid duplication.
 *   - `up-to-date` — user is on the newest release for this channel.
 *   - `error`      — surface the underlying message so the user can see
 *                    why the check failed (network, DNS, parse, etc.)
 *                    instead of getting a false "you're up to date".
 */
function renderCheckStatus({
    result,
    update,
    isChecking,
}: {
    result:
        | import("@/core/domain/updater/IUpdaterService.ts").CheckResult
        | undefined;
    update:
        | import("@/core/domain/updater/IUpdaterService.ts").AvailableUpdate
        | null;
    isChecking: boolean;
}): React.ReactNode | null {
    if (isChecking) return <Trans>Checking the update server…</Trans>;
    if (!result) return null;
    if (update) return null;
    if (result.kind === "up-to-date") {
        return <Trans>You're on the latest release for this channel.</Trans>;
    }
    if (result.kind === "error") {
        return <Trans>Update check failed: {result.message}</Trans>;
    }
    return null;
}

/**
 * Lexicographic-with-numeric-segments comparison. Sufficient for ordering
 * release-please semver tags and the nightly date-sha pseudo-versions used
 * on the Nightly channel; not a full RFC-compliant semver comparator.
 */
function compareSemverLoose(a: string, b: string): number {
    const aParts = a.split(/[.-]/);
    const bParts = b.split(/[.-]/);
    const len = Math.max(aParts.length, bParts.length);
    for (let i = 0; i < len; i++) {
        const aPart = aParts[i] ?? "";
        const bPart = bParts[i] ?? "";
        const aNum = Number(aPart);
        const bNum = Number(bPart);
        if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
            if (aNum !== bNum) return aNum - bNum;
        } else if (aPart !== bPart) {
            return aPart < bPart ? -1 : 1;
        }
    }
    return 0;
}
