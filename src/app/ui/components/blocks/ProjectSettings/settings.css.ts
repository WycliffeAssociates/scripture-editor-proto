import { style } from "@vanilla-extract/css";

import * as selectStyles from "@/app/ui/components/primitives/Select/select.css.ts";
import { mediaQuery } from "@/app/ui/styles/breakpoints.ts";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const panel = style({
  width: "100%",
  height: "100%",
  backgroundColor: vars.color.surfacePrimary,
  color: vars.color.onSurfacePrimary,
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
});

export const shell = style({
  width: "100%",
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  height: "100%",
});

export const headerOuter = style({
  width: "100%",
});

export const contentInner = style({
  width: "100%",
  maxWidth: "60rem",
  marginInline: "auto",
});

export const header = style({
  padding: `${vars.spacing.lg} ${vars.spacing.lg} ${vars.spacing.xs}`,
});

export const title = style({
  fontSize: vars.typography.h3.fontSize,
  lineHeight: vars.typography.h3.lineHeight,
  fontWeight: vars.typography.h3.fontWeight,
});

export const tabsRoot = style({
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  height: "100%",
});

export const tabsListOuter = style({
  width: "100%",
  borderBottom: `1px solid ${vars.color.surfaceBorder}`,
});

export const tabsList = style({
  display: "flex",
  alignItems: "center",
  gap: vars.spacing.xs,
  paddingInline: vars.spacing.lg,
  paddingTop: 0,
});

export const tabsTrigger = style({
  position: "relative",
  border: "none",
  background: "transparent",
  color: vars.color.onSurfaceSecondary,
  minHeight: "3rem",
  paddingInline: vars.spacing.md,
  fontSize: vars.typography.bodySmall.fontSize,
  lineHeight: vars.typography.bodySmall.lineHeight,
  fontWeight: 600,
  cursor: "pointer",
  borderBottom: "3px solid transparent",
  selectors: {
    "&[data-active]": {
      color: vars.color.brandBase,
      borderBottomColor: vars.color.brandBase,
      boxShadow: `inset 0 -1px 0 ${vars.color.brandBase}`,
    },
    "&:hover": {
      color: vars.color.onSurfacePrimary,
    },
  },
});

export const tabsPanel = style({
  minHeight: 0,
  height: "100%",
  overflow: "auto",
  paddingBlock: vars.spacing.sm,
});

export const tabsPanelInner = style({
  width: "100%",
  maxWidth: "60rem",
  marginInline: "auto",
  paddingInline: vars.spacing.lg,
  paddingBottom: vars.spacing.lg,
});

export const section = style({
  display: "flex",
  flexDirection: "column",
});

export const sectionRow = style({
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: vars.spacing.sm,
  alignItems: "center",
  paddingBlock: vars.spacing.md,
  "@media": {
    [mediaQuery.up("md")]: {
      gridTemplateColumns: "minmax(0, 24rem) minmax(18rem, 24rem)",
      gap: vars.spacing.lg,
    },
  },
});

export const rowText = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
});

export const rowTitle = style({
  fontSize: vars.typography.bodyNormal.fontSize,
  lineHeight: vars.typography.bodyNormal.lineHeight,
  fontWeight: 600,
  color: vars.color.onSurfacePrimary,
});

export const rowDescription = style({
  fontSize: vars.typography.bodySmall.fontSize,
  lineHeight: vars.typography.bodySmall.lineHeight,
  color: vars.color.onSurfaceSecondary,
});

export const rowControl = style({
  minWidth: 0,
  width: "100%",
  display: "flex",
  justifyContent: "stretch",
  alignItems: "center",
});

export const rowControlEnd = style([
  rowControl,
  {
    justifyContent: "flex-end",
  },
]);

export const fieldControl = style({
  width: "100%",
  maxWidth: "24rem",
});

export const sliderControl = style({
  width: "100%",
  maxWidth: "24rem",
  display: "grid",
  gridTemplateColumns: "1fr auto",
  alignItems: "center",
  gap: vars.spacing.sm,
});

export const sliderInput = style({
  width: "100%",
  accentColor: vars.color.brandBase,
});

export const sliderOutput = style({
  minWidth: "2.5rem",
  textAlign: "end",
  color: vars.color.onSurfaceSecondary,
  fontVariantNumeric: "tabular-nums",
});

export const footer = style({
  width: "100%",
  borderTop: `1px solid ${vars.color.surfaceBorder}`,
  backgroundColor: vars.color.surfacePrimary,
});

export const footerInner = style({
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: vars.spacing.md,
  width: "100%",
  maxWidth: "60rem",
  marginInline: "auto",
  padding: vars.spacing.lg,
  "@media": {
    [mediaQuery.up("md")]: {
      gridTemplateColumns: "1fr 1fr",
    },
  },
});

export const footerButton = style({
  width: "100%",
});

export const toggleGroup = style({
  width: "24rem",
  maxWidth: "100%",
});

export const selectControl = style({
  width: "100%",
  maxWidth: "24rem",
});

/** The editor-mode picker — same compact sizing as the inline toolbar copy. */
export const modePickerControl = style([
  selectStyles.triggerCompact,
  {
    width: "100%",
    maxWidth: "24rem",
  },
]);

export const cloudProjectComboboxValue = style({
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const cloudProjectComboboxTrigger = style({
  width: "100%",
  maxWidth: "24rem",
  minHeight: "2.25rem",
  border: `1px solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.md,
  backgroundColor: vars.color.surfacePrimary,
  color: vars.color.onSurfacePrimary,
  padding: `0 ${vars.spacing.sm}`,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.spacing.xs,
  cursor: "pointer",
  selectors: {
    "&[data-popup-open]": {
      borderColor: vars.color.brandBase,
    },
    "&:hover": {
      backgroundColor: vars.color.surfaceSecondary,
    },
  },
});

export const cloudProjectComboboxChevron = style({
  flex: "0 0 auto",
  color: vars.color.onSurfaceSecondary,
  fontSize: vars.typography.bodySmall.fontSize,
  lineHeight: 1,
});

export const cloudProjectComboboxPopup = style({
  backgroundColor: vars.color.surfacePrimary,
  borderRadius: vars.border.radius.sm,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  boxShadow: vars.shadow.large,
  padding: "0.125rem",
  minWidth: "24rem",
  maxWidth: "24rem",
  pointerEvents: "auto",
});

export const cloudProjectComboboxHeader = style({
  padding: "0.125rem",
  borderBottom: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
});

export const cloudProjectComboboxInput = style({
  width: "100%",
  minHeight: "1.875rem",
  border: "none",
  outline: "none",
  backgroundColor: "transparent",
  color: vars.color.onSurfacePrimary,
  fontSize: vars.typography.bodySmallest.fontSize,
  lineHeight: vars.typography.bodySmallest.lineHeight,
  padding: `0 ${vars.spacing.xs}`,
});

export const cloudProjectComboboxScrollArea = style({
  maxHeight: "12.5rem",
});

export const cloudProjectComboboxScrollViewport = style({
  maxHeight: "12.5rem",
});

export const cloudProjectComboboxList = style({
  display: "flex",
  flexDirection: "column",
  gap: "1px",
  padding: "0.125rem",
});

export const cloudProjectComboboxItem = style({
  appearance: "none",
  border: "none",
  backgroundColor: "transparent",
  borderRadius: vars.border.radius.sm,
  color: vars.color.onSurfacePrimary,
  fontSize: vars.typography.bodySmallest.fontSize,
  fontWeight: 500,
  textAlign: "left",
  lineHeight: 1.2,
  padding: `0.1875rem ${vars.spacing.xs}`,
  minHeight: "1.375rem",
  cursor: "pointer",
  display: "grid",
  gridTemplateColumns: "0.875rem minmax(0, 1fr)",
  alignItems: "center",
  gap: "0.25rem",
  width: "100%",
  // Highlight with a brand outline on the white surface rather than a filled
  // row, so it reads as "this is where your click lands" (box-shadow keeps the
  // row from shifting on hover).
  boxShadow: "inset 0 0 0 1px transparent",
  selectors: {
    "&:hover": {
      boxShadow: `inset 0 0 0 1px ${vars.color.brandBase}`,
    },
    "&[data-highlighted]": {
      boxShadow: `inset 0 0 0 1px ${vars.color.brandBase}`,
    },
    "&:focus-visible": {
      outline: "none",
      boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
    },
  },
});

export const cloudProjectComboboxItemIndicator = style({
  width: "0.875rem",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: vars.color.brandBase,
});

/** Owner suffix on a project row — muted context, not the primary label. */
export const cloudProjectComboboxItemOwner = style({
  color: vars.color.onSurfaceTertiary,
  fontWeight: 400,
});

export const cloudProjectComboboxEmpty = style({
  padding: `${vars.spacing.sm} ${vars.spacing.xs}`,
  fontSize: vars.typography.bodySmallest.fontSize,
  lineHeight: vars.typography.bodySmallest.lineHeight,
  color: vars.color.onSurfaceSecondary,
});

export const cloudProjectComboboxLinkFooter = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.xs,
  borderTop: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  padding: `${vars.spacing.sm} ${vars.spacing.xs}`,
  fontSize: vars.typography.bodySmallest.fontSize,
  lineHeight: vars.typography.bodySmallest.lineHeight,
  color: vars.color.onSurfaceSecondary,
});

export const switchLabel = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.125rem",
});

export const switchLabelTitle = style({
  fontSize: vars.typography.bodyNormal.fontSize,
  lineHeight: vars.typography.bodyNormal.lineHeight,
  fontWeight: 600,
  color: vars.color.onSurfacePrimary,
});

export const stepperControl = style({
  width: "100%",
  maxWidth: "24rem",
  display: "grid",
  gridTemplateColumns: "2.75rem minmax(0, 1fr) 2.75rem",
  alignItems: "center",
  border: `1px solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.lg,
  backgroundColor: vars.color.surfaceSecondary,
  overflow: "hidden",
});

export const stepperButton = style({
  minHeight: "2.75rem",
  border: "none",
  background: "transparent",
  color: vars.color.onSurfacePrimary,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  selectors: {
    "&:hover": {
      backgroundColor: vars.color.surfaceTertiary,
    },
    "&:disabled": {
      opacity: 0.4,
      cursor: "not-allowed",
    },
  },
});

export const stepperValue = style({
  minHeight: "2.75rem",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  paddingInline: vars.spacing.md,
  fontSize: vars.typography.bodySmall.fontSize,
  lineHeight: vars.typography.bodySmall.lineHeight,
  fontWeight: 600,
  borderInline: `1px solid ${vars.color.surfaceBorder}`,
});

export const sliderValue = style({
  fontSize: vars.typography.bodySmall.fontSize,
  lineHeight: vars.typography.bodySmall.lineHeight,
  fontWeight: 600,
  color: vars.color.onSurfacePrimary,
});

export const buildInfo = style({
  marginTop: vars.spacing.xl,
  paddingTop: vars.spacing.lg,
  borderTop: `1px solid ${vars.color.surfaceBorder}`,
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.xs,
});

export const buildInfoRow = style({
  display: "flex",
  gap: vars.spacing.xs,
  fontSize: vars.typography.bodySmallest.fontSize,
  lineHeight: vars.typography.bodySmallest.lineHeight,
  color: vars.color.onSurfaceSecondary,
});

export const buildInfoLabel = style({
  fontWeight: 600,
});

export const buildInfoValue = style({
  fontFamily: "monospace",
});

// Compact popup for the Settings → Advanced version-switch dropdown.
// Mirrors ReferencePicker's combobox popup proportions: fixed width,
// capped height with internal scroll, smaller text. The default Select
// popup grows to fit all items, which makes the version list (7+
// nightly tags with long sha suffixes) overwhelmingly large.
export const versionSelectPopup = style({
  width: "min(22rem, calc(100vw - 2rem))",
});

export const versionSelectList = style({
  maxHeight: "16rem",
  overflowY: "auto",
  fontSize: vars.typography.bodySmallest.fontSize,
});
