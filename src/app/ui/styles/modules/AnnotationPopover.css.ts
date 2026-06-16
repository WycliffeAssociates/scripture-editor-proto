import { keyframes, style } from "@vanilla-extract/css";

import { vars } from "@/app/ui/styles/designSystem.css.ts";

/**
 * Styles for the inline lint-fix popover. All values pull from the design-system
 * contract (`vars`) — no hardcoded colors.
 */

const popIn = keyframes({
  from: { opacity: 0, transform: "translateY(-4px) scale(0.98)" },
  to: { opacity: 1, transform: "translateY(0) scale(1)" },
});

// Floating surface — mirrors FindingsPopover.popover, sized down for an inline
// affordance rather than a full panel. Shared by lint mode and custom content.
export const popup = style({
  minWidth: "16rem",
  maxWidth: "24rem",
  backgroundColor: vars.color.surfacePrimary,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.lg,
  boxShadow: vars.shadow.large,
  overflow: "hidden",
  animation: `${popIn} 120ms ease-out`,
  transformOrigin: "var(--transform-origin)",
  color: vars.color.onSurfacePrimary,
});

// Stacked card: icon + message, then a full-width primary action.
export const body = style({
  padding: vars.spacing.md,
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.sm,
});

export const item = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.sm,
  selectors: {
    "&:not(:last-child)": {
      paddingBottom: vars.spacing.sm,
      borderBottom: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    },
  },
});

export const head = style({
  display: "flex",
  alignItems: "flex-start",
  gap: vars.spacing.sm,
});

export const icon = style({
  display: "inline-flex",
  flexShrink: 0,
  marginTop: "0.0625rem",
  color: vars.color.onSurfaceError,
});

export const message = style({
  fontSize: vars.typography.bodySmallest.fontSize,
  lineHeight: 1.45,
  color: vars.color.onSurfacePrimary,
});

export const fullButton = style({
  width: "100%",
});
