import { style } from "@vanilla-extract/css";

import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const metadataPage = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.lg,
  padding: vars.spacing.lg,
  maxWidth: "1200px",
  margin: "0 auto",
});

export const metadataHeader = style({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: vars.spacing.md,
});

export const metadataHeaderLeft = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.xs,
});

export const metadataHeaderRight = style({
  display: "flex",
  gap: vars.spacing.sm,
});

export const metadataTitleRow = style({
  display: "flex",
  alignItems: "center",
  gap: vars.spacing.sm,
});

export const metadataSubtitle = style({
  fontSize: vars.typography.bodySmall.fontSize,
  color: vars.color.onSurfaceTertiary,
});

export const metadataCard = style({
  backgroundColor: vars.color.surfacePrimary,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.md,
  padding: vars.spacing.md,
});

export const metadataSection = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.md,
});

export const metadataSectionTitle = style({
  fontSize: vars.typography.h4.fontSize,
  fontWeight: vars.typography.h4.fontWeight,
  lineHeight: vars.typography.h4.lineHeight,
  color: vars.color.onSurfacePrimary,
  margin: 0,
});

export const formRow = style({
  display: "flex",
  gap: vars.spacing.md,
  alignItems: "flex-end",
});

export const formRowGrow = style({
  display: "flex",
  gap: vars.spacing.md,
  alignItems: "flex-end",
  flex: 1,
});

export const formGroup = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.xs,
  flex: 1,
});

export const alert = style({
  display: "flex",
  alignItems: "flex-start",
  gap: vars.spacing.sm,
  padding: vars.spacing.md,
  borderRadius: vars.border.radius.md,
  border: `${vars.border.width.thin} solid transparent`,
});

export const alertError = style({
  backgroundColor: vars.color.surfaceError,
  borderColor: vars.color.onSurfaceError,
  color: vars.color.onSurfaceError,
});

export const alertSuccess = style({
  backgroundColor: vars.color.surfaceSuccess,
  borderColor: vars.color.onSurfaceSuccess,
  color: vars.color.onSurfaceSuccess,
});

export const alertIcon = style({
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

export const alertContent = style({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.xs,
});

export const alertTitle = style({
  fontWeight: 600,
  fontSize: vars.typography.bodySmall.fontSize,
});

export const badge = style({
  display: "inline-flex",
  alignItems: "center",
  padding: `${vars.spacing.xs} ${vars.spacing.sm}`,
  fontSize: vars.typography.bodySmallest.fontSize,
  fontWeight: 500,
  borderRadius: vars.border.radius.sm,
  backgroundColor: vars.color.surfaceSecondary,
  color: vars.color.onSurfaceSecondary,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
});
