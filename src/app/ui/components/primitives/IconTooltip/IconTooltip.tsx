import { Tooltip } from "@base-ui/react/tooltip";
import type { ReactElement } from "react";

import { zLayer } from "@/app/ui/styles/zLayers.ts";

import * as styles from "./iconTooltip.css.ts";

export interface IconTooltipProps {
  /**
   * The hover hint. Should already be localized (e.g. ``t`Undo` ``). It is the
   * caller's job to also set a matching `aria-label` on the trigger element for
   * screen readers — the tooltip popup is a sighted-user affordance.
   */
  label: string;
  /**
   * The interactive element the tooltip describes — typically an icon-only
   * `<button>`. Passed straight to `Tooltip.Trigger`'s `render`, so it keeps
   * its own props, ref, and event handlers.
   */
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
}

/**
 * Hover/focus hint for icon-only or otherwise ambiguous buttons.
 *
 * Wraps Base UI's tooltip with the shared popup style and toolbar z-layer so
 * every surface (toolbars, popovers, sidebars, diff chrome) gets the same
 * affordance without re-deriving the Base UI boilerplate or popup styling.
 */
export function IconTooltip({
  label,
  children,
  side = "top",
}: IconTooltipProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner
          side={side}
          align="center"
          sideOffset={6}
          style={{ zIndex: zLayer.toolbarTooltip }}
        >
          <Tooltip.Popup className={styles.popup}>{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
