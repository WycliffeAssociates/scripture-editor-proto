// src/app/ui/styles/modules/Projectview.css.ts

import { style } from "@vanilla-extract/css";
import { mediaQuery } from "@/app/ui/styles/breakpoints.ts";
import { vars } from "@/app/ui/styles/designSystem.css.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";

// Layout
export const appLayout = style({
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
    "@media": {
        [mediaQuery.up("lg")]: {
            display: "grid",
            gridTemplateColumns: "16rem minmax(0, 1fr)",
            minHeight: "100dvh",
            height: "100dvh",
            overflow: "hidden",
            backgroundColor: vars.color.surfacePrimary,
        },
    },
});

export const appLayoutWithReference = style({
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
    "@media": {
        [mediaQuery.up("lg")]: {
            display: "grid",
            gridTemplateColumns: "16rem minmax(0, 1fr)",
            minHeight: "100dvh",
            height: "100dvh",
            overflow: "hidden",
            backgroundColor: vars.color.surfacePrimary,
        },
    },
});

export const workspaceMain = style({
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    backgroundColor: vars.color.surfaceCanvas,
    "@media": {
        [mediaQuery.up("lg")]: {
            minHeight: "100dvh",
            height: "100dvh",
            overflow: "hidden",
        },
    },
});

export const workspaceShellDesktop = style({
    flex: "1 1 auto",
    minHeight: 0,
    height: "100%",
    display: "grid",
    gridTemplateRows: "minmax(0, 1fr) auto",
});

export const workspaceShellMobile = style({
    minHeight: 0,
    display: "grid",
    gridTemplateRows: "minmax(0, 1fr) auto",
});

export const workspaceEditorsStage = style({
    position: "relative",
    minHeight: 0,
    minWidth: 0,
    height: "100%",
    // The canvas the toolbar bar + editor card float on. A top auto row holds
    // the full-width toolbar; the 1fr row below holds the reference + editor
    // columns, each its own scroll container.
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr)",
    backgroundColor: vars.color.surfaceCanvas,
    "@media": {
        [mediaQuery.up("lg")]: {
            gap: vars.spacing.md,
            padding: vars.spacing.md,
        },
    },
});

// Wrapper for the hoisted toolbar; keeps the bar a single full-width row that
// spans both columns beneath it.
export const editorToolbarRow = style({
    minWidth: 0,
    display: "flex",
});

export const desktopSidebar = style({
    display: "none",
    "@media": {
        [mediaQuery.up("lg")]: {
            display: "flex",
            flexDirection: "column",
            minHeight: "100dvh",
            height: "100dvh",
            backgroundColor: vars.color.appSidebarSurface,
            color: vars.color.appSidebarOnSurface,
            padding: vars.spacing.md,
            gap: vars.spacing.md,
            borderRight: `1px solid ${vars.color.appSidebarBorder}`,
        },
    },
});

export const sidebarTop = style({
    flex: "0 0 auto",
});

export const projectPickerCard = style({
    width: "100%",
    textAlign: "left",
    border: `1px solid ${vars.color.appSidebarBorder}`,
    backgroundColor: vars.color.appSidebarSurfaceHover,
    color: vars.color.appSidebarOnSurface,
    borderRadius: vars.border.radius.lg,
    padding: `${vars.spacing.md} ${vars.spacing.md}`,
    cursor: "pointer",
    selectors: {
        "&:hover": {
            backgroundColor: vars.color.appSidebarSurfaceActive,
        },
    },
});

export const sidebarSlotCard = style([
    projectPickerCard,
    {
        minHeight: "4.75rem",
    },
]);

export const projectPickerName = style({
    fontSize: vars.typography.bodyNormal.fontSize,
    fontWeight: 700,
    lineHeight: 1.2,
});

export const projectPickerMeta = style({
    marginTop: vars.spacing.xs,
    fontSize: vars.typography.bodySmallest.fontSize,
    color: vars.color.appSidebarOnSurfaceMuted,
});

export const sidebarBooks = style({
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.xs,
    paddingRight: "0.125rem",
});

export const sidebarSlotFill = style({
    flex: 1,
    minHeight: "100%",
    borderRadius: vars.border.radius.lg,
    backgroundColor: vars.color.appSidebarSurfaceHover,
    border: `1px solid ${vars.color.appSidebarBorder}`,
});

export const sidebarBottom = style({
    flex: "0 0 auto",
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.xs,
    paddingTop: vars.spacing.sm,
    borderTop: `1px solid ${vars.color.appSidebarBorder}`,
});

export const sidebarAction = style({
    width: "100%",
    minHeight: "2.75rem",
    padding: `${vars.spacing.sm} ${vars.spacing.md}`,
    backgroundColor: "transparent",
    color: vars.color.appSidebarOnSurfaceMuted,
    border: "1px solid transparent",
    borderRadius: vars.border.radius.md,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.sm,
    textAlign: "left",
    selectors: {
        "&:hover": {
            backgroundColor: vars.color.appSidebarSurfaceHover,
            color: vars.color.appSidebarOnSurface,
        },
    },
});

export const sidebarActionIcon = style({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
});

export const editorWrapperDesktop = style({
    width: "100%",
    minWidth: 0,
    minHeight: 0,
    height: "100%",
    // The editor column's own scroll container, sitting on the canvas beneath
    // the shared toolbar. The white editor card floats inside it so its rounded
    // boundary — the right-click action-palette target — reads clearly against
    // the canvas. This column scrolls; the reference column scrolls separately.
    overflowY: "auto",
    backgroundColor: vars.color.surfaceCanvas,
});

export const workspacePaneStack = style({
    position: "relative",
    minWidth: 0,
    minHeight: 0,
    height: "100%",
});

export const workspaceEditorPane = style({
    position: "relative",
    minWidth: 0,
    minHeight: 0,
    height: "100%",
});

export const workspaceOverlayPane = style({
    position: "absolute",
    inset: 0,
    minWidth: 0,
    minHeight: 0,
    height: "100%",
    zIndex: zLayer.editorOverlayPane,
});

export const referenceToggleButton = style({
    border: `1px solid ${vars.color.surfaceBorder}`,
    backgroundColor: vars.color.surfacePrimary,
    color: vars.color.onSurfacePrimary,
    borderRadius: vars.border.radius.md,
    padding: `${vars.spacing.sm} ${vars.spacing.md}`,
    cursor: "pointer",
    selectors: {
        "&:hover": {
            borderColor: vars.color.brandBase,
        },
    },
});

// Mobile Editors (Tab Switching)
export const mobileEditorsContainer = style({
    display: "grid",
    gap: vars.spacing.md,
    padding: vars.spacing.md,
    minHeight: 0,
});
export const desktopContentGrid = style({
    display: "grid",
    gridTemplateColumns: "1fr",
    alignItems: "stretch",
    gap: vars.spacing.md,
    padding: 0,
    minHeight: 0,
    "@media": {
        [mediaQuery.up("lg")]: {
            flex: "1 1 auto",
            minHeight: 0,
            gap: vars.spacing.lg,
            alignItems: "stretch",
            gridTemplateColumns: "minmax(0, 1fr)",
        },
    },
});

export const desktopContentGridWithReference = style([
    desktopContentGrid,
    {
        "@media": {
            [mediaQuery.up("lg")]: {
                gridTemplateColumns: "minmax(20rem, 28rem) minmax(0, 1fr)",
            },
        },
    },
]);

export const editorMainSmall = style({
    minHeight: 0,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    backgroundColor: vars.color.surfacePrimary,
});

export const editorReferenceSmall = style({
    minHeight: "16rem",
    backgroundColor: vars.color.surfacePrimary,
    borderTop: `1px solid ${vars.color.surfaceBorder}`,
});

export const referenceColumn = style({
    minWidth: 0,
    width: "100%",
    height: "100%",
    display: "grid",
    // Resource picker (auto) above the scripture text (1fr). Sits directly on
    // the canvas with no card/border; the text area is its own scroll container
    // so switching chapters never jumps the layout.
    gridTemplateRows: "auto minmax(0, 1fr)",
    gap: vars.spacing.md,
    minHeight: 0,
    overflow: "hidden",
    backgroundColor: "transparent",
});

export const referencePanePlaceholder = style({
    minHeight: "100%",
    padding: vars.spacing.lg,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    color: vars.color.onSurfaceSecondary,
});

export const editorPanePlaceholder = style({
    minHeight: 0,
    height: "100%",
    width: "100%",
    maxWidth: "80ch",
    marginInline: "auto",
    paddingInline: vars.spacing.lg,
    paddingBlock: vars.spacing.lg,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    color: vars.color.onSurfacePrimary,
});

export const settingsPane = style({
    width: "100%",
    minWidth: 0,
    minHeight: 0,
    height: "100%",
    paddingInline: vars.spacing.lg,
    paddingBlock: vars.spacing.lg,
    display: "flex",
    flexDirection: "column",
    backgroundColor: vars.color.surfacePrimary,
    color: vars.color.onSurfacePrimary,
});

export const settingsPaneHeader = style({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars.spacing.md,
    paddingBlockEnd: vars.spacing.md,
});

export const settingsPaneTitle = style({
    fontSize: vars.typography.h4.fontSize,
    fontWeight: vars.typography.h4.fontWeight,
    lineHeight: vars.typography.h4.lineHeight,
});

export const settingsPaneBody = style({
    minHeight: 0,
    height: "100%",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    color: vars.color.onSurfaceSecondary,
});

export const bottomPanel = style({
    position: "relative",
    minHeight: 0,
    borderTop: `1px solid ${vars.color.surfaceBorder}`,
    backgroundColor: vars.color.surfaceSecondary,
    overflow: "hidden",
    zIndex: zLayer.referencePanelBottom,
});

export const bottomPanelResizeHandle = style({
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "0.5rem",
    border: "none",
    padding: 0,
    margin: 0,
    background: "transparent",
    cursor: "ns-resize",
    selectors: {
        "&::after": {
            content: '""',
            position: "absolute",
            top: "0.125rem",
            left: "50%",
            transform: "translateX(-50%)",
            width: "3rem",
            height: "2px",
            borderRadius: vars.border.radius.full,
            backgroundColor: vars.color.surfaceBorder,
        },
    },
});

export const bottomPanelHeader = style({
    height: "100%",
    minHeight: 0,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "start",
    gap: vars.spacing.md,
    paddingInline: vars.spacing.sm,
    paddingBlock: `${vars.spacing.md} ${vars.spacing.xs}`,
});

export const bottomPanelTitle = style({
    fontSize: vars.typography.bodySmall.fontSize,
    fontWeight: 600,
    color: vars.color.onSurfacePrimary,
    paddingTop: "0.375rem",
});

export const bottomPanelBody = style({
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
});

export const bottomPanelTabsRoot = style({
    flex: 1,
    minWidth: 0,
    display: "grid",
    gridTemplateRows: "auto 1fr",
    height: "100%",
    minHeight: 0,
});

export const bottomPanelTabsList = style({
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.xs,
    paddingTop: "0.125rem",
});

export const bottomPanelTabTrigger = style({
    border: "1px solid transparent",
    background: "transparent",
    color: vars.color.onSurfaceSecondary,
    borderRadius: vars.border.radius.sm,
    height: "2rem",
    paddingInline: vars.spacing.sm,
    display: "inline-flex",
    alignItems: "center",
    gap: vars.spacing.xs,
    fontSize: vars.typography.bodySmall.fontSize,
    lineHeight: 1,
    fontWeight: 600,
    cursor: "pointer",
    selectors: {
        "&[data-selected]": {
            backgroundColor: vars.color.surfacePrimary,
            color: vars.color.onSurfacePrimary,
            borderColor: vars.color.surfaceBorder,
        },
        "&:hover": {
            backgroundColor: vars.color.surfacePrimary,
            color: vars.color.onSurfacePrimary,
        },
        "&:focus-visible": {
            outline: `2px solid ${vars.color.brandBase}`,
            outlineOffset: 0,
        },
    },
});

export const bottomPanelTabCount = style({
    minWidth: "1.25rem",
    height: "1.25rem",
    paddingInline: "0.25rem",
    borderRadius: vars.border.radius.full,
    backgroundColor: vars.color.brandBase,
    color: vars.color.onSurfaceInvert,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: vars.typography.bodySmallest.fontSize,
    lineHeight: 1,
    fontWeight: 700,
});

export const bottomPanelTabPanel = style({
    flex: 1,
    minHeight: 0,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    outline: "none",
    selectors: {
        "&[hidden]": {
            display: "none",
        },
    },
});

export const bottomPanelContent = style({
    flex: 1,
    height: "100%",
    minHeight: 0,
    overflow: "hidden",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: vars.spacing.xs,
    paddingTop: vars.spacing.xs,
    paddingInline: vars.spacing.xs,
    paddingBottom: vars.spacing.xs,
});

export const bottomPanelEmptyState = style({
    minHeight: "6rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: vars.spacing.lg,
    color: vars.color.onSurfaceSecondary,
    fontSize: vars.typography.bodySmall.fontSize,
});

export const bottomPanelList = style({
    display: "flex",
    flexDirection: "column",
    gap: 0,
});

export const lintIssueList = style({
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.sm,
});

export const lintAccordionRoot = style({
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    gap: vars.spacing.sm,
});

export const lintFilterRibbon = style({
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.xs,
    minWidth: 0,
    paddingInline: vars.spacing.xs,
    paddingBottom: "0.125rem",
    flex: "0 0 auto",
});

export const lintFilterTriggerLabel = style({
    display: "inline-flex",
    alignItems: "center",
    gap: vars.spacing.xs,
});

export const lintFilterTrigger = style({
    minWidth: "6.75rem",
    minHeight: "1.75rem",
    paddingInline: vars.spacing.xs,
    gap: "0.25rem",
    justifyContent: "space-between",
    fontSize: vars.typography.bodySmallest.fontSize,
});

export const lintFilterTriggerValue = style({
    color: vars.color.onSurfaceSecondary,
    fontSize: vars.typography.bodySmallest.fontSize,
    fontWeight: 700,
    minWidth: "2ch",
    textAlign: "right",
});

export const lintFilterMenuPopup = style({
    backgroundColor: vars.color.surfacePrimary,
    borderRadius: vars.border.radius.sm,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    boxShadow: vars.shadow.large,
    padding: "0.125rem",
    minWidth: "9.5rem",
    maxHeight: "12.5rem",
    overflowY: "auto",
    overflowX: "hidden",
    scrollbarWidth: "none",
    pointerEvents: "auto",
    selectors: {
        "&::-webkit-scrollbar": {
            display: "none",
        },
    },
});

export const lintFilterMenuPositioner = style({
    zIndex: zLayer.editorMenuPositioner,
});

export const lintFilterMenuList = style({
    display: "flex",
    flexDirection: "column",
    gap: "1px",
});

export const lintFilterMenuItem = style({
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
    selectors: {
        "&:hover": {
            backgroundColor: vars.button.tertiary.surfaceHover,
        },
        "&[data-highlighted]": {
            backgroundColor: vars.button.tertiary.surfaceHover,
        },
        "&:focus-visible": {
            outline: "none",
            boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
        },
    },
});

export const lintFilterMenuIndicator = style({
    width: "0.875rem",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: vars.color.brandBase,
});

export const lintIssuesScrollArea = style({
    minWidth: 0,
    flex: "1 1 auto",
    height: "100%",
    maxHeight: "240px",
});

export const lintIssuesViewport = style({
    minWidth: 0,
    height: "100%",
    paddingInline: "4px",
});
export const lintListScrollbar = style({
    display: "flex",
    justifyContent: "center",
    backgroundColor: vars.color.surfaceTertiary,
    width: "0.25rem",
    borderRadius: vars.border.radius.sm,
    transition: "opacity 150ms",
    pointerEvents: "none",
    selectors: {
        "&[data-hovering]": {
            opacity: 1,
            pointerEvents: "auto",
        },

        "&[data-scrolling]": {
            opacity: 1,
            pointerEvents: "auto",
            transitionDuration: "0ms",
        },

        "&::before": {
            content: "",
            position: "absolute",
            width: "1.25rem",
            height: "100%",
        },
    },
});

export const lintScrollbarThumb = style({
    backgroundColor: vars.color.brandDark,
    width: "100%",
    borderRadius: "inherit",
});

export const lintIssueVirtualInner = style({
    width: "100%",
    position: "relative",
});

export const lintIssueVirtualRow = style({
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
});

export const lintIssueCard = style({
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "center",
    gap: vars.spacing.xs,
    minHeight: "2rem",
    padding: `0.125rem ${vars.spacing.xs}`,
    borderBottom: `1px solid ${vars.color.surfaceBorder}`,
    selectors: {
        "&:hover": {
            backgroundColor: vars.color.surfacePrimary,
        },
    },
});

export const lintIssueInline = style({
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    overflow: "hidden",
});

export const lintIssueLocation = style({
    color: vars.color.onSurfaceSecondary,
    fontSize: vars.typography.bodySmallest.fontSize,
    whiteSpace: "nowrap",
    flexShrink: 0,
});

export const lintIssueMessage = style({
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: vars.color.onSurfacePrimary,
    fontSize: vars.typography.bodySmallest.fontSize,
    lineHeight: 1.2,
});

export const lintIssueActions = style({
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    flexShrink: 0,
    justifyContent: "flex-end",
});

export const bottomPanelRow = style({
    minHeight: "2rem",
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr) auto",
    alignItems: "center",
    gap: vars.spacing.sm,
    paddingInline: 0,
    borderBottom: `1px solid ${vars.color.surfaceBorder}`,
    selectors: {
        "&:hover": {
            backgroundColor: vars.color.surfacePrimary,
        },
    },
});

export const bottomPanelRowIcon = style({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: vars.color.onSurfaceSecondary,
});

const bottomPanelRowMessageBase = style({
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars.typography.bodySmall.fontSize,
    lineHeight: vars.typography.bodySmall.lineHeight,
});

export const bottomPanelRowMessage = style([
    bottomPanelRowMessageBase,
    {
        color: vars.color.onSurfacePrimary,
    },
]);

export const bottomPanelRowMessageAccent = style([
    bottomPanelRowMessageBase,
    {
        color: vars.color.brandBase,
    },
]);

export const bottomPanelRowMeta = style({
    fontSize: vars.typography.bodySmallest.fontSize,
    lineHeight: vars.typography.bodySmallest.lineHeight,
    color: vars.color.onSurfaceSecondary,
    whiteSpace: "nowrap",
    paddingLeft: vars.spacing.sm,
});

export const cloudPanelHeader = style({
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: vars.spacing.md,
    padding: `${vars.spacing.xs} ${vars.spacing.sm} ${vars.spacing.sm}`,
    borderBottom: `1px solid ${vars.color.surfaceBorder}`,
});

export const cloudPanelHeaderText = style({
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.xs,
});

export const cloudPanelTitle = style({
    display: "inline-flex",
    alignItems: "center",
    gap: vars.spacing.xs,
    color: vars.color.onSurfacePrimary,
    fontSize: vars.typography.bodySmall.fontSize,
    fontWeight: 700,
});

export const cloudPanelStatusChip = style({
    borderRadius: vars.border.radius.full,
    border: `1px solid ${vars.color.surfaceBorder}`,
    backgroundColor: vars.color.surfacePrimary,
    color: vars.color.onSurfaceSecondary,
    fontSize: vars.typography.bodySmallest.fontSize,
    lineHeight: 1,
    fontWeight: 700,
    padding: `0.2rem 0.45rem`,
});

export const cloudPanelSubtitle = style({
    color: vars.color.onSurfaceSecondary,
    fontSize: vars.typography.bodySmall.fontSize,
    lineHeight: vars.typography.bodySmall.lineHeight,
    maxWidth: "48ch",
});

export const cloudPanelActions = style({
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.xs,
    flexWrap: "wrap",
    justifyContent: "flex-end",
});

export const cloudPanelMetaGrid = style({
    display: "grid",
    gap: vars.spacing.xs,
    height: "100%",
    overflowY: "auto",
    padding: `${vars.spacing.sm} 0 8rem`,
});

export const cloudPanelMetaRow = style({
    minHeight: "2rem",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "center",
    gap: vars.spacing.md,
    paddingInline: vars.spacing.xs,
    borderBottom: `1px solid ${vars.color.surfaceBorder}`,
});

export const cloudPanelMetaLabel = style({
    minWidth: 0,
    color: vars.color.onSurfaceSecondary,
    fontSize: vars.typography.bodySmallest.fontSize,
    lineHeight: vars.typography.bodySmallest.lineHeight,
});

export const cloudPanelMetaValue = style({
    display: "inline-flex",
    alignItems: "center",
    gap: vars.spacing.xs,
    color: vars.color.onSurfacePrimary,
    fontSize: vars.typography.bodySmall.fontSize,
    lineHeight: vars.typography.bodySmall.lineHeight,
    fontWeight: 600,
    whiteSpace: "nowrap",
});

export const cloudPanelMetaValueIcon = style({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: vars.color.onSurfaceSecondary,
});

export const versionsPanelHeader = style({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars.spacing.md,
    padding: `${vars.spacing.xs} ${vars.spacing.sm} ${vars.spacing.sm}`,
    borderBottom: `1px solid ${vars.color.surfaceBorder}`,
});

export const versionsPanelHeaderText = style({
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "0.125rem",
});

export const versionsPanelTitle = style({
    color: vars.color.onSurfacePrimary,
    fontSize: vars.typography.bodySmall.fontSize,
    fontWeight: 700,
});

export const versionsPanelSubtitle = style({
    color: vars.color.onSurfaceSecondary,
    fontSize: vars.typography.bodySmallest.fontSize,
});

export const versionsPanelActions = style({
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.xs,
    flexWrap: "wrap",
    justifyContent: "flex-end",
});

export const versionsList = style({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflowY: "auto",
});

const versionRowBase = style({
    width: "100%",
    border: "none",
    background: "transparent",
    textAlign: "left",
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.xs,
    padding: vars.spacing.sm,
    borderBottom: `1px solid ${vars.color.surfaceBorder}`,
    cursor: "pointer",
    selectors: {
        "&:hover": {
            backgroundColor: vars.color.surfacePrimary,
        },
        "&:focus-visible": {
            outline: `2px solid ${vars.color.brandBase}`,
            outlineOffset: -2,
        },
    },
});

export const versionRow = style([versionRowBase]);

export const versionRowSelected = style([
    versionRowBase,
    {
        backgroundColor: vars.color.surfacePrimary,
        boxShadow: `inset 2px 0 0 ${vars.color.brandBase}`,
    },
]);

export const versionRowHeader = style({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars.spacing.sm,
});

export const versionRowSubject = style({
    color: vars.color.onSurfacePrimary,
    fontSize: vars.typography.bodySmall.fontSize,
    fontWeight: 600,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
});

export const versionRowBadges = style({
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.xs,
    flexShrink: 0,
});

export const versionBadge = style({
    borderRadius: vars.border.radius.full,
    border: `1px solid ${vars.color.surfaceBorder}`,
    padding: `0 ${vars.spacing.xs}`,
    minHeight: "1.25rem",
    display: "inline-flex",
    alignItems: "center",
    color: vars.color.onSurfaceSecondary,
    fontSize: vars.typography.bodySmallest.fontSize,
    fontWeight: 600,
    backgroundColor: vars.color.surfaceSecondary,
});

export const versionRowMetaLine = style({
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.sm,
    flexWrap: "wrap",
});

export const versionMetaItem = style({
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    color: vars.color.onSurfaceSecondary,
    fontSize: vars.typography.bodySmallest.fontSize,
});

export const versionRowChapterSummary = style({
    display: "inline-flex",
    alignItems: "flex-start",
    gap: "0.25rem",
    color: vars.color.onSurfaceSecondary,
    fontSize: vars.typography.bodySmallest.fontSize,
    overflowWrap: "anywhere",
});
