import { style, styleVariants } from "@vanilla-extract/css";

import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const badgeBase = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.spacing.xs,
  padding: `${vars.spacing.xs} ${vars.spacing.sm}`,
  borderRadius: vars.border.radius.full,
  fontSize: vars.typography.bodySmallest.fontSize,
  fontWeight: 600,
  lineHeight: 1,
  whiteSpace: "nowrap",
});

export const badgeVariants = styleVariants({
  teal: {
    backgroundColor: vars.color.surfaceSuccess,
    color: vars.color.onSurfaceSuccess,
  },
  blue: {
    backgroundColor: `color-mix(in srgb, ${vars.color.brandBase} 15%, transparent)`,
    color: vars.color.brandDark,
  },
  orange: {
    backgroundColor: "#FFF4E6",
    color: "#944200",
  },
  yellow: {
    backgroundColor: "#FFF9E6",
    color: "#926D00",
  },
  gray: {
    backgroundColor: vars.color.surfaceTertiary,
    color: vars.color.onSurfaceSecondary,
  },
  red: {
    backgroundColor: vars.color.surfaceError,
    color: vars.color.onSurfaceError,
  },
});

export const alert = style({
  display: "flex",
  gap: vars.spacing.sm,
  padding: vars.spacing.sm,
  borderRadius: vars.border.radius.md,
  border: `${vars.border.width.thin} solid transparent`,
});

export const alertVariants = styleVariants({
  teal: {
    backgroundColor: vars.color.surfaceSuccess,
    borderColor: vars.color.onSurfaceSuccess,
    color: vars.color.onSurfaceSuccess,
  },
  blue: {
    backgroundColor: `color-mix(in srgb, ${vars.color.brandBase} 10%, transparent)`,
    borderColor: vars.color.brandBase,
    color: vars.color.brandDark,
  },
  orange: {
    backgroundColor: "#FFF4E6",
    borderColor: "#FF922B",
    color: "#944200",
  },
  yellow: {
    backgroundColor: "#FFF9E6",
    borderColor: "#FFC034",
    color: "#926D00",
  },
  gray: {
    backgroundColor: vars.color.surfaceTertiary,
    borderColor: vars.color.surfaceBorder,
    color: vars.color.onSurfaceSecondary,
  },
  red: {
    backgroundColor: vars.color.surfaceError,
    borderColor: vars.color.onSurfaceError,
    color: vars.color.onSurfaceError,
  },
});

export const alertIcon = style({
  flexShrink: 0,
  marginTop: "2px",
});

export const alertContent = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.xs,
  flex: 1,
});

export const alertTitle = style({
  fontSize: vars.typography.bodySmall.fontSize,
  fontWeight: 600,
  lineHeight: 1.3,
  margin: 0,
});

export const alertMessage = style({
  fontSize: vars.typography.bodySmallest.fontSize,
  lineHeight: 1.4,
  margin: 0,
});

export const alertActions = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.spacing.sm,
  flexWrap: "wrap",
});

export const alertText = style({
  fontSize: vars.typography.bodySmall.fontSize,
  lineHeight: 1.4,
  color: vars.color.onSurfaceSecondary,
});
