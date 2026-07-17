import { style } from "@vanilla-extract/css";

import { vars } from "@/app/ui/styles/designSystem.css.ts";

// Outer shell: header row + body. The seam border tiles with the editor when
// docked (mirrors the Find panel), so it lives on the shell, not the grid.
export const stetShell = style({
  display: "grid",
  gridTemplateRows: "auto 1fr",
  width: "100%",
  height: "100%",
  minHeight: 0,
  backgroundColor: vars.color.surfacePrimary,
  borderInlineEnd: `1px solid ${vars.color.surfaceBorder}`,
});

export const stetPanelHeader = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.spacing.sm,
  padding: `${vars.spacing.sm} ${vars.spacing.md}`,
  borderBlockEnd: `1px solid ${vars.color.surfaceBorder}`,
});

export const stetTitle = style({
  fontWeight: 700,
  color: vars.color.onSurfacePrimary,
});

export const stetHeaderActions = style({
  display: "flex",
  alignItems: "center",
  gap: vars.spacing.xs,
});

export const stetHeaderButton = style({
  padding: `${vars.spacing.xs} ${vars.spacing.sm}`,
  border: `1px solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.sm,
  backgroundColor: "transparent",
  color: vars.color.onSurfacePrimary,
  cursor: "pointer",
  fontSize: vars.typography.bodySmall.fontSize,
  selectors: {
    "&:hover": { backgroundColor: vars.color.surfaceSecondary },
  },
});

// Full-overlay body: term rail on the inline-start edge, selected-term detail
// + results filling the rest. Logical properties so RTL mirrors correctly.
export const stetPanel = style({
  display: "grid",
  gridTemplateColumns: "minmax(12rem, 16rem) minmax(0, 1fr)",
  width: "100%",
  height: "100%",
  minWidth: 0,
  minHeight: 0,
  backgroundColor: vars.color.surfacePrimary,
});

export const stetTermRail = style({
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  borderInlineEnd: `1px solid ${vars.color.surfaceBorder}`,
  padding: vars.spacing.sm,
  gap: vars.spacing.sm,
});

export const stetFilterInput = style({
  width: "100%",
  boxSizing: "border-box",
  padding: `${vars.spacing.xs} ${vars.spacing.sm}`,
  border: `1px solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.md,
  backgroundColor: vars.color.surfacePrimary,
  color: vars.color.onSurfacePrimary,
  fontSize: vars.typography.bodySmall.fontSize,
});

export const stetTermList = style({
  listStyle: "none",
  margin: 0,
  padding: 0,
  overflowY: "auto",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  gap: "0.125rem",
});

export const stetTermButton = style({
  display: "block",
  width: "100%",
  textAlign: "start",
  padding: `${vars.spacing.xs} ${vars.spacing.sm}`,
  border: "none",
  borderRadius: vars.border.radius.sm,
  backgroundColor: "transparent",
  color: vars.color.onSurfacePrimary,
  fontSize: vars.typography.bodySmall.fontSize,
  cursor: "pointer",
  selectors: {
    "&:hover": { backgroundColor: vars.color.surfaceSecondary },
  },
});

export const stetTermButtonActive = style({
  backgroundColor: vars.toggleGroup.itemSelectedSurface,
  color: vars.color.brandBase,
  fontWeight: 700,
});

// Compact layout (docked track or small screen): the rail collapses to a
// combobox above the detail so verse text and the editor stay usable.
export const stetCompact = style({
  display: "grid",
  gridTemplateRows: "auto 1fr",
  width: "100%",
  height: "100%",
  minHeight: 0,
});

export const stetComboboxBar = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.xs,
  padding: vars.spacing.sm,
  borderBlockEnd: `1px solid ${vars.color.surfaceBorder}`,
});

export const stetCombobox = style({
  width: "100%",
  boxSizing: "border-box",
  padding: `${vars.spacing.xs} ${vars.spacing.sm}`,
  border: `1px solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.md,
  backgroundColor: vars.color.surfacePrimary,
  color: vars.color.onSurfacePrimary,
  fontSize: vars.typography.bodySmall.fontSize,
});

export const stetEmptyTerms = style({
  color: vars.color.onSurfaceSecondary,
  fontSize: vars.typography.bodySmall.fontSize,
  padding: vars.spacing.sm,
});

export const stetContent = style({
  display: "grid",
  gridTemplateRows: "auto 1fr",
  minWidth: 0,
  minHeight: 0,
});

export const stetHeader = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.xs,
  padding: vars.spacing.md,
  borderBlockEnd: `1px solid ${vars.color.surfaceBorder}`,
});

export const stetHeaderRow = style({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: vars.spacing.sm,
});

export const stetTermHeading = style({
  margin: 0,
  fontSize: vars.typography.bodyNormal.fontSize,
  fontWeight: 700,
  color: vars.color.onSurfacePrimary,
});

export const stetReferenceName = style({
  fontSize: vars.typography.bodySmallest.fontSize,
  color: vars.color.onSurfaceSecondary,
});

export const stetCoverage = style({
  fontSize: vars.typography.bodySmall.fontSize,
  color: vars.color.onSurfaceSecondary,
});

export const stetDefinitionParagraph = style({
  margin: 0,
  fontSize: vars.typography.bodySmall.fontSize,
  color: vars.color.onSurfacePrimary,
  lineHeight: 1.5,
});

export const stetExhaustiveToggle = style({
  alignSelf: "flex-start",
  padding: `${vars.spacing.xs} ${vars.spacing.sm}`,
  border: `1px solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.sm,
  backgroundColor: "transparent",
  color: vars.color.brandBase,
  fontSize: vars.typography.bodySmallest.fontSize,
  cursor: "pointer",
  selectors: {
    "&:hover": { backgroundColor: vars.color.surfaceSecondary },
  },
});

export const stetStateBox = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: vars.spacing.sm,
  height: "100%",
  padding: vars.spacing.lg,
  textAlign: "center",
  color: vars.color.onSurfaceSecondary,
  fontSize: vars.typography.bodySmall.fontSize,
});

export const stetRetryButton = style({
  padding: `${vars.spacing.xs} ${vars.spacing.md}`,
  border: `1px solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.sm,
  backgroundColor: "transparent",
  color: vars.color.onSurfacePrimary,
  cursor: "pointer",
  selectors: {
    "&:hover": { backgroundColor: vars.color.surfaceSecondary },
  },
});
