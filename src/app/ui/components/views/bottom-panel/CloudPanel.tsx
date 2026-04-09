import { t } from "@lingui/core/macro";
import { Cloud, RefreshCw, UploadCloud } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import {
    ShowErrorNotification,
    ShowNotificationSuccess,
} from "@/app/ui/components/primitives/Notifications.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/Projectview.css.ts";
import {
    GIT_REMOTE_PROJECT_STATUS_CONNECTED,
    GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW,
    GIT_REMOTE_PROJECT_STATUS_OFFLINE,
    GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH,
    GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED,
    GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE,
    GIT_REMOTE_PROJECT_STATUS_SYNCING,
    type GitRemoteProjectStatus,
} from "@/core/persistence/gitRemoteModels.ts";

type CloudPrimaryAction = "none" | "sync" | "review";

export function CloudPanelContent() {
    const { project, remote } = useWorkspaceContext();
    const [isRunningPrimaryAction, setIsRunningPrimaryAction] = useState(false);
    const [isRunningSecondaryAction, setIsRunningSecondaryAction] =
        useState(false);
    const isBusy = remote.isRefreshing || isRunningPrimaryAction;
    const view = getCloudPanelView(
        remote.status,
        remote.isRefreshing,
        project.appSettings.autoAcceptIncomingWork,
    );

    const runPrimaryAction = async () => {
        if (view.primaryAction === "none" || isBusy) return;
        setIsRunningPrimaryAction(true);
        try {
            if (view.primaryAction === "review") {
                await remote.reviewIncoming();
            } else {
                await remote.syncNow();
                ShowNotificationSuccess({
                    notification: {
                        title: t`Cloud status refreshed`,
                    },
                });
            }
        } catch (error) {
            ShowErrorNotification({
                notification: {
                    title: t`Cloud action failed`,
                    message:
                        error instanceof Error
                            ? error.message
                            : t`Please try again.`,
                },
            });
        } finally {
            setIsRunningPrimaryAction(false);
        }
    };

    const runSecondaryAction = async () => {
        if (!view.secondaryActionLabel || remote.isRefreshing) return;
        setIsRunningSecondaryAction(true);
        try {
            await remote.syncNow();
            ShowNotificationSuccess({
                notification: {
                    title: t`Cloud status refreshed`,
                },
            });
        } catch (error) {
            ShowErrorNotification({
                notification: {
                    title: t`Cloud action failed`,
                    message:
                        error instanceof Error
                            ? error.message
                            : t`Please try again.`,
                },
            });
        } finally {
            setIsRunningSecondaryAction(false);
        }
    };

    return (
        <div className={styles.bottomPanelContent}>
            <div className={styles.cloudPanelHeader}>
                <div className={styles.cloudPanelHeaderText}>
                    <div className={styles.cloudPanelTitle}>
                        {view.title}
                        <span className={styles.cloudPanelStatusChip}>
                            {view.statusBadge}
                        </span>
                    </div>
                    <div className={styles.cloudPanelSubtitle}>
                        {view.description}
                    </div>
                </div>
                <div className={styles.cloudPanelActions}>
                    {view.primaryAction !== "none" ? (
                        <Button
                            type="button"
                            size="sm"
                            variant="primary"
                            disabled={isBusy}
                            onClick={() => void runPrimaryAction()}
                            leftIcon={
                                view.primaryAction === "review" ? (
                                    <Cloud size={14} />
                                ) : (
                                    <UploadCloud size={14} />
                                )
                            }
                        >
                            {isRunningPrimaryAction
                                ? t`Syncing...`
                                : view.primaryActionLabel}
                        </Button>
                    ) : null}
                    {view.secondaryActionLabel ? (
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={remote.isRefreshing}
                            onClick={() => void runSecondaryAction()}
                            leftIcon={<RefreshCw size={14} />}
                        >
                            {isRunningSecondaryAction
                                ? t`Refreshing...`
                                : view.secondaryActionLabel}
                        </Button>
                    ) : null}
                </div>
            </div>

            <div className={styles.cloudPanelMetaGrid}>
                <CloudMetaRow
                    label={t`Remote project connected`}
                    value={formatRemoteProject(remote.projectInfo)}
                />
                <CloudMetaRow
                    label={t`Last checked`}
                    value={formatTimestamp(remote.status?.lastCheckedAt)}
                />
                <CloudMetaRow
                    label={t`Last published`}
                    value={formatTimestamp(remote.status?.lastPublishedAt)}
                />
                <CloudMetaRow
                    label={t`Auto sync on open`}
                    value={
                        project.appSettings.autoSyncOnOpen
                            ? t`Enabled`
                            : t`Disabled`
                    }
                />
                <CloudMetaRow
                    label={t`Auto publish on save`}
                    value={
                        project.appSettings.autoPushOnSave
                            ? t`Enabled`
                            : t`Disabled`
                    }
                />
            </div>
        </div>
    );
}

function getCloudPanelView(
    status: GitRemoteProjectStatus | null,
    isRefreshing: boolean,
    autoAcceptIncomingWork: boolean,
): {
    title: string;
    statusBadge: string;
    description: string;
    primaryAction: CloudPrimaryAction;
    primaryActionLabel: string;
    secondaryActionLabel: string | null;
} {
    if (isRefreshing) {
        return {
            title: t`Cloud sync in progress`,
            statusBadge: t`Syncing`,
            description: t`Checking cloud status for this project.`,
            primaryAction: "none",
            primaryActionLabel: "",
            secondaryActionLabel: null,
        };
    }

    if (!status) {
        return {
            title: t`Cloud is not linked`,
            statusBadge: t`Local only`,
            description: t`Link this project in Settings > Advanced to publish and sync with cloud.`,
            primaryAction: "none",
            primaryActionLabel: "",
            secondaryActionLabel: null,
        };
    }

    switch (status.kind) {
        case GIT_REMOTE_PROJECT_STATUS_CONNECTED:
            return {
                title: t`Project is in sync`,
                statusBadge: t`Connected`,
                description: t`Local and cloud are aligned.`,
                primaryAction: "sync",
                primaryActionLabel: t`Check now`,
                secondaryActionLabel: null,
            };
        case GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH:
            return {
                title: t`Local changes are ready to publish`,
                statusBadge: t`Ahead`,
                description: t`Your latest local save is not yet in cloud.`,
                primaryAction: "sync",
                primaryActionLabel: t`Publish now`,
                secondaryActionLabel: t`Refresh status`,
            };
        case GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE:
            return {
                title: autoAcceptIncomingWork
                    ? t`Incoming cloud updates are ready to sync`
                    : t`Incoming cloud updates are available`,
                statusBadge: t`Behind`,
                description: autoAcceptIncomingWork
                    ? formatLatestIncomingDescription(
                          status.latestIncomingAuthorName,
                          t`Sync now will auto-accept non-conflicting incoming changes.`,
                      )
                    : formatLatestIncomingDescription(
                          status.latestIncomingAuthorName,
                          t`Review incoming changes before bringing them into this project.`,
                      ),
                primaryAction: autoAcceptIncomingWork ? "sync" : "review",
                primaryActionLabel: autoAcceptIncomingWork
                    ? t`Sync now`
                    : t`Review changes`,
                secondaryActionLabel: t`Refresh status`,
            };
        case GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW:
            return {
                title: autoAcceptIncomingWork
                    ? t`Cloud and local work may be reconciled automatically`
                    : t`Cloud and local work need reconciliation`,
                statusBadge: t`Needs review`,
                description: autoAcceptIncomingWork
                    ? formatLatestIncomingDescription(
                          status.latestIncomingAuthorName,
                          t`Sync now will auto-accept non-conflicting incoming changes. If overlap remains, review will open.`,
                      )
                    : formatLatestIncomingDescription(
                          status.latestIncomingAuthorName,
                          t`Both local and cloud changed. Review to choose the final result.`,
                      ),
                primaryAction: autoAcceptIncomingWork ? "sync" : "review",
                primaryActionLabel: autoAcceptIncomingWork
                    ? t`Sync now`
                    : t`Review changes`,
                secondaryActionLabel: t`Refresh status`,
            };
        case GIT_REMOTE_PROJECT_STATUS_OFFLINE:
            return {
                title: t`Cloud is unavailable`,
                statusBadge: t`Offline`,
                description: t`You can keep working locally and retry cloud sync when available.`,
                primaryAction: "sync",
                primaryActionLabel: t`Retry sync`,
                secondaryActionLabel: null,
            };
        case GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED:
            return {
                title: t`Cloud account needs reconnect`,
                statusBadge: t`Reconnect`,
                description: t`Reconnect your cloud account to resume sync and publish.`,
                primaryAction: "none",
                primaryActionLabel: "",
                secondaryActionLabel: t`Refresh status`,
            };
        case GIT_REMOTE_PROJECT_STATUS_SYNCING:
            return {
                title: t`Cloud sync in progress`,
                statusBadge: t`Syncing`,
                description: t`Checking cloud status for this project.`,
                primaryAction: "none",
                primaryActionLabel: "",
                secondaryActionLabel: null,
            };
    }
}

function CloudMetaRow(props: {
    label: string;
    value: string;
    icon?: ReactNode;
}) {
    return (
        <div className={styles.cloudPanelMetaRow}>
            <div className={styles.cloudPanelMetaLabel}>{props.label}</div>
            <div className={styles.cloudPanelMetaValue}>
                {props.icon ? (
                    <span className={styles.cloudPanelMetaValueIcon}>
                        {props.icon}
                    </span>
                ) : null}
                {props.value}
            </div>
        </div>
    );
}

function formatLatestIncomingDescription(
    latestIncomingAuthorName: string | null | undefined,
    fallback: string,
): string {
    if (!latestIncomingAuthorName) return fallback;
    return t`Latest changes are from ${latestIncomingAuthorName}. ${fallback}`;
}

function formatRemoteProject(
    remoteInfo:
        | {
              repoOwner: string;
              repoName: string;
          }
        | null
        | undefined,
): string {
    if (!remoteInfo) return t`Not connected`;
    return `${remoteInfo.repoOwner}/${remoteInfo.repoName}`;
}

function formatTimestamp(value?: string | null): string {
    if (!value) return "n/a";
    const timestamp = new Date(value);
    if (Number.isNaN(timestamp.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(timestamp);
}
