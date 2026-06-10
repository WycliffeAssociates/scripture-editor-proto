import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";

export const trigger = style({
    width: "2rem",
    minWidth: "2rem",
    height: "2rem",
    padding: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    border: `${vars.border.width.thin} solid transparent`,
    color: vars.color.onSurfaceSecondary,
    cursor: "pointer",
    borderRadius: vars.border.radius.md,
    transition:
        "background-color 120ms ease, color 120ms ease, border-color 120ms ease",
    selectors: {
        "&:hover": {
            backgroundColor: vars.button.tertiary.surfaceHover,
            color: vars.color.onSurfacePrimary,
        },
        "&[data-popup-open]": {
            backgroundColor: vars.button.tertiary.surfaceActive,
            color: vars.color.onSurfacePrimary,
        },
        "&:focus-visible": {
            outline: "none",
            boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
        },
    },
});

export const positioner = style({
    zIndex: zLayer.toolbarMenu,
});

export const popup = style({
    backgroundColor: vars.color.surfacePrimary,
    borderRadius: vars.border.radius.md,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    boxShadow: vars.shadow.large,
    padding: vars.spacing.xs,
    minWidth: "12rem",
});

export const item = style({
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.xs,
    border: "none",
    borderRadius: vars.border.radius.sm,
    backgroundColor: "transparent",
    color: vars.color.onSurfacePrimary,
    cursor: "pointer",
    padding: `${vars.spacing.xs} ${vars.spacing.sm}`,
    textAlign: "left",
    width: "100%",
    fontSize: vars.typography.bodySmall.fontSize,
    selectors: {
        "&:hover": {
            backgroundColor: vars.button.tertiary.surfaceHover,
        },
        "&[data-highlighted]": {
            backgroundColor: vars.button.tertiary.surfaceHover,
        },
        "&:focus-visible": {
            outline: "none",
            boxShadow: `0 0 0 2px ${vars.color.brandBase}`,
        },
    },
});

export const itemIcon = style({
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: vars.color.onSurfaceSecondary,
});

export const groupLabel = style({
    paddingInline: vars.spacing.sm,
    paddingBlock: `${vars.spacing.xs} 0.125rem`,
    fontSize: vars.typography.bodySmallest.fontSize,
    lineHeight: vars.typography.bodySmallest.lineHeight,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: vars.color.onSurfaceTertiary,
});

export const separator = style({
    height: "1px",
    backgroundColor: vars.color.surfaceBorder,
    marginBlock: vars.spacing.xs,
});
