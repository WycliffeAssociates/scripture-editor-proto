import { Cloud, CloudCheck, CloudOff, RefreshCw } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { joinClassNames } from "../classNames.ts";
import * as styles from "./cloudStatusButton.css.ts";

export type CloudStatusButtonState =
  | "connected"
  | "behind"
  | "diverged"
  | "syncing";

export interface CloudStatusButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  state: CloudStatusButtonState;
  tooltipLabel?: string;
  tooltipDescription?: string;
  ariaLabel?: string;
  icon?: ReactNode;
}

function getDefaultTooltipLabel(state: CloudStatusButtonState) {
  switch (state) {
    case "connected":
      return "Connected";
    case "behind":
      return "Behind";
    case "diverged":
      return "Diverged";
    case "syncing":
      return "Syncing";
  }
}

function getStateIcon(state: CloudStatusButtonState) {
  switch (state) {
    case "connected":
      return <CloudCheck size={14} />;
    case "behind":
      return <Cloud size={14} />;
    case "diverged":
      return <CloudOff size={14} />;
    case "syncing":
      return <RefreshCw size={14} className={styles.spinningIcon} />;
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
  const title = tooltipDescription ? `${label} — ${tooltipDescription}` : label;

  return (
    <button
      type={type}
      className={joinClassNames(
        styles.root,
        styles.stateVariants[state],
        className,
      )}
      data-state={state}
      aria-label={ariaLabel ?? title}
      title={title}
      {...props}
    >
      <span className={styles.iconSlot} aria-hidden="true">
        {icon ?? getStateIcon(state)}
      </span>
      {children ? <span className={styles.content}>{children}</span> : null}
    </button>
  );
}
