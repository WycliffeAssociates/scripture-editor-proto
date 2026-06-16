import { style } from "@vanilla-extract/css";

import { vars } from "@/app/ui/styles/designSystem.css.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";

export const trigger = style({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  height: "2rem",
  padding: `0 ${vars.spacing.sm}`,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.md,
  backgroundColor: vars.color.surfacePrimary,
  color: vars.color.onSurfaceSecondary,
  fontSize: vars.typography.bodySmall.fontSize,
  fontWeight: 500,
  lineHeight: 1,
  cursor: "pointer",
  whiteSpace: "nowrap",
  selectors: {
    "&:hover:not(:disabled)": {
      backgroundColor: vars.color.surfaceSecondary,
      borderColor: vars.color.brandBase,
    },
    "&:disabled": { opacity: 0.5, cursor: "not-allowed" },
  },
});

export const positioner = style({
  zIndex: zLayer.selectDropdown,
});

export const popup = style({
  width: "min(22rem, calc(100vw - 2rem))",
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.md,
  padding: vars.spacing.md,
  backgroundColor: vars.color.surfacePrimary,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.lg,
  boxShadow: vars.shadow.large,
  zIndex: zLayer.selectDropdown,
});

export const header = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.15rem",
});

export const title = style({
  margin: 0,
  fontSize: vars.typography.bodyNormal.fontSize,
  fontWeight: 700,
  color: vars.color.onSurfacePrimary,
});

export const subtitle = style({
  margin: 0,
  fontSize: vars.typography.bodySmallest.fontSize,
  lineHeight: vars.typography.bodySmallest.lineHeight,
  color: vars.color.onSurfaceSecondary,
});

export const field = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.xs,
});

export const label = style({
  fontSize: vars.typography.bodySmallest.fontSize,
  fontWeight: 600,
  letterSpacing: "0.02em",
  textTransform: "uppercase",
  color: vars.color.onSurfaceSecondary,
});

export const scopeHeader = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.spacing.sm,
});

export const sentinelGroup = style({
  display: "inline-flex",
  gap: vars.spacing.md,
});

export const help = style({
  fontSize: vars.typography.bodySmallest.fontSize,
  lineHeight: vars.typography.bodySmallest.lineHeight,
  color: vars.color.onSurfaceTertiary,
});

export const sentinelButton = style({
  appearance: "none",
  border: "none",
  background: "transparent",
  padding: 0,
  fontSize: vars.typography.bodySmallest.fontSize,
  fontWeight: 600,
  color: vars.color.brandBase,
  cursor: "pointer",
  selectors: {
    "&:hover": { textDecoration: "underline" },
    "&:disabled": {
      opacity: 0.4,
      cursor: "not-allowed",
      textDecoration: "none",
    },
  },
});

export const scopeList = style({
  display: "flex",
  flexDirection: "column",
  maxHeight: "11rem",
  overflowY: "auto",
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.md,
});

export const scopeRow = style({
  display: "flex",
  alignItems: "center",
  gap: vars.spacing.sm,
  padding: `0.3rem ${vars.spacing.sm}`,
  fontSize: vars.typography.bodySmall.fontSize,
  color: vars.color.onSurfacePrimary,
  cursor: "pointer",
  selectors: {
    "&:hover": { backgroundColor: vars.color.brandLight },
  },
});

export const usfmToggle = style({
  display: "flex",
  alignItems: "center",
  gap: vars.spacing.sm,
  cursor: "pointer",
  fontSize: vars.typography.bodySmall.fontSize,
  color: vars.color.onSurfacePrimary,
});

export const footer = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.xs,
});

export const errorText = style({
  margin: 0,
  fontSize: vars.typography.bodySmallest.fontSize,
  lineHeight: vars.typography.bodySmallest.lineHeight,
  color: vars.color.onSurfaceError,
});

export const printButton = style({
  width: "100%",
  height: "2.25rem",
  border: "none",
  borderRadius: vars.border.radius.md,
  backgroundColor: vars.color.brandBase,
  color: vars.button.primary.onSurface,
  fontSize: vars.typography.bodySmall.fontSize,
  fontWeight: 600,
  cursor: "pointer",
  selectors: {
    "&:hover:not(:disabled)": { backgroundColor: vars.color.brandDark },
    "&:disabled": { opacity: 0.5, cursor: "not-allowed" },
  },
});
