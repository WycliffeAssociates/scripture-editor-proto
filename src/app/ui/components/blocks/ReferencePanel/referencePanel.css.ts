import { keyframes, style } from "@vanilla-extract/css";

import { vars } from "@/app/ui/styles/designSystem.css.ts";

const spinKeyframes = keyframes({
  "0%": { transform: "rotate(0deg)" },
  "100%": { transform: "rotate(360deg)" },
});

export const root = style({
  display: "flex",
  alignItems: "center",
  width: "100%",
});

export const trigger = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.spacing.sm,
  width: "100%",
  minWidth: "12rem",
  minHeight: "2.75rem",
  padding: `0 ${vars.spacing.md}`,
  backgroundColor: vars.color.surfacePrimary,
  color: vars.color.onSurfacePrimary,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.lg,
  boxShadow: vars.shadow.small,
  fontSize: vars.typography.bodySmall.fontSize,
  lineHeight: vars.typography.bodySmall.lineHeight,
  cursor: "pointer",
  transition:
    "border-color 140ms ease, box-shadow 140ms ease, background-color 140ms ease",
  selectors: {
    "&:hover": {
      borderColor: vars.color.brandBase,
    },
    "&:focus-visible": {
      outline: "none",
      boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
    },
  },
});

export const triggerLabel = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.spacing.xs,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  textAlign: "left",
});

export const triggerChevron = style({
  flex: "0 0 auto",
  color: vars.color.onSurfaceSecondary,
});

export const popup = style({
  display: "flex",
  flexDirection: "column",
  backgroundColor: vars.color.surfacePrimary,
  borderRadius: vars.border.radius.lg,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  boxShadow: vars.shadow.large,
  width: "min(22rem, calc(100vw - 2rem))",
  maxHeight: "min(35.5rem, calc(100vh - 6rem))",
  overflow: "hidden",
  pointerEvents: "auto",
});

export const header = style({
  position: "relative",
  display: "flex",
  alignItems: "center",
  minHeight: "2.75rem",
  padding: `0 ${vars.spacing.md}`,
  borderBottom: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
});

export const searchIcon = style({
  position: "absolute",
  right: vars.spacing.lg,
  color: vars.color.onSurfacePrimary,
  pointerEvents: "none",
});

export const searchInput = style({
  width: "100%",
  minHeight: "2.75rem",
  border: "none",
  borderRadius: 0,
  outline: "none",
  backgroundColor: "transparent",
  color: vars.color.onSurfacePrimary,
  fontSize: vars.typography.bodySmall.fontSize,
  lineHeight: vars.typography.bodySmall.lineHeight,
  fontStyle: "italic",
  padding: `0 calc(${vars.spacing.xl} + ${vars.spacing.sm}) 0 0`,
  selectors: {
    "&::placeholder": { color: vars.color.onSurfaceTertiary },
    "&:focus-visible": {
      outline: "none",
    },
  },
});

export const scroll = style({
  overflowY: "auto",
  padding: `${vars.spacing.md} 0`,
});

export const sectionLabel = style({
  fontSize: vars.typography.bodySmall.fontSize,
  fontWeight: 500,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: vars.color.onSurfaceTertiary,
  padding: `${vars.spacing.xs} ${vars.spacing.md} ${vars.spacing.sm}`,
});

export const languageHeader = style({
  fontSize: vars.typography.bodySmall.fontSize,
  fontWeight: 700,
  color: vars.color.onSurfacePrimary,
  padding: `${vars.spacing.sm} ${vars.spacing.md} 0.125rem`,
});

export const languageToggle = style({
  appearance: "none",
  border: "none",
  backgroundColor: "transparent",
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.spacing.xs,
  fontSize: vars.typography.bodySmall.fontSize,
  fontWeight: 700,
  color: vars.color.onSurfacePrimary,
  textAlign: "left",
  padding: `${vars.spacing.sm} ${vars.spacing.md}`,
  cursor: "pointer",
  selectors: {
    "&:hover": { backgroundColor: vars.color.brandLight },
  },
});

export const languageToggleChevron = style({
  flex: "0 0 auto",
  color: vars.color.onSurfaceSecondary,
  transition: "transform 120ms ease",
});

export const languageToggleChevronOpen = style({
  transform: "rotate(90deg)",
});

export const row = style({
  appearance: "none",
  border: "none",
  backgroundColor: "transparent",
  borderRadius: 0,
  color: vars.color.onSurfacePrimary,
  fontSize: vars.typography.bodySmall.fontSize,
  fontWeight: 500,
  textAlign: "left",
  lineHeight: 1.2,
  padding: `${vars.spacing.sm} ${vars.spacing.md}`,
  minHeight: "2.5rem",
  cursor: "pointer",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  gap: vars.spacing.xs,
  width: "100%",
  position: "relative",
  selectors: {
    "&:hover": { backgroundColor: vars.color.brandLight },
  },
});

export const rowIndent = style({
  paddingInlineStart: `calc(${vars.spacing.md} * 2)`,
});

export const catalogRow = style({
  cursor: "default",
  selectors: {
    "&:hover": { backgroundColor: "transparent" },
  },
});

export const rowDisabled = style({
  cursor: "default",
  color: vars.color.onSurfaceSecondary,
  selectors: {
    "&:hover": { backgroundColor: "transparent" },
  },
});

export const rowIndicator = style({
  position: "absolute",
  left: `calc(${vars.spacing.md} + (${vars.spacing.md} - 0.875rem) / 2)`,
  width: "0.875rem",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: vars.color.brandBase,
});

export const rowLabel = style({
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const rowTag = style({
  flex: "0 0 auto",
  fontSize: "0.625rem",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  color: vars.color.onSurfaceSecondary,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.sm,
  padding: "0 0.25rem",
});

export const rowTrailing = style({
  flex: "0 0 auto",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.25rem",
  color: vars.color.onSurfaceSecondary,
});

export const downloadButton = style({
  minHeight: "2rem",
  width: "2rem",
  padding: 0,
  borderColor: "transparent",
  backgroundColor: "transparent",
  color: vars.color.brandBase,
  borderRadius: vars.border.radius.md,
  boxShadow: "none",
  selectors: {
    '&[data-state="connected"]': {
      borderColor: "transparent",
      backgroundColor: "transparent",
      color: vars.color.brandBase,
    },
    '&[data-state="connected"]:hover': {
      borderColor: "transparent",
      backgroundColor: "transparent",
      color: vars.color.brandDark,
      boxShadow: "none",
      transform: "none",
    },
  },
});

export const empty = style({
  padding: `${vars.spacing.sm} ${vars.spacing.lg}`,
  fontSize: vars.typography.bodySmall.fontSize,
  color: vars.color.onSurfaceSecondary,
});

export const spin = style({
  animation: `${spinKeyframes} 0.9s linear infinite`,
});
