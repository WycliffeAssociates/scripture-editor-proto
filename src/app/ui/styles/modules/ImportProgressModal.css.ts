import { keyframes, style } from "@vanilla-extract/css";

import { vars } from "@/app/ui/styles/designSystem.css.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";

// The import-lifecycle modal: prominent, un-ignorable surface that replaces the
// create screen's toasts. Scaffolding mirrors the chapter-label picker so the
// app's dialogs read consistently; all values pull from the design-system vars.

export const backdrop = style({
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0, 0, 0, 0.45)",
  zIndex: zLayer.dialog,
});

export const popup = style({
  position: "fixed",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  zIndex: zLayer.dialog,
  width: "min(28rem, calc(100vw - 2rem))",
  maxHeight: "calc(100vh - 4rem)",
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.md,
  padding: vars.spacing.lg,
  backgroundColor: vars.color.surfacePrimary,
  color: vars.color.onSurfacePrimary,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.lg,
  boxShadow: vars.shadow.large,
});

export const title = style({
  fontSize: vars.typography.bodyNormal.fontSize,
  fontWeight: 600,
  margin: 0,
});

export const message = style({
  fontSize: vars.typography.bodySmall.fontSize,
  color: vars.color.onSurfacePrimary,
  margin: 0,
});

export const reassurance = style({
  fontSize: vars.typography.bodySmall.fontSize,
  color: vars.color.onSurfaceSecondary,
  margin: 0,
});

export const warning = style({
  fontSize: vars.typography.bodySmallest.fontSize,
  color: vars.color.onSurfaceSecondary,
  margin: 0,
});

const spin = keyframes({
  to: { transform: "rotate(360deg)" },
});

export const progressRow = style({
  display: "flex",
  alignItems: "center",
  gap: vars.spacing.sm,
});

export const spinner = style({
  animation: `${spin} 0.8s linear infinite`,
  color: vars.color.brandBase,
  flexShrink: 0,
  "@media": {
    "screen and (prefers-reduced-motion: reduce)": {
      animation: "none",
    },
  },
});

export const actions = style({
  display: "flex",
  justifyContent: "flex-end",
  gap: vars.spacing.sm,
  flexWrap: "wrap",
});
