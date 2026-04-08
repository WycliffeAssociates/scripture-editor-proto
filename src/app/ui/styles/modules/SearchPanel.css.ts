import { globalStyle, keyframes, style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

// Main panel container
export const searchPanel = style({
    display: "grid",
    gridTemplateRows: "auto 1fr",
    width: "100%",
    height: "100dvh",
    minHeight: 0,
    backgroundColor: vars.color.surfacePrimary,
    borderLeft: `1px solid ${vars.color.surfaceBorder}`,
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
    width: "28px",
    height: "28px",
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
    padding: vars.spacing.md,
    borderBottom: `1px solid ${vars.color.surfaceBorder}`,
    backgroundColor: vars.color.surfaceSecondary,
});

export const searchPanelHeaderTop = style({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: vars.spacing.sm,
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
    width: "28px",
    height: "28px",
    border: "none",
    borderRadius: vars.border.radius.sm,
    backgroundColor: "transparent",
    color: vars.color.onSurfaceSecondary,
    cursor: "pointer",
    transition: "background-color 0.15s ease",
    selectors: {
        "&:hover": {
            backgroundColor: vars.color.surfaceSecondary,
        },
    },
});

// Controls
export const searchControls = style({
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.sm,
});

export const searchInputRow = style({
    display: "flex",
    gap: vars.spacing.xs,
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
    left: vars.spacing.sm,
    color: vars.color.onSurfaceTertiary,
    pointerEvents: "none",
});

export const searchInput = style({
    width: "100%",
    padding: `${vars.spacing.xs} ${vars.spacing.sm} ${vars.spacing.xs} calc(${vars.spacing.sm} + ${vars.spacing.sm} + 16px)`,
    fontSize: vars.typography.bodySmall.fontSize,
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
    right: vars.spacing.xs,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
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
    gap: vars.spacing.xs,
});

export const searchNavButton = style({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
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
    justifyContent: "space-between",
    alignItems: "center",
    gap: vars.spacing.sm,
});

export const searchStats = style({
    fontSize: vars.typography.bodySmallest.fontSize,
    color: vars.color.onSurfaceSecondary,
    fontWeight: 500,
});

export const searchToggles = style({
    display: "flex",
    gap: vars.spacing.xs,
});

export const toggleButton = style({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    border: `1px solid ${vars.color.surfaceBorder}`,
    borderRadius: vars.border.radius.sm,
    backgroundColor: vars.color.surfacePrimary,
    color: vars.color.onSurfaceSecondary,
    cursor: "pointer",
    transition: "all 0.15s ease",
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
    backgroundColor: vars.button.primary.surface,
    borderColor: vars.button.primary.border,
    color: vars.button.primary.onSurface,
    selectors: {
        "&:hover": {
            backgroundColor: vars.button.primary.surfaceHover,
        },
    },
});

export const searchReplaceRow = style({
    display: "flex",
    gap: vars.spacing.xs,
});

export const searchModeRow = style({
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.xs,
    flexWrap: "wrap",
});

export const searchModeLabel = style({
    fontSize: vars.typography.bodySmallest.fontSize,
    fontWeight: 600,
    color: vars.color.onSurfaceSecondary,
});

export const searchModeSelect = style({
    width: "8.5rem",
    minWidth: "8.5rem",
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
    minHeight: "1.75rem",
    padding: `0 ${vars.spacing.xs}`,
    borderRadius: vars.border.radius.sm,
    gap: vars.spacing.xs,
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
        width: "14px",
        height: "14px",
    },
);

globalStyle(`${searchModeSelect} [data-scope="select"][data-part="value"]`, {
    fontSize: vars.typography.bodySmallest.fontSize,
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
    padding: `${vars.spacing.xs} ${vars.spacing.sm}`,
    fontSize: vars.typography.bodySmall.fontSize,
    border: `1px solid ${vars.color.surfaceBorder}`,
    borderRadius: vars.border.radius.md,
    backgroundColor: vars.color.surfacePrimary,
    color: vars.color.onSurfacePrimary,
    outline: "none",
    selectors: {
        "&:focus": {
            borderColor: vars.color.brandBase,
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
    padding: 0,
});

export const searchResultsInner = style({
    padding: vars.spacing.sm,
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
    fontSize: "32px",
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
});

// Result item
export const searchResultItem = style({
    padding: vars.spacing.sm,
    borderBottom: `1px solid ${vars.color.surfaceBorder}`,
    backgroundColor: vars.color.surfacePrimary,
    cursor: "pointer",
    transition: "background-color 0.15s ease",
    selectors: {
        "&:hover": {
            backgroundColor: vars.color.surfaceSecondary,
        },
    },
});

export const searchResultItemActive = style({
    backgroundColor: vars.toggleGroup.itemSelectedSurface,
    borderLeft: `3px solid ${vars.color.brandBase}`,
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
    fontSize: vars.typography.bodySmallest.fontSize,
    fontWeight: 600,
    color: vars.color.onSurfaceSecondary,
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

export const searchResultPreview = style({
    fontSize: vars.typography.bodySmall.fontSize,
    color: vars.color.onSurfacePrimary,
    lineHeight: 1.5,
    marginBottom: vars.spacing.sm,
    wordBreak: "break-word",
});

export const searchResultPair = style({
    display: "grid",
    gap: vars.spacing.sm,
});

export const searchResultPairBlock = style({
    display: "grid",
    gap: vars.spacing.xs,
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
    display: "flex",
    gap: vars.spacing.xs,
    alignItems: "center",
    marginTop: vars.spacing.xs,
});

export const searchResultReplaceInput = style({
    flex: 1,
    minWidth: 0,
    padding: `${vars.spacing.xs} ${vars.spacing.sm}`,
    fontSize: vars.typography.bodySmallest.fontSize,
    border: `1px solid ${vars.color.surfaceBorder}`,
    borderRadius: vars.border.radius.sm,
    backgroundColor: vars.color.surfacePrimary,
    color: vars.color.onSurfacePrimary,
    outline: "none",
    selectors: {
        "&:focus": {
            borderColor: vars.color.brandBase,
        },
        "&:disabled": {
            backgroundColor: vars.color.surfaceSecondary,
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
    padding: `0 ${vars.spacing.sm}`,
    border: `1px solid ${vars.button.primary.border}`,
    borderRadius: vars.border.radius.sm,
    backgroundColor: vars.button.primary.surface,
    color: vars.button.primary.onSurface,
    fontSize: vars.typography.bodySmallest.fontSize,
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
