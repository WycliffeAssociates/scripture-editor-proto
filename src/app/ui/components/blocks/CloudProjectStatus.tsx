import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { AlertCircle, Cloud, CloudOff, RefreshCw } from "lucide-react";

import {
  presentSharedProjectStatus,
  sharedProjectActions,
} from "@/app/domain/project/remoteSync/sharedProjectCopy.ts";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import * as styles from "@/app/ui/styles/modules/CloudProjectStatus.css.ts";
import {
  GIT_REMOTE_PROJECT_STATUS_CONNECTED,
  GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW,
  GIT_REMOTE_PROJECT_STATUS_OFFLINE,
  GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH,
  GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED,
  GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE,
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
  // Badge/title/message text comes from the shared-project glossary so this
  // banner can't drift from the toolbar chip and status popover. Only the
  // banner-specific color + action semantics stay local.
  const shared = presentSharedProjectStatus({
    status,
    isRefreshing: false,
    i18n,
  });
  const base = {
    badgeLabel: shared.chipLabel,
    bannerTitle: shared.headline,
    bannerMessage: shared.detail,
  };
  switch (status.kind) {
    case GIT_REMOTE_PROJECT_STATUS_CONNECTED:
      return {
        ...base,
        color: "teal",
        bannerTitle: null,
        bannerMessage: null,
        actionKind: null,
        actionLabel: null,
      };
    case GIT_REMOTE_PROJECT_STATUS_PENDING_PUBLISH:
      return {
        ...base,
        color: "orange",
        actionKind: "sync" as const,
        actionLabel: i18n._(sharedProjectActions.send),
      };
    case GIT_REMOTE_PROJECT_STATUS_REMOTE_UPDATES_AVAILABLE:
      return {
        ...base,
        color: "blue",
        actionKind: "review" as const,
        actionLabel: i18n._(sharedProjectActions.review),
      };
    case GIT_REMOTE_PROJECT_STATUS_NEEDS_REVIEW:
      return {
        ...base,
        color: "yellow",
        actionKind: "review" as const,
        actionLabel: i18n._(sharedProjectActions.review),
      };
    case GIT_REMOTE_PROJECT_STATUS_OFFLINE:
      return {
        ...base,
        color: "gray",
        actionKind: "sync" as const,
        actionLabel: t`Try again`,
      };
    case GIT_REMOTE_PROJECT_STATUS_REAUTH_REQUIRED:
      return {
        ...base,
        color: "red",
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
          <p className={styles.alertText}>{presentation.bannerMessage}</p>
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
