import { globalStyle, keyframes, style } from "@vanilla-extract/css";

import { vars as dsVars } from "@/app/ui/styles/designSystem.css.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";

const darkSelector = "[data-theme='dark']";
const breakpoints = {
  minWSmall: "screen and (min-width: 36em)",
  minWMd: "screen and (min-width: 48em)",
  minWLg: "screen and (min-width: 62em)",
  minWXl: "screen and (min-width: 75em)",
};

const vars = {
  spacing: dsVars.spacing,
  radius: dsVars.border.radius,
  fontSizes: {
    sm: dsVars.typography.bodySmall.fontSize,
    md: dsVars.typography.bodyNormal.fontSize,
    lg: dsVars.typography.h5.fontSize,
    xl: dsVars.typography.h4.fontSize,
  },
  colors: {
    body: dsVars.color.surfacePrimary,
    text: dsVars.color.onSurfacePrimary,
    dimmed: dsVars.color.onSurfaceTertiary,
    gray: {
      0: dsVars.color.surfacePrimary,
      2: dsVars.color.surfaceTertiary,
      3: dsVars.color.surfaceBorder,
      5: dsVars.color.onSurfaceTertiary,
      6: dsVars.color.onSurfaceTertiary,
      7: dsVars.color.onSurfaceSecondary,
      8: dsVars.color.onSurfacePrimary,
      9: dsVars.color.onSurfacePrimary,
    },
    dark: {
      4: dsVars.color.surfaceTertiary,
      5: dsVars.color.surfaceTertiary,
      6: dsVars.color.surfaceSecondary,
      8: dsVars.color.surfaceInvert,
    },
    orange: {
      0: dsVars.color.surfaceError,
      2: dsVars.color.surfaceError,
      9: dsVars.color.onSurfaceError,
    },
    red: {
      2: dsVars.color.onSurfaceError,
    },
    green: {
      2: dsVars.color.onSurfaceSuccess,
    },
    blue: {
      0: dsVars.color.brandLight,
      7: dsVars.color.brandBase,
    },
  },
};

// Shared sizing for the diff-toolbar controls. Selects, the chapter picker,
// icon toggles, and the print button all snap to one height + border + focus
// ring so the band reads as a single consistent row (matches the print
// button, the tightest of the originals).
const CONTROL_HEIGHT = "2rem";
const controlBorder = `1px solid ${vars.colors.gray[3]}`;
const controlFocusRing = `0 0 0 2px ${vars.colors.body}, 0 0 0 4px ${vars.colors.blue[7]}`;

// --- Layout & Containers ---

// Diff Item Container
export const diffItem = style({
  marginBottom: vars.spacing.md,
  padding: vars.spacing.xs,
  borderRadius: vars.radius.md,
  backgroundColor: vars.colors.body,
  "@media": {
    [breakpoints.minWSmall]: {
      // padding: vars.spacing.md,
    },
  },
});

// Diff Grid Padding (for lg+ desktop layout)
export const diffGrid = style({
  padding: `${vars.spacing.sm} 0`,
  justifyContent: "space-between",
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  alignItems: "start",
  gridGap: vars.spacing.xl,
});
export const diffColumn = style({
  display: "grid",
  gridTemplateRows: "3rem 1fr",
});

// Stacked layout for small screens
export const diffStacked = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.xl,
  padding: 0,
});

// Modal content wrapper
export const modalScrollPaper = style({
  height: "100%",
  overflow: "hidden",
  display: "grid",
  gridTemplateRows: "auto 1fr auto",
  // Cap the single column at the container width. Without an explicit 0 min,
  // the implicit column's `min-width: auto` lets it grow to the toolbar band's
  // (nowrap) min-content, overflowing the paper — which clips the right inline
  // padding and pushes the footer/Close buttons against the edge. With this,
  // the toolbar band's own `overflow-x: auto` scrolls instead.
  gridTemplateColumns: "minmax(0, 1fr)",
  backgroundColor: "transparent",
  paddingTop: `max(${vars.spacing.md}, env(safe-area-inset-top))`,
  paddingBlock: vars.spacing.sm,
  paddingInline: vars.spacing.sm,
  "@media": {
    [breakpoints.minWSmall]: {
      paddingTop: `max(${vars.spacing.md}, env(safe-area-inset-top))`,
      paddingInline: vars.spacing.md,
    },
  },
});

export const diffModalFooter = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: `${vars.spacing.md} 0`,
  borderTop: `1px solid ${vars.colors.gray[3]}`,
  selectors: {
    [`${darkSelector} &`]: {
      borderColor: vars.colors.dark[4],
    },
  },
});

export const diffModalFooterActions = style({
  display: "flex",
  gap: vars.spacing.md,
  alignItems: "center",
});

export const overlayShell = style({
  position: "absolute",
  inset: 0,
  zIndex: zLayer.editorOverlayPane,
  display: "none",
  backgroundColor: vars.colors.body,
  isolation: "isolate",
  overflow: "visible",
  selectors: {
    '&[data-open="true"]': {
      display: "block",
    },
  },
});

// ScrollArea height constraint
export const diffScrollArea = style({
  height: "100%",
  minHeight: 0,
  overflow: "auto",
  paddingRight: 0,
  "@media": {
    [breakpoints.minWSmall]: {
      paddingRight: vars.spacing.xs,
    },
  },
});

// Center content (loader/empty state)
export const fullHeight = style({
  height: "100%",
});

export const modalBody = style({
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
  paddingTop: vars.spacing.sm,
  "@media": {
    [breakpoints.minWSmall]: {
      paddingTop: vars.spacing.md,
    },
  },
});

export const modalBodyScrollable = style({
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  paddingTop: 0,
  paddingBottom: vars.spacing.md,
});

export const modalContent = style({
  height: "95vh",
  display: "flex",
  flexDirection: "column",
  backgroundColor: vars.colors.gray[0],
  selectors: {
    [`${darkSelector} &`]: {
      backgroundColor: vars.colors.dark[8],
    },
  },
});

export const modalBodyRoot = style({
  flex: 1,
  minHeight: 0,
  paddingTop: vars.spacing.md,
});

export const modalHeader = style({
  borderBottom: "none",
  paddingBottom: 0,
  "@media": {
    [breakpoints.minWSmall]: {
      paddingBlock: vars.spacing.md,
    },
  },
});

export const modalTitle = style({
  fontSize: vars.fontSizes.lg,
  fontWeight: 600,
  letterSpacing: "-0.02em",
  margin: 0,
  lineHeight: 1.05,
  "@media": {
    [breakpoints.minWSmall]: {
      fontSize: vars.fontSizes.xl,
    },
  },
});

export const overlayHeaderRow = style({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: vars.spacing.md,
});

export const headerCopy = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  maxWidth: "48rem",
});

export const reviewOptionsDisclosure = style({
  display: "block",
});

export const reviewOptionsSummary = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.spacing.xs,
  listStyle: "none",
  cursor: "pointer",
  color: vars.colors.dimmed,
  fontSize: vars.fontSizes.sm,
  fontWeight: 600,
  selectors: {
    "&::-webkit-details-marker": {
      display: "none",
    },
    "&:hover": {
      color: vars.colors.text,
    },
    "&[aria-expanded='true']": {
      color: vars.colors.text,
    },
  },
});

export const reviewOptionsChevron = style({
  transition: "transform 150ms ease",
  selectors: {
    [`${reviewOptionsDisclosure}[open] &`]: {
      transform: "rotate(180deg)",
    },
  },
});

export const reviewOptionsBody = style({
  paddingTop: vars.spacing.xs,
});

// --- Header & Text Styles ---

// Sticky header in modal
export const stickyHeader = style({
  flex: "0 0 auto",
  zIndex: 2,
  backgroundColor: "transparent",
  padding: `0 0 ${vars.spacing.xs}`,
  display: "grid",
  gap: vars.spacing.sm,
});

export const toolbarSection = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.sm,
});

export const toolbarBand = style({
  display: "flex",
  alignItems: "center",
  gap: vars.spacing.sm,
  flexWrap: "nowrap",
  padding: `${vars.spacing.xs} ${vars.spacing.sm}`,
  borderRadius: vars.radius.md,
  border: `1px solid ${dsVars.color.surfaceBorder}`,
  backgroundColor: vars.colors.body,
  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  minHeight: "2.75rem",
  overflowX: "auto",
  overflowY: "visible",
  msOverflowStyle: "none",
  scrollbarWidth: "none",
  selectors: {
    "&::-webkit-scrollbar": {
      display: "none",
    },
    [`${darkSelector} &`]: {
      backgroundColor: vars.colors.dark[6],
      boxShadow: "none",
    },
  },
});

export const ribbonGroup = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.spacing.xs,
  flexWrap: "nowrap",
  minWidth: 0,
  flex: "0 0 auto",
});

export const ribbonLabel = style({
  color: vars.colors.dimmed,
  fontWeight: 600,
  whiteSpace: "nowrap",
});

export const ribbonSeparator = style({
  width: 1,
  height: "1.25rem",
  flex: "0 0 auto",
  backgroundColor: vars.colors.gray[3],
});

export const ribbonSpacer = style({
  flex: "1 1 auto",
});

export const ribbonSelect = style({
  minWidth: "8rem",
  maxWidth: "13rem",
  selectors: {
    "&": {
      border: controlBorder,
      backgroundColor: "transparent",
      minHeight: CONTROL_HEIGHT,
      padding: `0 ${vars.spacing.sm}`,
      borderRadius: vars.radius.md,
      boxShadow: "none",
    },
    "&:hover": {
      backgroundColor: vars.colors.gray[2],
      borderColor: vars.colors.blue[7],
    },
    "&:focus-visible": {
      outline: "none",
      boxShadow: controlFocusRing,
    },
  },
});
export const ribbonPopup = style({
  maxHeight: "max(20rem, 50vh)",
  overflowY: "auto",
});

export const ribbonScopeToggle = style({
  // The outlinePill root is `width: 100%` with `flex: 1` items, so it sizes to
  // this box — it must carry an explicit width or it collapses to the sliding
  // indicator. Shrunk from the old 12rem; `compact` keeps the labels dense.
  flex: "0 0 auto",
  alignItems: "center",
  width: "11rem",
});

export const ribbonMeta = style({
  color: vars.colors.dimmed,
  fontWeight: 600,
  whiteSpace: "nowrap",
  minHeight: CONTROL_HEIGHT,
  display: "inline-flex",
  alignItems: "center",
});

export const toolbarIconToggle = style({
  width: CONTROL_HEIGHT,
  minWidth: CONTROL_HEIGHT,
  height: CONTROL_HEIGHT,
  padding: 0,
  borderRadius: vars.radius.md,
  border: "1px solid transparent",
  backgroundColor: "transparent",
  color: vars.colors.gray[7],
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition:
    "background-color 120ms ease, color 120ms ease, border-color 120ms ease",
  selectors: {
    "&:hover": {
      backgroundColor: vars.colors.gray[2],
      color: vars.colors.text,
    },
    "&[data-pressed]": {
      backgroundColor: vars.colors.gray[2],
      color: vars.colors.blue[7],
      borderColor: "transparent",
    },
    "&:focus-visible": {
      outline: "none",
      boxShadow: `0 0 0 2px ${vars.colors.body}, 0 0 0 4px ${vars.colors.blue[7]}`,
    },
    "&:disabled": {
      cursor: "not-allowed",
      opacity: 0.45,
    },
    [`${darkSelector} &`]: {
      backgroundColor: "transparent",
      borderColor: "transparent",
    },
    [`${darkSelector} &[data-pressed]`]: {
      backgroundColor: vars.colors.dark[4],
      color: vars.colors.text,
      borderColor: "transparent",
    },
  },
});

export const warningStrip = style({
  borderRadius: vars.radius.md,
  backgroundColor: vars.colors.orange[0],
  padding: vars.spacing.sm,
  border: `1px solid ${vars.colors.orange[2]}`,
  selectors: {
    [`${darkSelector} &`]: {
      borderColor: vars.colors.orange[9],
      backgroundColor: vars.colors.dark[5],
    },
  },
});

// Labels for Original/Current sections
export const diffLabel = style({
  textTransform: "uppercase",
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.1em",
  color: vars.colors.dimmed,
});

// SID Header Text
export const diffSidHeader = style({
  fontWeight: 600,
  fontSize: vars.fontSizes.md,
  letterSpacing: "-0.01em",
  margin: 0,
});

// Preformatted text styles (the actual verse content)
export const diffPre = style({
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontFamily: "inherit",
  color: "inherit",
  lineHeight: 1.6,
  fontSize: vars.fontSizes.md,
});

// Placeholder text for added/deleted verses
export const versePlaceholder = style({
  color: vars.colors.dimmed,
  textAlign: "center",
  fontSize: vars.fontSizes.sm,
  fontStyle: "italic",
  paddingTop: vars.spacing.xs,
});

// --- Paper Background Variants ---

export const paperMinHeight = style({
  minHeight: "3rem",
});

export const paperBgDefault = style({
  backgroundColor: vars.colors.gray[0],
  borderRadius: vars.radius.md,
  border: "none",
  selectors: {
    [`${darkSelector} &`]: {
      backgroundColor: vars.colors.dark[6],
    },
  },
});

export const paperBgDeletion = style({
  backgroundColor: "#fff5f5",
  borderRadius: vars.radius.md,
  border: "none",
  selectors: {
    [`${darkSelector} &`]: {
      backgroundColor: "rgba(255, 0, 0, 0.1)",
      color: vars.colors.red[2],
    },
  },
});

export const paperBgAddition = style({
  backgroundColor: "#f4fcf3",
  borderRadius: vars.radius.md,
  border: "none",
  selectors: {
    [`${darkSelector} &`]: {
      backgroundColor: "rgba(0, 255, 0, 0.05)",
      color: vars.colors.green[2],
    },
  },
});

// --- Highlight Spans (Word level diffs) ---

export const diffHighlightAdded = style({
  backgroundColor: "#c6f6d5",
  borderRadius: "2px",
  padding: "0 2px",
  color: "#22543d",
  selectors: {
    [`${darkSelector} &`]: {
      backgroundColor: "rgba(72, 187, 120, 0.3)",
      color: "#9ae6b4",
    },
  },
});

export const diffHighlightRemoved = style({
  backgroundColor: "#fed7d7",
  borderRadius: "2px",
  padding: "0 2px",
  color: "#822727",
  selectors: {
    [`${darkSelector} &`]: {
      backgroundColor: "rgba(245, 101, 101, 0.3)",
      color: "#feb2b2",
    },
  },
});

export const chapterDiffItem = style({
  height: "100%",
  minHeight: 0,
  display: "grid",
  gridTemplateRows: "auto 1fr",
  gap: vars.spacing.md,
  paddingBlockStart: vars.spacing.sm,
});

export const chapterDiffPanel = style({
  minHeight: 0,
  height: "100%",
  overflowY: "auto",
  overflowX: "hidden",
  backgroundColor: vars.colors.body,
  borderRadius: vars.radius.lg,
  boxShadow: dsVars.shadow.large,
  border: "none",
  selectors: {
    [`${darkSelector} &`]: {
      backgroundColor: vars.colors.dark[6],
      boxShadow: "none",
    },
  },
});

export const chapterMobileToggle = style({
  width: "100%",
});

export const chapterGrid = style({
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: vars.spacing.lg,
  paddingInline: vars.spacing.xs,
  minHeight: 0,
  height: "100%",
  "@media": {
    [breakpoints.minWMd]: {
      gridTemplateColumns: "1fr 1fr",
    },
  },
});

export const chapterColumn = style({
  minHeight: 0,
  height: "100%",
  display: "grid",
  gridTemplateRows: "auto 1fr",
  gap: vars.spacing.sm,
});

export const chapterDiffBody = style({
  position: "relative",
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
  lineHeight: 1.7,
  fontSize: vars.fontSizes.sm,
  fontFamily: "inherit",
  padding: `${vars.spacing.sm} ${vars.spacing.md}`,
});

globalStyle(`${chapterDiffBody} > .usfm-para-container`, {
  width: "100%",
  maxWidth: "100%",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
  "@media": {
    [breakpoints.minWMd]: {
      width: "max-content",
    },
  },
});

export const chapterPartChanged = style({
  position: "relative",
  display: "inline",
});

export const chapterActionOverlayHost = style({
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  zIndex: 3,
});

export const chapterHunkAction = style({
  position: "absolute",
  zIndex: 4,
  pointerEvents: "auto",
  width: "1rem",
  height: "1rem",
  padding: 0,
  border: "none",
  transition: "opacity 0.1s ease",
  opacity: 0.75,
  color: dsVars.color.onSurfaceError,
  selectors: {
    "&:hover": {
      opacity: 1,
      backgroundColor: "transparent",
    },
  },
});

export const diffToolbarRow = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.spacing.sm,
  flexWrap: "wrap",
});

export const diffFooterActions = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: vars.spacing.sm,
  flexWrap: "wrap",
});

export const compareSelect = style({
  minWidth: "16rem",
});

export const chapterSelect = style({
  minWidth: "13.5rem",
});

export const chapterComboboxTrigger = style({
  minWidth: 0,
  flex: "1 1 auto",
  alignItems: "center",
  minHeight: CONTROL_HEIGHT,
  padding: `0 ${vars.spacing.sm}`,
  border: "none",
  backgroundColor: "transparent",
  color: vars.colors.text,
  display: "inline-flex",
  gap: vars.spacing.xs,
  cursor: "pointer",
  selectors: {
    "&:hover": {
      backgroundColor: vars.colors.gray[2],
    },
    "&:focus-visible": {
      outline: "none",
      boxShadow: `0 0 0 2px ${vars.colors.body}, 0 0 0 4px ${vars.colors.blue[7]}`,
    },
    "&[data-popup-open]": {
      backgroundColor: vars.colors.gray[2],
    },
  },
});

export const chapterComboboxControl = style({
  minWidth: "10rem",
  maxWidth: "13rem",
  minHeight: CONTROL_HEIGHT,
  display: "inline-flex",
  alignItems: "center",
  gap: vars.spacing.xs,
  paddingInline: vars.spacing.xs,
  borderRadius: vars.radius.md,
  border: controlBorder,
  backgroundColor: vars.colors.gray[0],
  selectors: {
    "&:focus-within": {
      boxShadow: controlFocusRing,
      borderColor: vars.colors.blue[7],
    },
  },
});

export const chapterComboboxStepper = style({
  width: "1.5rem",
  height: "1.5rem",
  minWidth: "1.5rem",
  border: "none",
  borderRadius: vars.radius.sm,
  backgroundColor: "transparent",
  color: vars.colors.dimmed,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  flexShrink: 0,
  selectors: {
    "&:hover:not(:disabled)": {
      backgroundColor: vars.colors.body,
      color: vars.colors.text,
    },
    "&:focus-visible": {
      outline: "none",
      boxShadow: `0 0 0 2px ${vars.colors.body}, 0 0 0 4px ${vars.colors.blue[7]}`,
    },
    "&:disabled": {
      opacity: 0.35,
      cursor: "not-allowed",
    },
  },
});

export const chapterComboboxHint = style({
  color: vars.colors.dimmed,
  fontSize: vars.fontSizes.sm,
  fontWeight: 600,
  whiteSpace: "nowrap",
});

export const chapterComboboxValue = style({
  minWidth: 0,
  flex: "1 1 auto",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: vars.fontSizes.sm,
  fontWeight: 700,
});

export const chapterComboboxChevron = style({
  color: vars.colors.dimmed,
  fontSize: vars.fontSizes.sm,
  lineHeight: 1,
  flexShrink: 0,
});

export const chapterComboboxPopup = style({
  width: "18rem",
  maxHeight: "20rem",
  overflow: "hidden",
  backgroundColor: vars.colors.body,
  border: `1px solid ${vars.colors.gray[3]}`,
  borderRadius: vars.radius.md,
  boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
  zIndex: 2,
});

export const chapterComboboxHeader = style({
  padding: vars.spacing.sm,
  borderBottom: `1px solid ${vars.colors.gray[3]}`,
});

export const chapterComboboxInput = style({
  width: "100%",
  minHeight: "2.25rem",
  padding: `0 ${vars.spacing.sm}`,
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.colors.gray[3]}`,
  backgroundColor: vars.colors.gray[0],
  color: vars.colors.text,
  fontSize: vars.fontSizes.sm,
  selectors: {
    "&:focus-visible": {
      outline: "none",
      boxShadow: `0 0 0 2px ${vars.colors.body}, 0 0 0 4px ${vars.colors.blue[7]}`,
    },
  },
});

export const chapterComboboxList = style({
  display: "grid",
  gap: "2px",
  padding: vars.spacing.xs,
});

export const chapterComboboxScrollArea = style({
  maxHeight: "18rem",
});

export const chapterComboboxScrollViewport = style({
  maxHeight: "18rem",
});

export const chapterComboboxItem = style({
  display: "flex",
  alignItems: "center",
  width: "100%",
  minHeight: "2rem",
  padding: `0 ${vars.spacing.sm}`,
  borderRadius: vars.radius.sm,
  color: vars.colors.text,
  cursor: "pointer",
  selectors: {
    "&:hover": {
      backgroundColor: vars.colors.gray[2],
    },
    "&[data-selected]": {
      backgroundColor: vars.colors.blue[0],
      color: vars.colors.blue[7],
    },
  },
});

export const chapterComboboxEmpty = style({
  padding: `${vars.spacing.sm} ${vars.spacing.md}`,
  color: vars.colors.dimmed,
  fontSize: vars.fontSizes.sm,
});

export const usfmGlyph = style({
  fontFamily: dsVars.typography.fontFamilyMono,
  fontSize: vars.fontSizes.sm,
  fontWeight: 700,
  lineHeight: 1,
});

export const diffToolbarGroup = style({
  display: "flex",
  alignItems: "center",
  gap: vars.spacing.xs,
  flexWrap: "wrap",
});

export const diffToolbarStack = style({
  display: "grid",
  gap: vars.spacing.xs,
});

export const diffBadge = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "1.75rem",
  padding: `0 ${vars.spacing.sm}`,
  borderRadius: vars.radius.full,
  border: `1px solid ${vars.colors.gray[3]}`,
  backgroundColor: vars.colors.gray[0],
  color: vars.colors.gray[7],
  fontSize: ".8em",
  fontWeight: 600,
});

export const diffBadgePrimary = style({
  backgroundColor: vars.colors.blue[0],
  color: vars.colors.blue[7],
  borderColor: vars.colors.blue[0],
});

export const diffBadgeGray = style({
  backgroundColor: vars.colors.gray[0],
  color: vars.colors.gray[7],
});

export const diffTextMuted = style({
  color: vars.colors.dimmed,
  fontSize: vars.fontSizes.sm,
  lineHeight: 1.5,
});

export const diffTextDimmed = style({
  color: vars.colors.dimmed,
});

export const diffStateMessage = style({
  maxWidth: "28rem",
  textAlign: "center",
  lineHeight: 1.6,
});

export const diffPaper = style({
  padding: vars.spacing.md,
  borderRadius: vars.radius.md,
  backgroundColor: vars.colors.body,
  border: `1px solid ${vars.colors.gray[3]}`,
  boxShadow: dsVars.shadow.small,
});

export const diffCenter = style({
  minHeight: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

const diffModalSpin = keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

export const diffLoader = style({
  width: "1.5rem",
  height: "1.5rem",
  borderRadius: "9999px",
  border: `2px solid ${vars.colors.gray[3]}`,
  borderTopColor: vars.colors.blue[7],
  animation: `${diffModalSpin} 0.8s linear infinite`,
});

export const diffMenuTrigger = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: CONTROL_HEIGHT,
  minHeight: CONTROL_HEIGHT,
  padding: "0.25rem",
  borderRadius: vars.radius.md,
  border: "1px solid transparent",
  backgroundColor: "transparent",
  color: vars.colors.gray[7],
  selectors: {
    "&:hover": {
      backgroundColor: vars.colors.gray[2],
      color: vars.colors.text,
    },
    "&:focus-visible": {
      outline: "none",
      boxShadow: `0 0 0 2px ${vars.colors.body}, 0 0 0 4px ${vars.colors.blue[7]}`,
    },
  },
});

export const diffMenuPopup = style({
  minWidth: "16rem",
  backgroundColor: vars.colors.body,
  border: `1px solid ${vars.colors.gray[3]}`,
  borderRadius: vars.radius.md,
  boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
  overflow: "hidden",
});

export const diffMenuLabel = style({
  padding: `${vars.spacing.xs} ${vars.spacing.md}`,
  color: vars.colors.dimmed,
  fontSize: vars.fontSizes.sm,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
});

export const diffMenuItem = style({
  display: "flex",
  alignItems: "center",
  gap: vars.spacing.sm,
  width: "100%",
  padding: `${vars.spacing.sm} ${vars.spacing.md}`,
  border: "none",
  background: "transparent",
  color: vars.colors.text,
  textAlign: "left",
  cursor: "pointer",
  selectors: {
    "&:hover": {
      backgroundColor: vars.colors.gray[2],
    },
  },
});

export const diffMenuDivider = style({
  height: 1,
  backgroundColor: vars.colors.gray[3],
});
