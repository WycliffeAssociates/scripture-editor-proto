import { style } from "@vanilla-extract/css";

import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const pendingRoot = style({
  minHeight: "100vh",
  width: "100vw",
  display: "grid",
  placeItems: "center",
  padding: vars.spacing.lg,
  backgroundColor: vars.color.surfaceSecondary,
});

export const pendingPaper = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "12rem",
  minHeight: "4rem",
  padding: `${vars.spacing.md} ${vars.spacing.lg}`,
  borderRadius: vars.border.radius.md,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  backgroundColor: vars.color.surfacePrimary,
  color: vars.color.onSurfacePrimary,
  boxShadow: vars.shadow.large,
  fontSize: vars.typography.bodySmall.fontSize,
  fontWeight: 600,
});
