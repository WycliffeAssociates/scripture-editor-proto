import { style } from "@vanilla-extract/css";

import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const shell = style({
  display: "grid",
  gap: vars.spacing.md,
  padding: vars.spacing.lg,
  borderRadius: vars.border.radius.lg,
  backgroundColor: vars.color.surfacePrimary,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  boxShadow: vars.shadow.small,
});

export const header = style({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: vars.spacing.lg,
  flexWrap: "wrap",
});

export const headerCopy = style({
  display: "grid",
  gap: vars.spacing.xs,
  minWidth: 0,
});

export const title = style({
  margin: 0,
  fontSize: vars.typography.h4.fontSize,
  lineHeight: vars.typography.h4.lineHeight,
  fontWeight: vars.typography.h4.fontWeight,
});

export const description = style({
  margin: 0,
  fontSize: vars.typography.bodySmall.fontSize,
  lineHeight: vars.typography.bodySmall.lineHeight,
  color: vars.color.onSurfaceSecondary,
  maxWidth: "60ch",
});

export const sourceHint = style({
  margin: 0,
  fontSize: vars.typography.bodySmallest.fontSize,
  lineHeight: vars.typography.bodySmall.lineHeight,
  color: vars.color.onSurfaceTertiary,
  maxWidth: "72ch",
});

export const steps = style({
  display: "flex",
  flexWrap: "wrap",
  gap: vars.spacing.xs,
  marginTop: vars.spacing.xs,
});

export const step = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.spacing.xs,
  minHeight: "1.75rem",
  padding: `0 ${vars.spacing.sm}`,
  borderRadius: vars.border.radius.full,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  backgroundColor: vars.color.surfaceSecondary,
  color: vars.color.onSurfaceSecondary,
  fontSize: vars.typography.bodySmallest.fontSize,
  fontWeight: 600,
});

export const stepIndex = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "1.25rem",
  height: "1.25rem",
  borderRadius: vars.border.radius.full,
  backgroundColor: vars.color.brandLight,
  color: vars.color.brandDarkest,
  fontWeight: 700,
});

export const headerControls = style({
  display: "grid",
  gap: vars.spacing.sm,
  justifyItems: "stretch",
  minWidth: "min(100%, 40rem)",
  "@media": {
    "screen and (max-width: 720px)": {
      minWidth: "100%",
    },
  },
});

export const sourceToggle = style({
  width: "100%",
});

export const actionButtons = style({
  display: "flex",
  gap: vars.spacing.sm,
  flexWrap: "wrap",
  justifyContent: "flex-end",
  "@media": {
    "screen and (max-width: 720px)": {
      justifyContent: "flex-start",
    },
  },
});

export const hiddenInput = style({
  position: "absolute",
  opacity: 0,
  pointerEvents: "none",
  width: 1,
  height: 1,
});

export const toolbar = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: vars.spacing.sm,
  alignItems: "center",
  "@media": {
    "screen and (max-width: 720px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
});

export const searchField = style({
  position: "relative",
  minWidth: 0,
});

export const searchIcon = style({
  position: "absolute",
  top: "50%",
  left: vars.spacing.sm,
  transform: "translateY(-50%)",
  color: vars.color.onSurfaceTertiary,
  pointerEvents: "none",
});

export const searchInput = style({
  width: "100%",
  minHeight: "2.75rem",
  padding: `0 calc(${vars.spacing.xl} + ${vars.spacing.md}) 0 calc(${vars.spacing.xl} + ${vars.spacing.sm})`,
  borderRadius: vars.border.radius.lg,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  backgroundColor: vars.color.surfaceSecondary,
  color: vars.color.onSurfacePrimary,
  fontSize: vars.typography.bodySmall.fontSize,
  outline: "none",
  selectors: {
    "&::placeholder": {
      color: vars.color.onSurfaceTertiary,
    },
    "&:focus-visible": {
      borderColor: vars.color.brandBase,
      boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
    },
  },
});

export const clearButton = style({
  position: "absolute",
  top: "50%",
  right: vars.spacing.xs,
  transform: "translateY(-50%)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "2rem",
  height: "2rem",
  border: "none",
  borderRadius: vars.border.radius.md,
  backgroundColor: "transparent",
  color: vars.color.onSurfaceTertiary,
  cursor: "pointer",
  selectors: {
    "&:hover": {
      backgroundColor: vars.color.surfaceTertiary,
      color: vars.color.onSurfacePrimary,
    },
    "&:focus-visible": {
      outline: "none",
      boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
    },
  },
});

export const toolbarActions = style({
  display: "flex",
  flexWrap: "wrap",
  gap: vars.spacing.sm,
  justifyContent: "flex-end",
  alignItems: "center",
  "@media": {
    "screen and (max-width: 720px)": {
      justifyContent: "flex-start",
    },
  },
});

export const checkboxPill = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.spacing.xs,
  minHeight: "2.75rem",
  padding: `0 ${vars.spacing.md}`,
  borderRadius: vars.border.radius.lg,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  backgroundColor: vars.color.surfaceSecondary,
  color: vars.color.onSurfaceSecondary,
  fontSize: vars.typography.bodySmall.fontSize,
  fontWeight: 600,
  userSelect: "none",
});

export const checkbox = style({
  margin: 0,
  width: "1rem",
  height: "1rem",
  accentColor: vars.color.brandBase,
});

export const errorState = style({
  padding: vars.spacing.md,
  borderRadius: vars.border.radius.md,
  backgroundColor: vars.color.surfaceError,
  color: vars.color.onSurfaceError,
});

export const tableWrap = style({
  width: "100%",
  maxHeight: "min(34rem, calc(100vh - 18rem))",
  overflow: "auto",
  borderRadius: vars.border.radius.lg,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
});

export const table = style({
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: "60rem",
  backgroundColor: vars.color.surfacePrimary,
});

export const thead = style({
  backgroundColor: vars.color.surfaceSecondary,
});

export const tbody = style({});

export const th = style({
  position: "sticky",
  top: 0,
  zIndex: 1,
  padding: `${vars.spacing.sm} ${vars.spacing.md}`,
  textAlign: "left",
  fontSize: vars.typography.bodySmall.fontSize,
  fontWeight: 700,
  color: vars.color.onSurfaceSecondary,
  backgroundColor: vars.color.surfaceSecondary,
  borderBottom: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
});

export const thInner = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.spacing.sm,
});

export const thDivider = style({
  borderRight: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
});

export const tbodyRow = style({
  selectors: {
    "&:hover": {
      backgroundColor: vars.color.surfaceSecondary,
    },
  },
});

export const td = style({
  padding: vars.spacing.md,
  borderBottom: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  verticalAlign: "top",
});

export const emptyState = style({
  display: "grid",
  gap: vars.spacing.sm,
  padding: vars.spacing.lg,
  color: vars.color.onSurfaceSecondary,
});

export const loginPanel = style({
  display: "grid",
  gap: vars.spacing.md,
});

export const loginCopy = style({
  margin: 0,
  color: vars.color.onSurfaceSecondary,
  fontSize: vars.typography.bodySmall.fontSize,
  lineHeight: vars.typography.bodySmall.lineHeight,
});

export const loginGrid = style({
  display: "grid",
  gap: vars.spacing.sm,
  gridTemplateColumns: "repeat(3, minmax(0, 1fr)) auto",
  alignItems: "end",
  "@media": {
    "screen and (max-width: 960px)": {
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    },
    "screen and (max-width: 720px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
});

export const loginField = style({
  display: "grid",
  gap: vars.spacing.xs,
});

export const loginLabel = style({
  fontSize: vars.typography.bodySmallest.fontSize,
  fontWeight: 700,
  color: vars.color.onSurfaceSecondary,
});

export const loginInput = style({
  width: "100%",
  minHeight: "2.75rem",
  padding: `0 ${vars.spacing.md}`,
  borderRadius: vars.border.radius.md,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  backgroundColor: vars.color.surfacePrimary,
  color: vars.color.onSurfacePrimary,
  fontSize: vars.typography.bodySmall.fontSize,
  outline: "none",
  selectors: {
    "&:focus-visible": {
      borderColor: vars.color.brandBase,
      boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
    },
  },
});

export const loginActions = style({
  display: "flex",
  justifyContent: "flex-end",
});

export const projectCell = style({
  display: "block",
  fontWeight: 700,
  color: vars.color.onSurfacePrimary,
});

export const sourceBadge = style({
  display: "inline-flex",
  alignItems: "center",
  minHeight: "1.5rem",
  padding: `0 ${vars.spacing.sm}`,
  borderRadius: vars.border.radius.full,
  backgroundColor: vars.color.surfaceTertiary,
  color: vars.color.onSurfaceSecondary,
  fontSize: vars.typography.bodySmallest.fontSize,
  fontWeight: 700,
});

export const mutedCell = style({
  color: vars.color.onSurfaceSecondary,
  fontSize: vars.typography.bodySmall.fontSize,
});

export const footerActions = style({
  display: "flex",
  justifyContent: "flex-end",
});
