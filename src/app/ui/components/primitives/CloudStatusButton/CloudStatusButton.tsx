import {
  Cloud,
  CloudAlert,
  CloudCheck,
  CloudDownload,
  CloudOff,
  CloudUpload,
  RefreshCw,
} from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { joinClassNames } from "../classNames.ts";
import * as styles from "./cloudStatusButton.css.ts";

/**
 * The semantic shared-project state. The button owns the visual mapping
 * (tone + icon) so the producer only has to name the situation, not pick a
 * colour — see `tone`/`getStateIcon` below for the single source of truth.
 */
export type CloudStatusButtonState =
  | "refreshing"
  | "none"
  | "connected"
  | "changesToSend"
  | "updatesToReceive"
  | "needsReview"
  | "offline"
  | "signInAgain";

/** Foreground tone buckets the states collapse into. */
type CloudStatusTone = "brand" | "warning" | "error" | "muted";

const stateTone: Record<CloudStatusButtonState, CloudStatusTone> = {
  refreshing: "brand",
  none: "brand",
  connected: "brand",
  changesToSend: "warning",
  updatesToReceive: "warning",
  needsReview: "warning",
  offline: "muted",
  signInAgain: "error",
};

export interface CloudStatusButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  state: CloudStatusButtonState;
  tooltipLabel?: string;
  tooltipDescription?: string;
  ariaLabel?: string;
  icon?: ReactNode;
}

function getDefaultTooltipLabel(state: CloudStatusButtonState) {
  switch (state) {
    case "refreshing":
      return "Checking…";
    case "none":
      return "Shared project";
    case "connected":
      return "Up to date";
    case "changesToSend":
      return "Changes to send";
    case "updatesToReceive":
      return "Updates to receive";
    case "needsReview":
      return "Needs review";
    case "offline":
      return "Offline";
    case "signInAgain":
      return "Sign in again";
  }
}

function getStateIcon(state: CloudStatusButtonState) {
  switch (state) {
    case "refreshing":
      return <RefreshCw size={16} className={styles.spinningIcon} />;
    case "none":
      return <Cloud size={16} />;
    case "connected":
      return <CloudCheck size={16} />;
    case "changesToSend":
      return <CloudUpload size={16} />;
    case "updatesToReceive":
      return <CloudDownload size={16} />;
    case "needsReview":
      return <CloudAlert size={16} />;
    case "offline":
      return <CloudOff size={16} />;
    case "signInAgain":
      return <CloudAlert size={16} />;
  }
}

export function CloudStatusButton({
  state,
  tooltipLabel,
  tooltipDescription,
  ariaLabel,
  icon,
  className,
  type = "button",
  children,
  ...props
}: CloudStatusButtonProps) {
  const label = tooltipLabel ?? getDefaultTooltipLabel(state);
  // Used only as the screen-reader fallback. The visible hover hint comes from
  // an `IconTooltip` wrapper at the call site (consistent styled tooltip), so
  // we deliberately don't render a native `title` here — it would double up.
  const ariaFallback = tooltipDescription
    ? `${label} — ${tooltipDescription}`
    : label;

  return (
    <button
      type={type}
      className={joinClassNames(
        styles.root,
        styles.toneVariants[stateTone[state]],
        className,
      )}
      data-state={state}
      aria-label={ariaLabel ?? ariaFallback}
      {...props}
    >
      <span className={styles.iconSlot} aria-hidden="true">
        {icon ?? getStateIcon(state)}
      </span>
      {children ? <span className={styles.content}>{children}</span> : null}
    </button>
  );
}
