import { style } from "@vanilla-extract/css";

import { vars } from "@/app/ui/styles/designSystem.css.ts";

/**
 * Styles for the SourcePicker — the search-driven catalog table that lets people
 * find and download an existing project from the public data API. Shared by the
 * full-page create surface and the in-app "add a source" modal.
 */
export const root = style({
  display: "grid",
  gap: vars.spacing.lg,
  width: "100%",
});

export const hero = style({
  display: "grid",
  gap: vars.spacing.xs,
  justifyItems: "center",
  textAlign: "center",
});

export const heroTitle = style({
  margin: 0,
  fontSize: vars.typography.h2.fontSize,
  lineHeight: vars.typography.h2.lineHeight,
  fontWeight: 700,
  color: vars.color.onSurfacePrimary,
  letterSpacing: "-0.02em",
});

export const heroSubtitle = style({
  margin: 0,
  fontSize: vars.typography.bodyNormal.fontSize,
  lineHeight: vars.typography.bodyNormal.lineHeight,
  color: vars.color.onSurfaceSecondary,
  maxWidth: "none",
});

export const inlineLink = style({
  border: "none",
  padding: 0,
  background: "transparent",
  color: vars.color.brandBase,
  font: "inherit",
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "underline",
  textUnderlineOffset: "0.15em",
  selectors: {
    "&:hover": { color: vars.color.brandDark },
    "&:focus-visible": {
      outline: "none",
      boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
      borderRadius: vars.border.radius.sm,
    },
  },
});

/* Search bar: input + attached field dropdown inside one rounded pill. */
export const searchRow = style({
  display: "flex",
  justifyContent: "center",
});

export const searchBar = style({
  display: "flex",
  alignItems: "stretch",
  width: "100%",
  maxWidth: "44rem",
  minHeight: "3rem",
  borderRadius: vars.border.radius.lg,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  backgroundColor: vars.color.surfacePrimary,
  boxShadow: vars.shadow.small,
  overflow: "hidden",
  selectors: {
    "&:focus-within": {
      borderColor: vars.color.brandBase,
      boxShadow: `0 0 0 2px ${vars.color.brandBase}`,
    },
  },
});

export const searchInputWrap = style({
  position: "relative",
  flex: "1 1 auto",
  minWidth: 0,
  display: "flex",
  alignItems: "center",
});

export const searchIcon = style({
  position: "absolute",
  left: vars.spacing.md,
  color: vars.color.onSurfaceTertiary,
  pointerEvents: "none",
});

export const searchInput = style({
  width: "100%",
  height: "100%",
  minHeight: "3rem",
  padding: `0 ${vars.spacing.sm} 0 calc(${vars.spacing.xl} + ${vars.spacing.sm})`,
  border: "none",
  background: "transparent",
  color: vars.color.onSurfacePrimary,
  fontSize: vars.typography.bodyNormal.fontSize,
  outline: "none",
  selectors: {
    "&::placeholder": { color: vars.color.onSurfaceTertiary },
  },
});

export const clearButton = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "2rem",
  height: "2rem",
  marginRight: vars.spacing.xs,
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
  },
});

export const fieldDivider = style({
  width: vars.border.width.thin,
  backgroundColor: vars.color.surfaceBorder,
  flexShrink: 0,
});

/* Fixed-width slot pins the field dropdown so its width:100% trigger can't
   expand and crush the search input flexing beside it. */
export const fieldWrap = style({
  flex: "0 0 auto",
  width: "10rem",
  display: "flex",
});

/* Strip the Select primitive's own chrome so it blends into the search pill. */
export const fieldSelect = style({
  border: "none",
  borderRadius: 0,
  backgroundColor: "transparent",
  selectors: {
    "&:focus-visible, &:focus-within": { outline: "none" },
  },
});

/* Results table — a CSS-grid "table" so rows can be virtualized. Header and
   rows share one column template so columns stay aligned. */
const GRID_COLUMNS =
  "minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1.5fr) minmax(0, 2fr) 3.5rem";

/** Fixed row height the virtualizer estimates against (keep in sync with JS). */
export const ROW_HEIGHT = 52;

export const tableWrap = style({
  position: "relative",
  width: "100%",
  maxHeight: "min(38rem, calc(100vh - 18rem))",
  overflow: "auto",
  borderRadius: vars.border.radius.lg,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  backgroundColor: vars.color.surfacePrimary,
});

export const headerRow = style({
  position: "sticky",
  top: 0,
  zIndex: 1,
  display: "grid",
  gridTemplateColumns: GRID_COLUMNS,
  alignItems: "center",
  backgroundColor: vars.color.surfacePrimary,
  borderBottom: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
});

export const headerCell = style({
  padding: `${vars.spacing.sm} ${vars.spacing.md}`,
  textAlign: "left",
  fontSize: vars.typography.bodySmall.fontSize,
  fontWeight: 700,
  color: vars.color.onSurfaceSecondary,
});

export const listInner = style({
  position: "relative",
  width: "100%",
});

export const row = style({
  display: "grid",
  gridTemplateColumns: GRID_COLUMNS,
  alignItems: "center",
  borderBottom: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  selectors: {
    "&:hover": { backgroundColor: vars.color.surfaceSecondary },
  },
});

export const cell = style({
  padding: `${vars.spacing.sm} ${vars.spacing.md}`,
  fontSize: vars.typography.bodySmall.fontSize,
  color: vars.color.onSurfaceSecondary,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const langCell = style([
  cell,
  {
    fontWeight: 700,
    color: vars.color.onSurfacePrimary,
  },
]);

export const actionCell = style([
  cell,
  {
    display: "flex",
    justifyContent: "flex-end",
    overflow: "visible",
  },
]);

export const downloadButton = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "2.25rem",
  height: "2.25rem",
  border: "none",
  borderRadius: vars.border.radius.md,
  backgroundColor: "transparent",
  color: vars.color.brandBase,
  cursor: "pointer",
  selectors: {
    "&:hover:not(:disabled)": {
      backgroundColor: vars.color.brandLight,
      color: vars.color.brandDark,
    },
    "&:disabled": {
      color: vars.color.onSurfaceTertiary,
      cursor: "default",
    },
    "&:focus-visible": {
      outline: "none",
      boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
    },
  },
});

/* Empty / loading / no-results states */
export const stateWrap = style({
  display: "grid",
  gap: vars.spacing.md,
  justifyItems: "center",
  textAlign: "center",
  padding: `${vars.spacing.xl} ${vars.spacing.lg}`,
  color: vars.color.onSurfaceSecondary,
});

export const stateTitle = style({
  margin: 0,
  fontSize: vars.typography.h4.fontSize,
  lineHeight: vars.typography.h4.lineHeight,
  fontWeight: vars.typography.h4.fontWeight,
  color: vars.color.onSurfacePrimary,
});

export const stateText = style({
  margin: 0,
  maxWidth: "44ch",
  fontSize: vars.typography.bodySmall.fontSize,
  lineHeight: vars.typography.bodySmall.lineHeight,
});

export const stateActions = style({
  display: "flex",
  flexWrap: "wrap",
  gap: vars.spacing.sm,
  justifyContent: "center",
});

export const callout = style({
  display: "grid",
  gap: vars.spacing.xs,
  width: "100%",
  maxWidth: "36rem",
  padding: vars.spacing.md,
  borderRadius: vars.border.radius.lg,
  backgroundColor: vars.color.brandLight,
  color: vars.color.brandDarkest,
});

export const calloutTitle = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: vars.spacing.xs,
  margin: 0,
  fontWeight: 700,
  color: vars.color.brandDark,
});

export const calloutText = style({
  margin: 0,
  fontSize: vars.typography.bodySmall.fontSize,
  lineHeight: vars.typography.bodySmall.lineHeight,
});

export const errorState = style({
  padding: vars.spacing.md,
  borderRadius: vars.border.radius.md,
  backgroundColor: vars.color.surfaceError,
  color: vars.color.onSurfaceError,
});

/* Import-from-device disclosure */
export const importPanel = style({
  display: "flex",
  flexWrap: "wrap",
  gap: vars.spacing.sm,
  justifyContent: "center",
});

export const hiddenInput = style({
  position: "absolute",
  opacity: 0,
  pointerEvents: "none",
  width: 1,
  height: 1,
});
