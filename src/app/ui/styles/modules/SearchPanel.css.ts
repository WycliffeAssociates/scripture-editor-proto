import { globalStyle, keyframes, style } from "@vanilla-extract/css";
import { dsVars } from "@/app/ui/styles/designSystem.css.ts";

// Main panel container
export const searchPanel = style({
    display: "grid",
    gridTemplateRows: "auto 1fr",
    width: "100%",
    height: "100dvh",
    minHeight: 0,
    backgroundColor: dsVars.color.surfacePrimary,
    borderLeft: `1px solid ${dsVars.color.surfaceBorder}`,
});

export const searchPopoverDropdown = style({
    width: "min(32rem, calc(100vw - 1rem))",
    maxWidth: "100%",
});

export const searchPopoverHeader = style({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "stretch",
    gap: dsVars.spacing.sm,
    padding: dsVars.spacing.sm,
    borderBottom: `1px solid ${dsVars.color.surfaceBorder}`,
    backgroundColor: dsVars.color.surfaceSecondary,
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
    color: dsVars.color.onSurfacePrimary,
});

export const searchPopoverDragHandle = style({
    cursor: "grab",
});

export const searchPopoverDragging = style({
    cursor: "grabbing",
});

export const searchPopoverGripIcon = style({
    color: dsVars.color.onSurfaceTertiary,
});

export const searchPopoverTitle = style({
    fontSize: dsVars.typography.bodySmall.fontSize,
    fontWeight: 700,
    color: dsVars.color.onSurfacePrimary,
});

export const searchPopoverHelpText = style({
    fontSize: dsVars.typography.bodySmallest.fontSize,
    color: dsVars.color.onSurfaceSecondary,
});

export const searchPopoverHeaderActions = style({
    display: "flex",
    gap: dsVars.spacing.xs,
    alignItems: "flex-start",
});

export const searchPopoverAction = style({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    borderRadius: dsVars.border.radius.sm,
    border: "none",
    backgroundColor: "transparent",
    color: dsVars.color.onSurfaceSecondary,
    cursor: "pointer",
    selectors: {
        "&:hover": {
            backgroundColor: dsVars.color.surfacePrimary,
            color: dsVars.color.onSurfacePrimary,
        },
    },
});

export const searchPopoverBody = style({
    position: "relative",
    padding: dsVars.spacing.sm,
    paddingBottom: `calc(${dsVars.spacing.sm} + 1.25rem)`,
    backgroundColor: dsVars.color.surfacePrimary,
});

export const searchPopoverResizeHandle = style({
    position: "absolute",
    right: dsVars.spacing.sm,
    bottom: dsVars.spacing.sm,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "1.25rem",
    height: "1.25rem",
    borderRadius: dsVars.border.radius.sm,
    border: "none",
    backgroundColor: dsVars.color.surfaceSecondary,
    color: dsVars.color.onSurfaceSecondary,
    cursor: "nwse-resize",
});

export const searchPopoverResizeHandleActive = style({
    backgroundColor: dsVars.color.surfaceTertiary,
    color: dsVars.color.onSurfacePrimary,
});

export const searchPopoverResizeIcon = style({
    pointerEvents: "none",
});

// Header
export const searchPanelHeader = style({
    flexShrink: 0,
    padding: dsVars.spacing.md,
    borderBottom: `1px solid ${dsVars.color.surfaceBorder}`,
    backgroundColor: dsVars.color.surfaceSecondary,
});

export const searchPanelHeaderTop = style({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: dsVars.spacing.sm,
});

export const searchPanelTitle = style({
    fontSize: dsVars.typography.h5.fontSize,
    fontWeight: 600,
    color: dsVars.color.onSurfacePrimary,
});

export const searchPanelClose = style({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    border: "none",
    borderRadius: dsVars.border.radius.sm,
    backgroundColor: "transparent",
    color: dsVars.color.onSurfaceSecondary,
    cursor: "pointer",
    transition: "background-color 0.15s ease",
    selectors: {
        "&:hover": {
            backgroundColor: dsVars.color.surfaceSecondary,
        },
    },
});

// Controls
export const searchControls = style({
    display: "flex",
    flexDirection: "column",
    gap: dsVars.spacing.sm,
});

export const searchInputRow = style({
    display: "flex",
    gap: dsVars.spacing.xs,
    alignItems: "center",
});

export const searchInputWrapper = style({
    position: "relative",
    flex: 1,
    display: "flex",
    alignItems: "center",
});

export const searchInputIcon = style({
    position: "absolute",
    left: dsVars.spacing.sm,
    color: dsVars.color.onSurfaceTertiary,
    pointerEvents: "none",
});

export const searchInput = style({
    width: "100%",
    padding: `${dsVars.spacing.xs} ${dsVars.spacing.sm} ${dsVars.spacing.xs} calc(${dsVars.spacing.sm} + ${dsVars.spacing.sm} + 16px)`,
    fontSize: dsVars.typography.bodySmall.fontSize,
    border: `1px solid ${dsVars.color.surfaceBorder}`,
    borderRadius: dsVars.border.radius.md,
    backgroundColor: dsVars.color.surfacePrimary,
    color: dsVars.color.onSurfacePrimary,
    outline: "none",
    selectors: {
        "&:focus": {
            borderColor: dsVars.color.brandBase,
        },
    },
});

export const searchRunButton = style({
    position: "absolute",
    right: dsVars.spacing.xs,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
    border: "none",
    borderRadius: dsVars.border.radius.sm,
    backgroundColor: dsVars.button.primary.surface,
    color: dsVars.button.primary.onSurface,
    cursor: "pointer",
    selectors: {
        "&:hover": {
            backgroundColor: dsVars.button.primary.surfaceHover,
        },
    },
});

export const searchNavButtons = style({
    display: "flex",
    gap: dsVars.spacing.xs,
});

export const searchNavButton = style({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    border: `1px solid ${dsVars.color.surfaceBorder}`,
    borderRadius: dsVars.border.radius.sm,
    backgroundColor: dsVars.color.surfacePrimary,
    color: dsVars.color.onSurfaceSecondary,
    cursor: "pointer",
    selectors: {
        "&:hover:not(:disabled)": {
            backgroundColor: dsVars.color.surfaceSecondary,
        },
        "&:disabled": {
            opacity: 0.5,
            cursor: "not-allowed",
        },
    },
});

export const searchOptionsRow = style({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: dsVars.spacing.sm,
});

export const searchStats = style({
    fontSize: dsVars.typography.bodySmallest.fontSize,
    color: dsVars.color.onSurfaceSecondary,
    fontWeight: 500,
});

export const searchToggles = style({
    display: "flex",
    gap: dsVars.spacing.xs,
});

export const toggleButton = style({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    border: `1px solid ${dsVars.color.surfaceBorder}`,
    borderRadius: dsVars.border.radius.sm,
    backgroundColor: dsVars.color.surfacePrimary,
    color: dsVars.color.onSurfaceSecondary,
    cursor: "pointer",
    transition: "all 0.15s ease",
    selectors: {
        "&:hover:not(:disabled)": {
            backgroundColor: dsVars.color.surfaceSecondary,
        },
        "&:disabled": {
            opacity: 0.5,
            cursor: "not-allowed",
        },
    },
});

export const toggleButtonActive = style({
    backgroundColor: dsVars.button.primary.surface,
    borderColor: dsVars.button.primary.border,
    color: dsVars.button.primary.onSurface,
    selectors: {
        "&:hover": {
            backgroundColor: dsVars.button.primary.surfaceHover,
        },
    },
});

export const searchReplaceRow = style({
    display: "flex",
    gap: dsVars.spacing.xs,
});

export const searchModeRow = style({
    display: "flex",
    alignItems: "center",
    gap: dsVars.spacing.xs,
    flexWrap: "wrap",
});

export const searchModeLabel = style({
    fontSize: dsVars.typography.bodySmallest.fontSize,
    fontWeight: 600,
    color: dsVars.color.onSurfaceSecondary,
});

export const searchModeSelect = style({
    width: "8.5rem",
    minWidth: "8.5rem",
});

export const searchModeLoading = style({
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    fontSize: dsVars.typography.bodySmallest.fontSize,
    color: dsVars.color.onSurfaceSecondary,
});

const searchModeSpin = keyframes({
    from: { transform: "rotate(0deg)" },
    to: { transform: "rotate(360deg)" },
});

export const searchModeLoadingIcon = style({
    animation: `${searchModeSpin} 0.9s linear infinite`,
});

globalStyle(`${searchModeSelect}[data-scope="select"][data-part="trigger"]`, {
    minHeight: "1.75rem",
    padding: `0 ${dsVars.spacing.xs}`,
    borderRadius: dsVars.border.radius.sm,
    gap: dsVars.spacing.xs,
});

globalStyle(
    `${searchModeSelect}[data-scope="select"][data-part="trigger"] [data-scope="select"][data-part="value"]`,
    {
        fontSize: dsVars.typography.bodySmallest.fontSize,
        fontWeight: 500,
    },
);

globalStyle(
    `${searchModeSelect}[data-scope="select"][data-part="trigger"] [data-scope="select"][data-part="icon"]`,
    {
        width: "14px",
        height: "14px",
    },
);

globalStyle(`${searchModeSelect} [data-scope="select"][data-part="value"]`, {
    fontSize: dsVars.typography.bodySmallest.fontSize,
});

globalStyle(`${searchModeSelect} [data-scope="select"][data-part="icon"]`, {
    width: "16px",
    height: "16px",
});

export const replaceInputWrapper = style({
    flex: 1,
});

export const replaceInput = style({
    width: "100%",
    padding: `${dsVars.spacing.xs} ${dsVars.spacing.sm}`,
    fontSize: dsVars.typography.bodySmall.fontSize,
    border: `1px solid ${dsVars.color.surfaceBorder}`,
    borderRadius: dsVars.border.radius.md,
    backgroundColor: dsVars.color.surfacePrimary,
    color: dsVars.color.onSurfacePrimary,
    outline: "none",
    selectors: {
        "&:focus": {
            borderColor: dsVars.color.brandBase,
        },
        "&:disabled": {
            backgroundColor: dsVars.color.surfaceSecondary,
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
    padding: 0,
});

export const searchResultsInner = style({
    padding: dsVars.spacing.sm,
});

export const searchEmptyState = style({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: dsVars.spacing.md,
    height: "100%",
    color: dsVars.color.onSurfaceSecondary,
    fontSize: dsVars.typography.bodySmall.fontSize,
});

export const searchEmptyIcon = style({
    fontSize: "32px",
});

export const searchLoadingState = style({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: dsVars.color.onSurfaceSecondary,
    fontSize: dsVars.typography.bodySmall.fontSize,
});

export const searchNoResultsState = style({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: dsVars.color.onSurfaceSecondary,
    fontSize: dsVars.typography.bodySmall.fontSize,
    textAlign: "center",
    padding: dsVars.spacing.md,
});

export const searchResultRow = style({
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
});

// Result item
export const searchResultItem = style({
    padding: dsVars.spacing.sm,
    borderBottom: `1px solid ${dsVars.color.surfaceBorder}`,
    backgroundColor: dsVars.color.surfacePrimary,
    cursor: "pointer",
    transition: "background-color 0.15s ease",
    selectors: {
        "&:hover": {
            backgroundColor: dsVars.color.surfaceSecondary,
        },
    },
});

export const searchResultItemActive = style({
    backgroundColor: dsVars.toggleGroup.itemSelectedSurface,
    borderLeft: `3px solid ${dsVars.color.brandBase}`,
    selectors: {
        "&:hover": {
            backgroundColor: dsVars.toggleGroup.itemSelectedSurface,
        },
    },
});

export const searchResultHeader = style({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: dsVars.spacing.xs,
});

export const searchResultLocation = style({
    fontSize: dsVars.typography.bodySmallest.fontSize,
    fontWeight: 600,
    color: dsVars.color.onSurfaceSecondary,
    textTransform: "uppercase",
    letterSpacing: "0.025em",
});

export const searchResultNavigate = style({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
    border: "none",
    borderRadius: dsVars.border.radius.sm,
    backgroundColor: "transparent",
    color: dsVars.color.onSurfaceSecondary,
    cursor: "pointer",
    selectors: {
        "&:hover": {
            backgroundColor: dsVars.color.surfaceSecondary,
            color: dsVars.color.brandBase,
        },
    },
});

export const searchResultPreview = style({
    fontSize: dsVars.typography.bodySmall.fontSize,
    color: dsVars.color.onSurfacePrimary,
    lineHeight: 1.5,
    marginBottom: dsVars.spacing.sm,
    wordBreak: "break-word",
});

export const searchResultPair = style({
    display: "grid",
    gap: dsVars.spacing.sm,
});

export const searchResultPairBlock = style({
    display: "grid",
    gap: dsVars.spacing.xs,
});

export const searchResultProjectLabel = style({
    fontSize: dsVars.typography.bodySmallest.fontSize,
    lineHeight: dsVars.typography.bodySmallest.lineHeight,
    fontWeight: 600,
    color: dsVars.color.onSurfaceSecondary,
    textTransform: "uppercase",
    letterSpacing: "0.025em",
});

export const searchResultPairText = style({
    fontSize: dsVars.typography.bodySmall.fontSize,
    lineHeight: 1.5,
    color: dsVars.color.onSurfacePrimary,
    wordBreak: "break-word",
});

export const referenceToggleGlyph = style({
    fontSize: dsVars.typography.bodySmallest.fontSize,
    fontWeight: 700,
    lineHeight: 1,
});

export const searchHighlight = style({
    backgroundColor: "rgba(255, 193, 7, 0.4)",
    color: dsVars.color.onSurfacePrimary,
    fontWeight: 600,
    padding: "0 2px",
    borderRadius: "2px",
});

export const searchResultReplace = style({
    display: "flex",
    gap: dsVars.spacing.xs,
    alignItems: "center",
    marginTop: dsVars.spacing.xs,
});

export const searchResultReplaceInput = style({
    flex: 1,
    minWidth: 0,
    padding: `${dsVars.spacing.xs} ${dsVars.spacing.sm}`,
    fontSize: dsVars.typography.bodySmallest.fontSize,
    border: `1px solid ${dsVars.color.surfaceBorder}`,
    borderRadius: dsVars.border.radius.sm,
    backgroundColor: dsVars.color.surfacePrimary,
    color: dsVars.color.onSurfacePrimary,
    outline: "none",
    selectors: {
        "&:focus": {
            borderColor: dsVars.color.brandBase,
        },
        "&:disabled": {
            backgroundColor: dsVars.color.surfaceSecondary,
            cursor: "not-allowed",
        },
    },
});

export const searchResultReplaceButton = style({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "4.75rem",
    height: "28px",
    padding: `0 ${dsVars.spacing.sm}`,
    border: `1px solid ${dsVars.button.primary.border}`,
    borderRadius: dsVars.border.radius.sm,
    backgroundColor: dsVars.button.primary.surface,
    color: dsVars.button.primary.onSurface,
    fontSize: dsVars.typography.bodySmallest.fontSize,
    fontWeight: 600,
    cursor: "pointer",
    flexShrink: 0,
    selectors: {
        "&:hover:not(:disabled)": {
            backgroundColor: dsVars.button.primary.surfaceHover,
        },
        "&:disabled": {
            opacity: 0.5,
            cursor: "not-allowed",
            backgroundColor: dsVars.color.surfaceSecondary,
            borderColor: dsVars.color.surfaceBorder,
            color: dsVars.color.onSurfaceTertiary,
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
    color: dsVars.color.onSurfaceTertiary,
});

export const searchReplacementArrow = style({
    color: dsVars.color.onSurfaceTertiary,
    fontWeight: 600,
});

export const searchReplacementNew = style({
    color: dsVars.color.brandBase,
    fontWeight: 700,
});
