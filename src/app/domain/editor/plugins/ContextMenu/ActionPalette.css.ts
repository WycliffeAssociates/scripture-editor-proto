import { style } from "@vanilla-extract/css";

import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const container = style({
  width: "30rem",
  maxWidth: "95vw",
  display: "flex",
  flexDirection: "column",
  backgroundColor: vars.color.surfacePrimary,
  borderRadius: vars.border.radius.lg,
  boxShadow: vars.shadow.large,
  overflow: "hidden",
  border: `1px solid ${vars.color.surfaceBorder}`,
  "@media": {
    "screen and (max-width: 480px)": {
      width: "95vw",
    },
  },
});

export const searchInput = style({
  border: "none",
  borderRadius: 0,
  backgroundColor: "transparent",
  width: "100%",
  padding: `${vars.spacing.md} ${vars.spacing.md}`,
  fontSize: vars.typography.bodySmall.fontSize,
  lineHeight: vars.typography.bodySmall.lineHeight,
  color: vars.color.onSurfacePrimary,
  selectors: {
    "&:focus": {
      outline: "none",
    },
    "&::placeholder": {
      color: vars.color.onSurfaceTertiary,
    },
  },
});

export const header = style({
  padding: `${vars.spacing.xs} ${vars.spacing.sm}`,
  borderBottom: `1px solid ${vars.color.surfaceBorder}`,
  backgroundColor: "transparent",
  display: "flex",
  alignItems: "center",
  gap: vars.spacing.sm,
});

export const scrollArea = style({
  maxHeight: "25rem",
});

export const scrollViewport = style({
  maxHeight: "25rem",
});

export const list = style({
  paddingBlock: vars.spacing.xs,
});

export const item = style({
  padding: `${vars.spacing.sm} ${vars.spacing.md}`,
  margin: `${vars.spacing.xs} ${vars.spacing.sm}`,
  borderRadius: vars.border.radius.md,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: vars.spacing.sm,
  transition: "all 0.1s ease",
  color: vars.color.onSurfacePrimary,
  selectors: {
    "&[data-highlighted], &[data-selected]": {
      backgroundColor: vars.color.brandBase,
      color: vars.color.onSurfaceInvert,
    },
    "&:hover:not([data-highlighted]):not([data-selected])": {
      backgroundColor: vars.color.surfaceSecondary,
    },
    "&[data-disabled]": {
      opacity: 0.45,
      cursor: "not-allowed",
    },
  },
});

export const categoryHeader = style({
  padding: `${vars.spacing.sm} ${vars.spacing.md} ${vars.spacing.xs}`,
  fontSize: vars.typography.bodySmallest.fontSize,
  fontWeight: 700,
  textTransform: "uppercase",
  color: vars.color.onSurfaceTertiary,
  letterSpacing: "0.03125rem",
});

export const pillContainer = style({
  padding: vars.spacing.sm,
  display: "flex",
  alignItems: "center",
  gap: vars.spacing.xs,
  borderBottom: `1px solid ${vars.color.surfaceBorder}`,
});

export const stepPill = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.spacing.xs,
  minHeight: "2rem",
  paddingInline: vars.spacing.sm,
  borderRadius: vars.border.radius.full,
  border: `1px solid ${vars.color.surfaceBorder}`,
  backgroundColor: vars.color.surfaceSecondary,
  color: vars.color.onSurfacePrimary,
  fontSize: vars.typography.bodySmall.fontSize,
});

export const stepPillButton = style({
  border: "none",
  background: "transparent",
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: vars.color.onSurfaceSecondary,
  cursor: "pointer",
});

export const optionLabel = style({
  fontSize: vars.typography.bodySmall.fontSize,
  lineHeight: vars.typography.bodySmall.lineHeight,
});

export const emptyState = style({
  padding: vars.spacing.lg,
  color: vars.color.onSurfaceTertiary,
  fontSize: vars.typography.bodySmall.fontSize,
  textAlign: "center",
});

export const itemContent = style({
  display: "flex",
  alignItems: "center",
  gap: vars.spacing.sm,
});

export const itemTextBlock = style({
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: "0.125rem",
});

export const itemMeta = style({
  fontSize: vars.typography.bodySmallest.fontSize,
  lineHeight: vars.typography.bodySmallest.lineHeight,
  color: vars.color.onSurfaceTertiary,
  selectors: {
    [`${item}[data-highlighted] &, ${item}[data-selected] &`]: {
      color: vars.color.onSurfaceInvert,
      opacity: 0.8,
    },
  },
});
