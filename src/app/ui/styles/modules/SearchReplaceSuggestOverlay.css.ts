import { style } from "@vanilla-extract/css";

import { vars } from "@/app/ui/styles/designSystem.css.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";

export const overlayHost = style({
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  zIndex: zLayer.floatingPanel,
});

export const suggestion = style({
  position: "absolute",
  pointerEvents: "auto",
});

export const underline = style({
  position: "absolute",
  left: 0,
  top: 0,
  border: "none",
  borderBottom: `2px dotted ${vars.color.brandBase}`,
  background: "transparent",
  padding: 0,
  margin: 0,
  cursor: "pointer",
  selectors: {
    "&:hover": {
      borderBottomColor: vars.color.brandDark,
    },
  },
});

// Content rendered inside the shared AnnotationPopover shell (which supplies the
// surface, border, radius, shadow, and collision handling). Mirrors the findings
// annotation card: a stacked message above a full-width primary action.
export const popoverBody = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.sm,
  padding: vars.spacing.md,
});

export const popoverMessage = style({
  fontSize: vars.typography.bodySmallest.fontSize,
  lineHeight: 1.45,
  color: vars.color.onSurfacePrimary,
});

export const fullButton = style({
  width: "100%",
});
