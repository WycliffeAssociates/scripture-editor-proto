import { globalStyle, keyframes, style } from "@vanilla-extract/css";

import { vars } from "@/app/ui/styles/designSystem.css.ts";

const controlRibbonHeight = "2.25rem";

// Main panel container
export const searchPanel = style({
  display: "grid",
  gridTemplateRows: "auto 1fr",
  // Constrain the single column to the panel width so wide controls/results
  // can't push it past the docked overlay onto the editor.
  gridTemplateColumns: "minmax(0, 1fr)",
  width: "100%",
  height: "100%",
  minWidth: 0,
  minHeight: 0,
  backgroundColor: vars.color.surfacePrimary,
  paddingTop: vars.spacing.md,
  gap: vars.spacing.lg,
});

export const searchPopoverDropdown = style({
  width: "min(32rem, calc(100vw - 1rem))",
  maxWidth: "100%",
});

export const searchPopoverHeader = style({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "stretch",
  gap: vars.spacing.sm,
  padding: vars.spacing.sm,
  borderBottom: `1px solid ${vars.color.surfaceBorder}`,
  backgroundColor: vars.color.surfaceSecondary,
});

export const searchPopoverHeaderInfo = style({
  display: "grid",
  gap: "0.125rem",
  flex: 1,
  minWidth: 0,
  textAlign: "left",
  background: "transparent",
  border: "none",
  padding: 0,
  color: vars.color.onSurfacePrimary,
});

export const searchPopoverDragHandle = style({
  cursor: "grab",
});

export const searchPopoverDragging = style({
  cursor: "grabbing",
});

export const searchPopoverGripIcon = style({
  color: vars.color.onSurfaceTertiary,
});

export const searchPopoverTitle = style({
  fontSize: vars.typography.bodySmall.fontSize,
  fontWeight: 700,
  color: vars.color.onSurfacePrimary,
});

export const searchPopoverHelpText = style({
  fontSize: vars.typography.bodySmallest.fontSize,
  color: vars.color.onSurfaceSecondary,
});

export const searchPopoverHeaderActions = style({
  display: "flex",
  gap: vars.spacing.xs,
  alignItems: "flex-start",
});

export const searchPopoverAction = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "1.75rem",
  height: "1.75rem",
  borderRadius: vars.border.radius.sm,
  border: "none",
  backgroundColor: "transparent",
  color: vars.color.onSurfaceSecondary,
  cursor: "pointer",
  selectors: {
    "&:hover": {
      backgroundColor: vars.color.surfacePrimary,
      color: vars.color.onSurfacePrimary,
    },
  },
});

export const searchPopoverBody = style({
  position: "relative",
  padding: vars.spacing.sm,
  paddingBottom: `calc(${vars.spacing.sm} + 1.25rem)`,
  backgroundColor: vars.color.surfacePrimary,
});

export const searchPopoverResizeHandle = style({
  position: "absolute",
  right: vars.spacing.sm,
  bottom: vars.spacing.sm,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "1.25rem",
  height: "1.25rem",
  borderRadius: vars.border.radius.sm,
  border: "none",
  backgroundColor: vars.color.surfaceSecondary,
  color: vars.color.onSurfaceSecondary,
  cursor: "nwse-resize",
});

export const searchPopoverResizeHandleActive = style({
  backgroundColor: vars.color.surfaceTertiary,
  color: vars.color.onSurfacePrimary,
});

export const searchPopoverResizeIcon = style({
  pointerEvents: "none",
});

// Header
export const searchPanelHeader = style({
  flexShrink: 0,
  paddingInline: vars.spacing.lg,
  borderBottom: "none",
  backgroundColor: "transparent",
});

export const searchPanelHeaderTop = style({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: vars.spacing.md,
});

// Trailing cluster: dock toggle + close button.
export const searchPanelHeaderActions = style({
  display: "flex",
  alignItems: "center",
  gap: vars.spacing.sm,
});

export const searchPanelDockToggle = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "2.25rem",
  height: "2.25rem",
  border: `1px solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.sm,
  backgroundColor: vars.color.surfacePrimary,
  color: vars.color.onSurfaceSecondary,
  cursor: "pointer",
  transition: "background-color 0.15s ease, border-color 0.15s ease",
  selectors: {
    "&:hover": {
      backgroundColor: vars.color.surfaceSecondary,
      borderColor: vars.color.brandBase,
      color: vars.color.brandBase,
    },
  },
});

export const searchPanelTitle = style({
  fontSize: vars.typography.h5.fontSize,
  fontWeight: 600,
  color: vars.color.onSurfacePrimary,
});

export const searchPanelClose = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "5rem",
  height: "2.25rem",
  border: `1px solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.sm,
  backgroundColor: vars.color.surfacePrimary,
  color: vars.color.onSurfacePrimary,
  fontSize: vars.typography.bodySmall.fontSize,
  fontWeight: 600,
  padding: `0 ${vars.spacing.sm}`,
  cursor: "pointer",
  transition: "background-color 0.15s ease, border-color 0.15s ease",
  selectors: {
    "&:hover": {
      backgroundColor: vars.color.surfaceSecondary,
      borderColor: vars.color.brandBase,
    },
  },
});

// Controls
export const searchControls = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.md,
});

export const searchInputRow = style({
  display: "flex",
  gap: vars.spacing.sm,
  alignItems: "center",
});

export const searchInputWrapper = style({
  position: "relative",
  flex: 1,
  display: "flex",
  alignItems: "center",
  minHeight: "4rem",
});

export const searchInputIcon = style({
  position: "absolute",
  left: vars.spacing.sm,
  color: vars.color.onSurfaceTertiary,
  pointerEvents: "none",
});

export const searchInput = style({
  width: "100%",
  height: "100%",
  padding: `${vars.spacing.sm} ${vars.spacing.md} ${vars.spacing.sm} calc(${vars.spacing.md} + ${vars.spacing.md} + 16px)`,
  fontSize: vars.typography.bodyNormal.fontSize,
  border: `1px solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.md,
  backgroundColor: vars.color.surfacePrimary,
  color: vars.color.onSurfacePrimary,
  outline: "none",
  selectors: {
    "&:focus": {
      borderColor: vars.color.brandBase,
    },
  },
});

export const searchRunButton = style({
  position: "absolute",
  right: vars.spacing.sm,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "2rem",
  height: "2rem",
  border: "none",
  borderRadius: vars.border.radius.sm,
  backgroundColor: vars.button.primary.surface,
  color: vars.button.primary.onSurface,
  cursor: "pointer",
  selectors: {
    "&:hover": {
      backgroundColor: vars.button.primary.surfaceHover,
    },
  },
});

export const searchNavButtons = style({
  display: "flex",
  gap: vars.spacing.sm,
});

export const searchNavButton = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "2.25rem",
  height: "2.25rem",
  border: `1px solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.sm,
  backgroundColor: vars.color.surfacePrimary,
  color: vars.color.onSurfaceSecondary,
  cursor: "pointer",
  selectors: {
    "&:hover:not(:disabled)": {
      backgroundColor: vars.color.surfaceSecondary,
    },
    "&:disabled": {
      opacity: 0.5,
      cursor: "not-allowed",
    },
  },
});

export const searchOptionsRow = style({
  display: "flex",
  justifyContent: "flex-start",
  alignItems: "center",
  gap: vars.spacing.xs,
  flexWrap: "nowrap",
  minWidth: 0,
});

export const searchStats = style({
  display: "inline-flex",
  alignItems: "center",
  height: controlRibbonHeight,
  fontSize: vars.typography.bodySmallest.fontSize,
  color: vars.color.onSurfaceSecondary,
  fontWeight: 500,
  marginRight: vars.spacing.xs,
  whiteSpace: "nowrap",
  flexShrink: 0,
});

export const searchToggles = style({
  display: "flex",
  alignItems: "center",
  gap: vars.spacing.xs,
  flexWrap: "nowrap",
  minWidth: 0,
});

export const searchInlineControls = style({
  display: "inline-flex",
  alignItems: "flex-end",
  gap: vars.spacing.xs,
  flexWrap: "nowrap",
  minWidth: 0,
  marginLeft: "auto",
  flexShrink: 0,
});

export const toggleButton = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: controlRibbonHeight,
  height: controlRibbonHeight,
  padding: `0 ${vars.spacing.xs}`,
  gap: "0.2rem",
  border: `1px solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.md,
  backgroundColor: vars.color.surfacePrimary,
  color: vars.color.onSurfaceSecondary,
  cursor: "pointer",
  transition: "all 0.15s ease",
  fontSize: vars.typography.bodySmallest.fontSize,
  fontWeight: 500,
  lineHeight: 1,
  whiteSpace: "nowrap",
  boxSizing: "border-box",
  selectors: {
    "&:hover:not(:disabled)": {
      backgroundColor: vars.color.surfaceSecondary,
    },
    "&:disabled": {
      opacity: 0.5,
      cursor: "not-allowed",
    },
  },
});

export const toggleButtonActive = style({
  // Checked reads as a tinted segment with brand text, not a solid blue fill —
  // the filled checkbox carries the "on" signal.
  backgroundColor: vars.color.brandLight,
  borderColor: vars.color.brandBase,
  color: vars.color.brandBase,
  selectors: {
    "&:hover:not(:disabled)": {
      backgroundColor: vars.color.brandLight,
    },
  },
});

/** Trailing checkbox glyph — an outlined square that fills brand when checked. */
export const toggleCheckbox = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: "0.875rem",
  height: "0.875rem",
  borderRadius: "0.1875rem",
  border: `1px solid ${vars.color.surfaceBorder}`,
  backgroundColor: vars.color.surfacePrimary,
  color: "transparent",
});

export const toggleCheckboxChecked = style({
  borderColor: vars.color.brandBase,
  backgroundColor: vars.color.brandBase,
  color: vars.button.primary.onSurface,
});

export const searchReplaceRow = style({
  display: "flex",
  gap: vars.spacing.xs,
  alignItems: "center",
  flexWrap: "nowrap",
  minWidth: 0,
  flexShrink: 0,
});

export const searchModeRow = style({
  display: "flex",
  alignItems: "flex-end",
  gap: vars.spacing.xs,
  flexWrap: "nowrap",
  minWidth: 0,
});

export const searchModeField = style({
  position: "relative",
  display: "inline-flex",
  alignItems: "flex-end",
  minWidth: 0,
});

export const searchModeFieldLabel = style({
  fontSize: "0.65rem",
  lineHeight: 1,
  fontWeight: 600,
  color: vars.color.onSurfaceTertiary,
  textTransform: "uppercase",
  letterSpacing: "0.02em",
  position: "absolute",
  left: "0.4rem",
  top: "-0.55rem",
  backgroundColor: vars.color.surfacePrimary,
  padding: "0 0.15rem",
  pointerEvents: "none",
});

export const searchModeLabel = style({
  fontSize: vars.typography.bodySmallest.fontSize,
  fontWeight: 600,
  color: vars.color.onSurfaceSecondary,
  whiteSpace: "nowrap",
});

export const searchModeSelect = style({
  width: "10rem",
  minWidth: "10rem",
  height: controlRibbonHeight,
  minHeight: controlRibbonHeight,
  padding: `0 ${vars.spacing.xs}`,
  borderRadius: vars.border.radius.sm,
  gap: "0.2rem",
  boxSizing: "border-box",
});

export const searchModeSelectList = style({
  maxHeight: "20rem",
  overflowY: "auto",
});

export const searchModeLoading = style({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.25rem",
  fontSize: vars.typography.bodySmallest.fontSize,
  color: vars.color.onSurfaceSecondary,
});

const searchModeSpin = keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

export const searchModeLoadingIcon = style({
  animation: `${searchModeSpin} 0.9s linear infinite`,
});

globalStyle(`${searchModeSelect}[data-scope="select"][data-part="trigger"]`, {
  height: controlRibbonHeight,
  minHeight: controlRibbonHeight,
  boxSizing: "border-box",
  borderRadius: vars.border.radius.md,
  border: `1px solid ${vars.color.surfaceBorder}`,
  backgroundColor: vars.color.surfacePrimary,
  padding: `0 ${vars.spacing.sm}`,
});

globalStyle(
  `${searchModeSelect}[data-scope="select"][data-part="trigger"] [data-scope="select"][data-part="value"]`,
  {
    fontSize: vars.typography.bodySmallest.fontSize,
    fontWeight: 500,
  },
);

globalStyle(
  `${searchModeSelect}[data-scope="select"][data-part="trigger"] [data-scope="select"][data-part="icon"]`,
  {
    width: ".875rem",
    height: ".875rem",
  },
);

globalStyle(`${searchModeSelect} [data-scope="select"][data-part="value"]`, {
  fontSize: vars.typography.bodySmallest.fontSize,
});

globalStyle(`${searchModeSelect} [data-scope="select"][data-part="icon"]`, {
  width: "1rem",
  height: "1rem",
});

export const replaceInputWrapper = style({
  width: "13rem",
  minWidth: "13rem",
  maxWidth: "13rem",
});

export const replaceInput = style({
  width: "100%",
  height: controlRibbonHeight,
  minHeight: controlRibbonHeight,
  padding: `0 ${vars.spacing.sm}`,
  fontSize: vars.typography.bodySmallest.fontSize,
  border: `1px solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.md,
  backgroundColor: vars.color.surfacePrimary,
  color: vars.color.onSurfacePrimary,
  outline: "none",
  boxSizing: "border-box",
  selectors: {
    "&:focus": {
      borderColor: vars.color.brandBase,
      backgroundColor: "transparent",
    },
    "&:disabled": {
      backgroundColor: vars.color.surfaceSecondary,
      cursor: "not-allowed",
    },
  },
});

// Results container
export const searchResultsContainer = style({
  flex: 1,
  minHeight: 0,
  height: "100%",
  overflowY: "auto",
  overflowX: "hidden",
  paddingInline: vars.spacing.lg,
  paddingBlockEnd: "5rem",
  // Thin, themed, non-overlay scrollbar so it doesn't draw over the result rows
  // (matches the editor's). Firefox uses scrollbar-width/-color; WebKit/Chromium
  // (incl. the Tauri webview) uses the ::-webkit-scrollbar pseudo-elements.
  scrollbarWidth: "thin",
  scrollbarColor: `${vars.color.brandDark} transparent`,
  selectors: {
    "&::-webkit-scrollbar": {
      width: "0.375rem",
    },
    "&::-webkit-scrollbar-track": {
      backgroundColor: "transparent",
    },
    "&::-webkit-scrollbar-thumb": {
      backgroundColor: vars.color.brandDark,
      borderRadius: vars.border.radius.lg,
    },
    "&::-webkit-scrollbar-thumb:hover": {
      backgroundColor: vars.color.brandBase,
    },
  },
});

export const searchResultsInner = style({
  padding: 0,
});

export const searchEmptyState = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: vars.spacing.md,
  height: "100%",
  color: vars.color.onSurfaceSecondary,
  fontSize: vars.typography.bodySmall.fontSize,
});

export const searchEmptyIcon = style({
  fontSize: "2rem",
});

export const searchLoadingState = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  color: vars.color.onSurfaceSecondary,
  fontSize: vars.typography.bodySmall.fontSize,
});

export const searchNoResultsState = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  color: vars.color.onSurfaceSecondary,
  fontSize: vars.typography.bodySmall.fontSize,
  textAlign: "center",
  padding: vars.spacing.md,
});

export const searchResultRow = style({
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  paddingBottom: vars.spacing.md,
});

// Result item
export const searchResultItem = style({
  padding: vars.spacing.sm,
  border: `1px solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.md,
  backgroundColor: vars.color.surfacePrimary,
  cursor: "pointer",
});

export const searchResultItemActive = style({
  backgroundColor: vars.toggleGroup.itemSelectedSurface,
  borderColor: vars.color.brandBase,
  selectors: {
    "&:hover": {
      backgroundColor: vars.toggleGroup.itemSelectedSurface,
    },
  },
});

export const searchResultHeader = style({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: vars.spacing.xs,
});

export const searchResultLocation = style({
  fontSize: vars.typography.bodySmall.fontSize,
  fontWeight: 700,
  color: vars.color.onSurfacePrimary,
});

export const searchResultNavigate = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "1.5rem",
  height: "1.5rem",
  border: "none",
  borderRadius: vars.border.radius.sm,
  backgroundColor: "transparent",
  color: vars.color.onSurfaceSecondary,
  cursor: "pointer",
  selectors: {
    "&:hover": {
      backgroundColor: vars.color.surfaceSecondary,
      color: vars.color.brandBase,
    },
  },
});

// Per-verse occurrence cursor on the active row: ‹ 2/3 ›. Clusters with the
// navigate button on the trailing edge.
export const occurrenceStepper = style({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.125rem",
  marginInlineStart: "auto",
  marginInlineEnd: vars.spacing.xs,
});

export const occurrenceStepButton = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "1.25rem",
  height: "1.25rem",
  border: "none",
  borderRadius: vars.border.radius.sm,
  backgroundColor: "transparent",
  color: vars.color.onSurfaceSecondary,
  cursor: "pointer",
  selectors: {
    "&:hover:not(:disabled)": {
      backgroundColor: vars.color.surfaceSecondary,
      color: vars.color.brandBase,
    },
    "&:disabled": {
      opacity: 0.35,
      cursor: "default",
    },
  },
});

export const occurrenceCount = style({
  fontSize: vars.typography.bodySmallest.fontSize,
  fontVariantNumeric: "tabular-nums",
  color: vars.color.onSurfaceSecondary,
  minWidth: "2.25rem",
  textAlign: "center",
});

export const searchResultPreview = style({
  fontSize: vars.typography.bodySmall.fontSize,
  color: vars.color.onSurfacePrimary,
  lineHeight: 1.5,
  marginBottom: vars.spacing.sm,
  wordBreak: "break-word",
});

export const searchResultPair = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(25ch, 1fr))",
  gap: "1.5rem",
  alignItems: "flex-start",
  justifyContent: "space-between",
});

export const searchResultPairBlock = style({
  display: "grid",
  gap: vars.spacing.xs,
  minWidth: 0,
});

export const searchResultProjectLabel = style({
  fontSize: vars.typography.bodySmallest.fontSize,
  lineHeight: vars.typography.bodySmallest.lineHeight,
  fontWeight: 600,
  color: vars.color.onSurfaceSecondary,
  textTransform: "uppercase",
  letterSpacing: "0.025em",
});

export const searchResultPairText = style({
  fontSize: vars.typography.bodySmall.fontSize,
  lineHeight: 1.5,
  color: vars.color.onSurfacePrimary,
  wordBreak: "break-word",
});

export const referenceToggleGlyph = style({
  fontSize: vars.typography.bodySmallest.fontSize,
  fontWeight: 700,
  lineHeight: 1,
});

export const searchHighlight = style({
  backgroundColor: "rgba(255, 193, 7, 0.4)",
  color: vars.color.onSurfacePrimary,
  fontWeight: 600,
  padding: "0 2px",
  borderRadius: "2px",
});

export const searchResultReplace = style({
  display: "block",
  marginTop: vars.spacing.xs,
});

export const searchResultReplaceControls = style({
  display: "inline-flex",
  alignItems: "stretch",
  gap: vars.spacing.xs,
  width: "100%",
  maxWidth: "100%",
  marginLeft: 0,
  padding: "0.25rem",
  borderRadius: vars.border.radius.lg,
  backgroundColor: vars.color.surfaceSecondary,
});

export const searchResultReplaceInput = style({
  flex: "1 1 auto",
  minWidth: 0,
  height: "2.75rem",
  padding: `0 ${vars.spacing.sm}`,
  fontSize: vars.typography.bodySmallest.fontSize,
  border: "none",
  borderRadius: vars.border.radius.sm,
  backgroundColor: "transparent",
  color: vars.color.onSurfacePrimary,
  outline: "none",
  selectors: {
    "&:disabled": {
      backgroundColor: vars.color.surfaceSecondary,
      cursor: "not-allowed",
    },
  },
});

export const searchResultFallbackText = style({
  display: "inline-block",
  fontSize: vars.typography.bodySmallest.fontSize,
  color: vars.color.onSurfaceTertiary,
  fontStyle: "italic",
});

export const searchResultReplaceButton = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "7.5rem",
  height: "2.75rem",
  padding: `0 ${vars.spacing.md}`,
  border: `1px solid ${vars.color.brandDark}`,
  borderRadius: vars.border.radius.md,
  backgroundColor: vars.color.brandBase,
  color: vars.button.primary.onSurface,
  fontSize: vars.typography.bodySmall.fontSize,
  fontWeight: 600,
  cursor: "pointer",
  flexShrink: 0,
  selectors: {
    "&:hover:not(:disabled)": {
      backgroundColor: vars.button.primary.surfaceHover,
    },
    "&:disabled": {
      opacity: 0.5,
      cursor: "not-allowed",
      backgroundColor: vars.color.surfaceSecondary,
      borderColor: vars.color.surfaceBorder,
      color: vars.color.onSurfaceTertiary,
    },
  },
});

export const searchReplacementPreview = style({
  display: "inline-flex",
  alignItems: "baseline",
  gap: "0.3rem",
  flexWrap: "wrap",
});

export const searchReplacementOld = style({
  textDecoration: "line-through",
  textDecorationThickness: "1.5px",
  color: vars.color.onSurfaceTertiary,
});

export const searchReplacementArrow = style({
  color: vars.color.onSurfaceTertiary,
  fontWeight: 600,
});

export const searchReplacementNew = style({
  color: vars.color.brandBase,
  fontWeight: 700,
});
