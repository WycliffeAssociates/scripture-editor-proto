import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const root = style({
    width: "100%",
});

export const trigger = style({
    width: "100%",
    minHeight: "4.5rem",
    padding: vars.spacing.md,
    border: `1px solid ${vars.color.appSidebarBorder}`,
    borderRadius: vars.border.radius.lg,
    backgroundColor: vars.color.appSidebarSurfaceHover,
    color: vars.color.appSidebarOnSurface,
    textAlign: "left",
    cursor: "pointer",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: vars.spacing.sm,
    alignItems: "center",
    selectors: {
        "&:hover": {
            backgroundColor: vars.color.appSidebarSurfaceActive,
        },
        "&:focus-visible": {
            outline: `${vars.border.width.thick} solid ${vars.color.brandBase}`,
            outlineOffset: "2px",
        },
        "&[data-popup-open]": {
            backgroundColor: vars.color.appSidebarSurfaceActive,
            borderColor: vars.color.brandBase,
        },
        "&:disabled": {
            cursor: "not-allowed",
            opacity: 0.7,
        },
    },
});

export const triggerText = style({
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "0.125rem",
});

export const triggerKicker = style({
    fontSize: vars.typography.bodySmallest.fontSize,
    lineHeight: vars.typography.bodySmallest.lineHeight,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: vars.color.appSidebarOnSurfaceMuted,
});

export const triggerTitle = style({
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars.typography.bodyNormal.fontSize,
    lineHeight: vars.typography.bodyNormal.lineHeight,
    fontWeight: 700,
    color: vars.color.appSidebarOnSurface,
});

export const triggerSubtitle = style({
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars.typography.bodySmallest.fontSize,
    lineHeight: vars.typography.bodySmallest.lineHeight,
    color: vars.color.appSidebarOnSurfaceMuted,
});

export const triggerChevron = style({
    width: "1.25rem",
    height: "1.25rem",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: vars.color.appSidebarOnSurfaceMuted,
    flexShrink: 0,
});
