import { keyframes, style, styleVariants } from "@vanilla-extract/css";

import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const root = style({
  // Bare icon button (no chip chrome): a fixed 2rem square that carries its
  // status purely through icon shape + tone colour. Hover lifts a faint
  // tertiary tint, like the other toolbar triggers.
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: vars.spacing.xs,
  height: "2rem",
  minWidth: "2rem",
  padding: `0 ${vars.spacing.xs}`,
  borderRadius: vars.border.radius.md,
  border: `${vars.border.width.thin} solid transparent`,
  backgroundColor: "transparent",
  whiteSpace: "nowrap",
  cursor: "pointer",
  transition: "background-color 140ms ease, color 140ms ease",
  selectors: {
    "&:hover": {
      backgroundColor: vars.button.tertiary.surfaceHover,
    },
    "&:focus-visible": {
      outline: "none",
      boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
    },
    "&:disabled": {
      cursor: "not-allowed",
      opacity: 0.6,
    },
  },
});

const spin = keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

export const spinningIcon = style({
  animation: `${spin} 900ms linear infinite`,
});

export const content = style({
  display: "inline-flex",
  alignItems: "center",
});

export const iconSlot = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
});

export const toneVariants = styleVariants({
  brand: { color: vars.color.brandBase },
  warning: { color: vars.color.onSurfaceWarning },
  error: { color: vars.color.onSurfaceError },
  muted: { color: vars.color.onSurfaceTertiary },
});
