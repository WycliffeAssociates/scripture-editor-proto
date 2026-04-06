import { t } from "@lingui/core/macro";
import { AlertCircle, Cloud, CloudOff, RefreshCw } from "lucide-react";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import * as styles from "@/app/ui/styles/modules/CloudProjectStatus.css.ts";
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

type BadgeColor = "teal" | "blue" | "orange" | "yellow" | "gray" | "red";

type CloudStatusPresentation = {
    badgeLabel: string;
    color: BadgeColor;
    bannerTitle: string | null;
    bannerMessage: string | null;
    actionKind: "sync" | "review" | null;
    actionLabel: string | null;
};

function Badge({
    color,
    children,
    icon,
}: {
    color: BadgeColor;
    children: React.ReactNode;
    icon?: React.ReactNode;
}) {
    return (
        <span className={`${styles.badgeBase} ${styles.badgeVariants[color]}`}>
            {icon ? <span>{icon}</span> : null}
            {children}
        </span>
    );
}

function getCloudStatusPresentation(
    status: GitRemoteProjectStatus,
): CloudStatusPresentation {
    switch (status.kind) {
        case GIT_REMOTE_PROJECT_STATUS_CONNECTED:
            return {
                badgeLabel: t`Connected`,
                color: "teal",
                bannerTitle: null,
                bannerMessage: null,
                actionKind: null,
                actionLabel: null,
            };
        case GIT_REMOTE_PROJECT_STATUS_SYNCING:
            return {
                badgeLabel: t`Syncing`,
                color: "blue",
                bannerTitle: t`Syncing with cloud`,
                bannerMessage: t`Checking cloud updates for this project.`,
                actionKind: null,
                actionLabel: null,
            };
        case GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH:
            return {
                badgeLabel: t`Changes not yet published`,
                color: "orange",
                bannerTitle: t`Changes not yet published`,
                bannerMessage: t`Your latest local save has not been published to the cloud yet.`,
                actionKind: "sync" as const,
                actionLabel: t`Sync now`,
            };
        case GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE:
            return {
                badgeLabel: t`Cloud updates available`,
                color: "blue",
                bannerTitle: t`Cloud updates available`,
                bannerMessage: t`New cloud changes are ready for review before you bring them into this project.`,
                actionKind: "review" as const,
                actionLabel: t`Review changes`,
            };
        case GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW:
            return {
                badgeLabel: t`Needs review`,
                color: "yellow",
                bannerTitle: t`Cloud and local changes need review`,
                bannerMessage: t`This project has local and cloud changes that need review before the next publish.`,
                actionKind: "review" as const,
                actionLabel: t`Review changes`,
            };
        case GIT_REMOTE_PROJECT_STATUS_OFFLINE:
            return {
                badgeLabel: t`Offline`,
                color: "gray",
                bannerTitle: t`Cloud is unavailable`,
                bannerMessage: t`You can keep working locally. Try syncing again when you are back online.`,
                actionKind: "sync" as const,
                actionLabel: t`Try again`,
            };
        case GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED:
            return {
                badgeLabel: t`Reconnect account`,
                color: "red",
                bannerTitle: t`Reconnect your account`,
                bannerMessage: t`Cloud actions are paused until you sign in to this linked account again.`,
                actionKind: null,
                actionLabel: null,
            };
    }
}

export function CloudProjectStatusBadge(args: {
    status: GitRemoteProjectStatus | null;
    isRefreshing: boolean;
}) {
    if (!args.status) return null;
    const presentation = getCloudStatusPresentation(args.status);

    return (
        <Badge
            color={presentation.color}
            icon={
                args.isRefreshing ? (
                    <RefreshCw size={12} />
                ) : args.status.kind === GIT_REMOTE_PROJECT_STATUS_OFFLINE ? (
                    <CloudOff size={12} />
                ) : (
                    <Cloud size={12} />
                )
            }
        >
            {presentation.badgeLabel}
        </Badge>
    );
}

export function CloudProjectStatusBanner(args: {
    status: GitRemoteProjectStatus | null;
    isRefreshing: boolean;
    onSync: () => void;
    onReview: () => void;
}) {
    if (!args.status) return null;

    const presentation = getCloudStatusPresentation(args.status);
    if (!presentation.bannerTitle || !presentation.bannerMessage) {
        return null;
    }

    const handleAction = () => {
        if (presentation.actionKind === "sync") {
            args.onSync();
        } else if (presentation.actionKind === "review") {
            args.onReview();
        }
    };

    return (
        <div
            className={`${styles.alert} ${styles.alertVariants[presentation.color]}`}
        >
            <span className={styles.alertIcon}>
                <AlertCircle size={16} />
            </span>
            <div className={styles.alertContent}>
                <p className={styles.alertTitle}>{presentation.bannerTitle}</p>
                <div className={styles.alertActions}>
                    <p className={styles.alertText}>
                        {presentation.bannerMessage}
                    </p>
                    {presentation.actionLabel ? (
                        <Button
                            size="sm"
                            onClick={handleAction}
                            disabled={args.isRefreshing}
                        >
                            {presentation.actionLabel}
                        </Button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
