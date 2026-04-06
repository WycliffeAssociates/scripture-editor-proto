import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const root = style({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars.spacing.sm,
    minHeight: "2.75rem",
    paddingBlock: vars.spacing.xs,
    paddingInline: vars.spacing.sm,
    flexWrap: "wrap",
});

export const cluster = style({
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.xs,
    flexWrap: "wrap",
    minWidth: 0,
});

export const leftCluster = style({
    flex: "1 1 auto",
});

export const rightCluster = style({
    flex: "0 1 auto",
    marginLeft: "auto",
});

export const toolbarDivider = style({
    width: "1px",
    height: "1.25rem",
    backgroundColor: vars.color.surfaceBorder,
    marginInline: vars.spacing.xs,
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
