import { style } from "@vanilla-extract/css";

import { vars } from "@/app/ui/styles/designSystem.css.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";

export const row = style({
  display: "flex",
  alignItems: "center",
  gap: vars.spacing.sm,
  paddingBlock: "0.15rem",
});

export const projectLink = style({
  flex: 1,
  display: "block",
  padding: "0.35rem 0.5rem",
  borderRadius: vars.border.radius.md,
  textDecoration: "none",
  color: "inherit",
  selectors: {
    "&:hover": {
      backgroundColor: vars.color.surfaceSecondary,
    },
    "&:focus-visible": {
      outline: `2px solid ${vars.color.brandBase}`,
      outlineOffset: 2,
    },
  },
});

export const projectName = style({
  display: "block",
  fontSize: vars.typography.bodySmall.fontSize,
  fontWeight: 500,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const actionCluster = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.spacing.xs,
});

export const actionIcon = style({
  width: "2rem",
  height: "2rem",
});

export const editRow = style({
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: vars.spacing.sm,
});

export const editInput = style({
  flex: 1,
});

export const nameInput = style({
  width: "100%",
  minWidth: 0,
  height: "2.5rem",
  padding: `0 ${vars.spacing.sm}`,
  borderRadius: vars.border.radius.md,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  backgroundColor: vars.color.surfacePrimary,
  color: vars.color.onSurfacePrimary,
  fontSize: vars.typography.bodySmall.fontSize,
  outline: "none",
  selectors: {
    "&:focus-visible": {
      boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
      borderColor: vars.color.brandBase,
    },
  },
});

export const dialogOverlay = style({
  position: "fixed",
  inset: 0,
  backgroundColor: vars.color.surfaceOverlay,
  display: "grid",
  placeItems: "center",
  padding: vars.spacing.md,
  zIndex: zLayer.floatingPanel,
});

export const dialog = style({
  width: "min(42rem, 100%)",
  borderRadius: vars.border.radius.lg,
  backgroundColor: vars.color.surfacePrimary,
  color: vars.color.onSurfacePrimary,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  boxShadow: vars.shadow.large,
  padding: vars.spacing.lg,
  display: "grid",
  gap: vars.spacing.md,
});

export const dialogTitle = style({
  margin: 0,
  fontSize: vars.typography.h4.fontSize,
  fontWeight: vars.typography.h4.fontWeight,
  lineHeight: vars.typography.h4.lineHeight,
});

export const dialogBody = style({
  margin: 0,
  display: "grid",
  gap: vars.spacing.sm,
  fontSize: vars.typography.bodySmall.fontSize,
  lineHeight: vars.typography.bodySmall.lineHeight,
  color: vars.color.onSurfaceSecondary,
});

export const dialogHint = style({
  display: "block",
  color: vars.color.onSurfaceTertiary,
});

export const dialogActions = style({
  display: "flex",
  justifyContent: "flex-end",
  gap: vars.spacing.sm,
  flexWrap: "wrap",
});

export const deleteDialogTitleId = "delete-project-title";
export const deleteDialogBodyId = "delete-project-body";
