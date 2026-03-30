import { t } from "@lingui/core/macro";
import { Alert, Badge, Button, Group, rem, Text } from "@mantine/core";
import { AlertCircle, Cloud, CloudOff, RefreshCw } from "lucide-react";
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

function getCloudStatusPresentation(status: GitRemoteProjectStatus) {
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
            variant="light"
            color={presentation.color}
            leftSection={
                args.isRefreshing ? (
                    <RefreshCw size={rem(12)} />
                ) : args.status.kind === GIT_REMOTE_PROJECT_STATUS_OFFLINE ? (
                    <CloudOff size={rem(12)} />
                ) : (
                    <Cloud size={rem(12)} />
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
        <Alert
            color={presentation.color}
            icon={<AlertCircle size={rem(16)} />}
            title={presentation.bannerTitle}
            variant="light"
        >
            <Group justify="space-between" align="center" wrap="wrap">
                <Text size="sm">{presentation.bannerMessage}</Text>
                {presentation.actionLabel ? (
                    <Button
                        size="compact-sm"
                        variant="white"
                        onClick={handleAction}
                        loading={args.isRefreshing}
                    >
                        {presentation.actionLabel}
                    </Button>
                ) : null}
            </Group>
        </Alert>
    );
}
