import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const root = style({
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.sm,
    minHeight: "4.5rem",
    paddingBlock: vars.spacing.xs,
    paddingInline: vars.spacing.sm,
});

export const toolbarRow = style({
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: vars.spacing.sm,
    flexWrap: "wrap",
});

export const clusterRow = style({
    //   width: "100%",
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.sm,
    flexWrap: "wrap",
    minWidth: 0,
});

export const cluster = style({
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: vars.spacing.xs,
    flexWrap: "wrap",
    minWidth: 0,
});

export const leftCluster = style({
    flex: "1 1 auto",
});

export const rightCluster = style({
    flex: "0 1 auto",
});

export const rightControls = style({
    flex: "0 1 auto",
});

export const locationSeparator = style({
    width: "1px",
    height: "1rem",
    backgroundColor: vars.color.surfaceBorder,
    flex: "0 0 auto",
});

export const currentLocation = style({
    display: "flex",
    alignItems: "baseline",
    gap: vars.spacing.xs,
    minWidth: 0,
    whiteSpace: "nowrap",
    color: vars.color.onSurfaceSecondary,
    fontSize: vars.typography.bodySmallest.fontSize,
    lineHeight: vars.typography.bodySmallest.lineHeight,
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
});

export const currentLocationBook = style({
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "18rem",
});

export const currentLocationChapter = style({
    flex: "0 0 auto",
    color: vars.color.onSurfaceTertiary,
    fontVariantNumeric: "tabular-nums",
});

export const iconButton = style({
    width: "2rem",
    minWidth: "2rem",
    height: "2rem",
    padding: 0,
    borderRadius: vars.border.radius.md,
    border: `${vars.border.width.thin} solid transparent`,
    backgroundColor: "transparent",
    color: vars.color.onSurfaceSecondary,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition:
        "background-color 120ms ease, color 120ms ease, border-color 120ms ease",
    selectors: {
        "&:hover": {
            backgroundColor: vars.button.tertiary.surfaceHover,
            color: vars.color.onSurfacePrimary,
        },
        "&:focus-visible": {
            outline: "none",
            boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
        },
        "&:disabled": {
            cursor: "not-allowed",
            opacity: 0.45,
        },
    },
});

export const iconButtonActive = style({
    backgroundColor: vars.button.tertiary.surfaceActive,
    color: vars.color.brandBase,
});

export const tooltipPopup = style({
    backgroundColor: vars.color.surfaceInvert,
    color: vars.color.onSurfaceInvert,
    borderRadius: vars.border.radius.sm,
    padding: `${vars.spacing.xs} ${vars.spacing.sm}`,
    fontSize: vars.typography.bodySmallest.fontSize,
    fontWeight: 600,
    boxShadow: vars.shadow.medium,
    maxWidth: "18rem",
});

export const menuPopup = style({
    backgroundColor: vars.color.surfacePrimary,
    borderRadius: vars.border.radius.md,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    boxShadow: vars.shadow.large,
    padding: vars.spacing.xs,
    minWidth: "13rem",
});

export const menuList = style({
    display: "flex",
    flexDirection: "column",
    gap: "2px",
});

export const menuItem = style({
    appearance: "none",
    border: "none",
    backgroundColor: "transparent",
    borderRadius: vars.border.radius.sm,
    color: vars.color.onSurfacePrimary,
    fontSize: vars.typography.bodySmall.fontSize,
    fontWeight: 500,
    textAlign: "left",
    padding: `${vars.spacing.xs} ${vars.spacing.sm}`,
    cursor: "pointer",
    selectors: {
        "&:hover": {
            backgroundColor: vars.button.tertiary.surfaceHover,
        },
        "&:focus-visible": {
            outline: "none",
            boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
        },
    },
});

export const statusText = style({
    color: vars.color.onSurfaceSecondary,
    fontSize: vars.typography.bodySmallest.fontSize,
    fontWeight: 600,
    whiteSpace: "nowrap",
});

export const markerSection = style({
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.xs,
    flexWrap: "wrap",
    paddingTop: vars.spacing.xs,
    borderTop: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
});

export const sectionLabel = style({
    fontSize: vars.typography.bodySmallest.fontSize,
    lineHeight: vars.typography.bodySmallest.lineHeight,
    color: vars.color.onSurfaceSecondary,
    fontWeight: 700,
    marginRight: vars.spacing.xs,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
});

export const markerButton = style({
    minHeight: "1.85rem",
    borderRadius: vars.border.radius.sm,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    backgroundColor: vars.color.surfaceSecondary,
    color: vars.color.onSurfacePrimary,
    paddingInline: vars.spacing.sm,
    fontSize: vars.typography.bodySmallest.fontSize,
    lineHeight: vars.typography.bodySmallest.lineHeight,
    fontWeight: 600,
    cursor: "pointer",
    selectors: {
        "&:hover": {
            backgroundColor: vars.color.surfaceTertiary,
        },
        "&:focus-visible": {
            outline: "none",
            boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
        },
        "&:disabled": {
            opacity: 0.5,
            cursor: "not-allowed",
        },
    },
});
