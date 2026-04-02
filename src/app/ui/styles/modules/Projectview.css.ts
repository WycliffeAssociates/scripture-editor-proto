// src/app/ui/styles/modules/Projectview.css.ts

import { style } from "@vanilla-extract/css";
import { mediaQuery } from "@/app/ui/styles/breakpoints.ts";
import { dsVars } from "@/app/ui/styles/designSystem.css.ts";

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
            backgroundColor: dsVars.color.surfacePrimary,
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
            backgroundColor: dsVars.color.surfacePrimary,
        },
    },
});

export const workspaceMain = style({
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    backgroundColor: dsVars.color.surfacePrimary,
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

export const desktopSidebar = style({
    display: "none",
    "@media": {
        [mediaQuery.up("lg")]: {
            display: "flex",
            flexDirection: "column",
            minHeight: "100dvh",
            height: "100dvh",
            backgroundColor: dsVars.color.appSidebarSurface,
            color: dsVars.color.appSidebarOnSurface,
            padding: dsVars.spacing.md,
            gap: dsVars.spacing.md,
            borderRight: `1px solid ${dsVars.color.appSidebarBorder}`,
        },
    },
});

export const sidebarTop = style({
    flex: "0 0 auto",
});

export const projectPickerCard = style({
    width: "100%",
    textAlign: "left",
    border: `1px solid ${dsVars.color.appSidebarBorder}`,
    backgroundColor: dsVars.color.appSidebarSurfaceHover,
    color: dsVars.color.appSidebarOnSurface,
    borderRadius: dsVars.border.radius.lg,
    padding: `${dsVars.spacing.md} ${dsVars.spacing.md}`,
    cursor: "pointer",
    selectors: {
        "&:hover": {
            backgroundColor: dsVars.color.appSidebarSurfaceActive,
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
    fontSize: dsVars.typography.bodyNormal.fontSize,
    fontWeight: 700,
    lineHeight: 1.2,
});

export const projectPickerMeta = style({
    marginTop: dsVars.spacing.xs,
    fontSize: dsVars.typography.bodySmallest.fontSize,
    color: dsVars.color.appSidebarOnSurfaceMuted,
});

export const sidebarBooks = style({
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: dsVars.spacing.xs,
    paddingRight: "0.125rem",
});

export const sidebarSlotFill = style({
    flex: 1,
    minHeight: "100%",
    borderRadius: dsVars.border.radius.lg,
    backgroundColor: dsVars.color.appSidebarSurfaceHover,
    border: `1px solid ${dsVars.color.appSidebarBorder}`,
});

export const sidebarBottom = style({
    flex: "0 0 auto",
    display: "flex",
    flexDirection: "column",
    gap: dsVars.spacing.xs,
    paddingTop: dsVars.spacing.sm,
    borderTop: `1px solid ${dsVars.color.appSidebarBorder}`,
});

export const sidebarAction = style({
    width: "100%",
    minHeight: "2.75rem",
    padding: `${dsVars.spacing.sm} ${dsVars.spacing.md}`,
    backgroundColor: "transparent",
    color: dsVars.color.appSidebarOnSurfaceMuted,
    border: "1px solid transparent",
    borderRadius: dsVars.border.radius.md,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: dsVars.spacing.sm,
    textAlign: "left",
    selectors: {
        "&:hover": {
            backgroundColor: dsVars.color.appSidebarSurfaceHover,
            color: dsVars.color.appSidebarOnSurface,
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
    paddingInline: 0,
    paddingBlock: dsVars.spacing.lg,
    "@media": {
        [mediaQuery.up("lg")]: {
            paddingInline: 0,
            paddingBlock: dsVars.spacing.lg,
        },
    },
});

export const workspacePaneStack = style({
    position: "relative",
    minWidth: 0,
    minHeight: 0,
    height: "100%",
});

export const workspacePaneVisible = style({
    position: "relative",
    minWidth: 0,
    minHeight: 0,
    height: "100%",
    visibility: "visible",
    pointerEvents: "auto",
});

export const workspacePaneHidden = style({
    position: "absolute",
    inset: 0,
    minWidth: 0,
    minHeight: 0,
    height: "100%",
    visibility: "hidden",
    pointerEvents: "none",
});

export const editor = style({
    width: "100%",
    height: "100%",
    minHeight: 0,
    position: "relative",
});

export const editorPaneHeader = style({
    display: "flex",
    justifyContent: "flex-end",
    width: "100%",
    paddingInline: dsVars.spacing.lg,
    paddingBlockEnd: dsVars.spacing.sm,
});

export const referenceToggleButton = style({
    border: `1px solid ${dsVars.color.surfaceBorder}`,
    backgroundColor: dsVars.color.surfacePrimary,
    color: dsVars.color.onSurfacePrimary,
    borderRadius: dsVars.border.radius.md,
    padding: `${dsVars.spacing.sm} ${dsVars.spacing.md}`,
    cursor: "pointer",
    selectors: {
        "&:hover": {
            borderColor: dsVars.color.brandBase,
        },
    },
});

// Mobile Editors (Tab Switching)
export const mobileEditorsContainer = style({
    display: "grid",
    gap: dsVars.spacing.md,
    padding: dsVars.spacing.md,
    minHeight: 0,
});
export const desktopContentGrid = style({
    display: "grid",
    gridTemplateColumns: "1fr",
    alignItems: "stretch",
    gap: dsVars.spacing.md,
    padding: 0,
    minHeight: 0,
    "@media": {
        [mediaQuery.up("lg")]: {
            flex: "1 1 auto",
            minHeight: 0,
            overflow: "hidden",
            gap: dsVars.spacing.lg,
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
                gridTemplateColumns: "minmax(20rem, 24rem) minmax(0, 1fr)",
            },
        },
    },
]);

export const editorMainSmall = style({
    minHeight: 0,
    height: "100%",
    backgroundColor: dsVars.color.surfacePrimary,
});

export const editorReferenceSmall = style({
    minHeight: "16rem",
    backgroundColor: dsVars.color.surfacePrimary,
    borderTop: `1px solid ${dsVars.color.surfaceBorder}`,
});

export const referenceColumn = style({
    minWidth: 0,
    width: "100%",
    minHeight: 0,
    height: "100%",
    overflow: "hidden",
    backgroundColor: dsVars.color.surfacePrimary,
    "@media": {
        [mediaQuery.up("lg")]: {
            height: "100%",
            minHeight: 0,
            borderRight: `1px solid ${dsVars.color.surfaceBorder}`,
            backgroundColor: dsVars.color.surfacePrimary,
        },
    },
});

export const referencePanePlaceholder = style({
    minHeight: "100%",
    padding: dsVars.spacing.lg,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    color: dsVars.color.onSurfaceSecondary,
});

export const editorPanePlaceholder = style({
    minHeight: 0,
    height: "100%",
    width: "100%",
    maxWidth: "80ch",
    marginInline: "auto",
    paddingInline: dsVars.spacing.lg,
    paddingBlock: dsVars.spacing.lg,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    color: dsVars.color.onSurfacePrimary,
});

export const settingsPane = style({
    width: "100%",
    minWidth: 0,
    minHeight: 0,
    height: "100%",
    paddingInline: dsVars.spacing.lg,
    paddingBlock: dsVars.spacing.lg,
    display: "flex",
    flexDirection: "column",
    backgroundColor: dsVars.color.surfacePrimary,
    color: dsVars.color.onSurfacePrimary,
});

export const settingsPaneHeader = style({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: dsVars.spacing.md,
    paddingBlockEnd: dsVars.spacing.md,
});

export const settingsPaneTitle = style({
    fontSize: dsVars.typography.h4.fontSize,
    fontWeight: dsVars.typography.h4.fontWeight,
    lineHeight: dsVars.typography.h4.lineHeight,
});

export const settingsPaneBody = style({
    minHeight: 0,
    height: "100%",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    color: dsVars.color.onSurfaceSecondary,
});

export const bottomPanel = style({
    position: "relative",
    minHeight: 0,
    borderTop: `1px solid ${dsVars.color.surfaceBorder}`,
    backgroundColor: dsVars.color.surfaceSecondary,
    overflow: "hidden",
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
            borderRadius: dsVars.border.radius.full,
            backgroundColor: dsVars.color.surfaceBorder,
        },
    },
});

export const bottomPanelHeader = style({
    minHeight: 0,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "start",
    gap: dsVars.spacing.md,
    paddingInline: dsVars.spacing.sm,
    paddingBlock: `${dsVars.spacing.md} ${dsVars.spacing.xs}`,
});

export const bottomPanelTabsRoot = style({
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
});

export const bottomPanelTabsList = style({
    display: "flex",
    alignItems: "center",
    gap: dsVars.spacing.xs,
    paddingTop: "0.125rem",
});

export const bottomPanelTabTrigger = style({
    border: "1px solid transparent",
    background: "transparent",
    color: dsVars.color.onSurfaceSecondary,
    borderRadius: dsVars.border.radius.sm,
    height: "2rem",
    paddingInline: dsVars.spacing.sm,
    display: "inline-flex",
    alignItems: "center",
    gap: dsVars.spacing.xs,
    fontSize: dsVars.typography.bodySmall.fontSize,
    lineHeight: 1,
    fontWeight: 600,
    cursor: "pointer",
    selectors: {
        "&[data-selected]": {
            backgroundColor: dsVars.color.surfacePrimary,
            color: dsVars.color.onSurfacePrimary,
            borderColor: dsVars.color.surfaceBorder,
        },
        "&:hover": {
            backgroundColor: dsVars.color.surfacePrimary,
            color: dsVars.color.onSurfacePrimary,
        },
        "&:focus-visible": {
            outline: `2px solid ${dsVars.color.brandBase}`,
            outlineOffset: 0,
        },
    },
});

export const bottomPanelTabCount = style({
    minWidth: "1.25rem",
    height: "1.25rem",
    paddingInline: "0.25rem",
    borderRadius: dsVars.border.radius.full,
    backgroundColor: dsVars.color.brandBase,
    color: dsVars.color.onSurfaceInvert,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: dsVars.typography.bodySmallest.fontSize,
    lineHeight: 1,
    fontWeight: 700,
});

export const bottomPanelTabPanel = style({
    minHeight: 0,
    outline: "none",
    selectors: {
        "&[hidden]": {
            display: "none",
        },
    },
});

export const bottomPanelContent = style({
    minHeight: 0,
    maxHeight: "16rem",
    overflowY: "auto",
    paddingTop: dsVars.spacing.xs,
    paddingInline: dsVars.spacing.xs,
    paddingBottom: dsVars.spacing.xs,
});

export const bottomPanelList = style({
    display: "flex",
    flexDirection: "column",
    gap: 0,
});

export const bottomPanelGroup = style({
    display: "flex",
    flexDirection: "column",
});

export const bottomPanelGroupHeader = style({
    minHeight: "1.75rem",
    display: "grid",
    gridTemplateColumns: "auto auto minmax(0, auto) auto",
    alignItems: "center",
    gap: dsVars.spacing.sm,
    paddingInline: 0,
    color: dsVars.color.onSurfaceSecondary,
    fontSize: dsVars.typography.bodySmall.fontSize,
    borderBottom: `1px solid ${dsVars.color.surfaceBorder}`,
});

export const bottomPanelGroupChevron = style({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: dsVars.color.onSurfaceTertiary,
});

export const bottomPanelGroupTitle = style({
    color: dsVars.color.onSurfacePrimary,
    fontWeight: 600,
});

export const bottomPanelGroupLocation = style({
    fontSize: dsVars.typography.bodySmall.fontSize,
    color: dsVars.color.onSurfaceSecondary,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
});

export const bottomPanelGroupCount = style({
    color: dsVars.color.onSurfaceSecondary,
    fontWeight: 600,
});

export const bottomPanelRow = style({
    minHeight: "2rem",
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr) auto",
    alignItems: "center",
    gap: dsVars.spacing.sm,
    paddingInline: 0,
    borderBottom: `1px solid ${dsVars.color.surfaceBorder}`,
    selectors: {
        "&:hover": {
            backgroundColor: dsVars.color.surfacePrimary,
        },
    },
});

export const bottomPanelRowIcon = style({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: dsVars.color.onSurfaceSecondary,
});

const bottomPanelRowMessageBase = style({
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: dsVars.typography.bodySmall.fontSize,
    lineHeight: dsVars.typography.bodySmall.lineHeight,
});

export const bottomPanelRowMessage = style([
    bottomPanelRowMessageBase,
    {
        color: dsVars.color.onSurfacePrimary,
    },
]);

export const bottomPanelRowMessageAccent = style([
    bottomPanelRowMessageBase,
    {
        color: dsVars.color.brandBase,
    },
]);

export const bottomPanelRowMeta = style({
    fontSize: dsVars.typography.bodySmallest.fontSize,
    lineHeight: dsVars.typography.bodySmallest.lineHeight,
    color: dsVars.color.onSurfaceSecondary,
    whiteSpace: "nowrap",
    paddingLeft: dsVars.spacing.sm,
});

export const referenceStickyNav = style({
    padding: dsVars.spacing.md,
    display: "flex",
    borderBottom: `1px solid ${dsVars.color.surfaceBorder}`,
    backgroundColor: dsVars.color.surfacePrimary,
});

export const referenceStickyNavRow = style({
    display: "flex",
    alignItems: "center",
    gap: dsVars.spacing.md,
    flexWrap: "wrap",
});
