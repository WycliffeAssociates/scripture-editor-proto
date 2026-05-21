import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { ShowErrorNotification } from "@/app/ui/components/primitives/Notifications.tsx";
import { SelectPrimitive } from "@/app/ui/components/primitives/Select/Select.tsx";
import {
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
}: {
    updaterService: IUpdaterService | null;
}) {
    if (!updaterService) return null;
    return <UpdateSettingsBody updaterService={updaterService} />;
}

function UpdateSettingsBody({
    updaterService,
}: {
    updaterService: IUpdaterService;
}) {
    const currentVersion = updaterService.currentVersion();
    const currentChannel = updaterService.currentChannel();
    const [switching, setSwitching] = useState(false);
    const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

    const { data: update } = useAvailableUpdate(updaterService);
    const { install, installing } = useInstallUpdate(updaterService);
    const recheck = useRecheckForUpdate(updaterService);

    const versionsQuery = useQuery({
        queryKey: ["updater", "versions", currentChannel],
        queryFn: () => updaterService.listVersions(),
        staleTime: 60_000,
    });

    const versions = versionsQuery.data ?? [];
    const selectItems = versions
        .filter((release) => release.version !== currentVersion)
        .map((release) => ({
            value: release.version,
            label: formatVersionLabel(release.version, release.publishedAt),
        }));

    const handleCheck = async () => {
        if (recheck.isPending) return;
        const result = await recheck.mutateAsync();
        if (!result) {
            ShowErrorNotification({
                notification: {
                    title: t`You're up to date`,
                    message: t`No newer release is available on the ${currentChannel} channel.`,
                },
            });
        }
        // When an update is found it lands in the shared cache; the status
        // row below renders inline and the launch banner also reappears
        // (unless the user dismissed it earlier this session).
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
            ShowErrorNotification({
                notification: {
                    title: t`Switch failed`,
                    message: t`Could not install v${selectedVersion}.`,
                },
            });
        } catch (error) {
            console.error("[updater] installVersion failed", error);
            ShowErrorNotification({
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
