import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { joinClassNames } from "../classNames.ts";
import * as styles from "./switch.css.ts";

export interface SwitchProps extends Omit<
  ComponentPropsWithoutRef<typeof BaseSwitch.Root>,
  "children"
> {
  label?: ReactNode;
  className?: string;
  /**
   * Render a smaller variant (slimmer track + lighter label) suitable for
   * dense surfaces like the reference pane sticky nav.
   */
  compact?: boolean;
}

export function Switch({
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  readOnly,
  label,
  className,
  compact,
  ...rootProps
}: SwitchProps) {
  return (
    <span
      className={joinClassNames(
        compact ? styles.rootCompact : styles.root,
        className,
      )}
    >
      <BaseSwitch.Root
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        readOnly={readOnly}
        className={compact ? styles.trackCompact : styles.track}
        {...rootProps}
      >
        <BaseSwitch.Thumb
          className={compact ? styles.thumbCompact : styles.thumb}
        />
      </BaseSwitch.Root>
      {label ? (
        <span className={compact ? styles.labelCompact : styles.label}>
          {label}
        </span>
      ) : null}
    </span>
  );
}
