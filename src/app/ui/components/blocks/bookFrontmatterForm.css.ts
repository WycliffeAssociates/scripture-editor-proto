import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const shell = style({
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.md,
    padding: vars.spacing.lg,
    borderRadius: vars.border.radius.lg,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    background: vars.color.surfaceSecondary,
});

export const header = style({
    display: "flex",
    justifyContent: "space-between",
    gap: vars.spacing.md,
    alignItems: "center",
    flexWrap: "wrap",
});

export const titleBlock = style({
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.xs,
});

export const title = style({
    color: vars.color.onSurfacePrimary,
    fontSize: vars.typography.bodyNormal.fontSize,
    fontWeight: 700,
});

export const subtitle = style({
    color: vars.color.onSurfaceSecondary,
    fontSize: vars.typography.bodySmallest.fontSize,
});

export const addButton = style({
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    borderRadius: vars.border.radius.md,
    background: vars.color.surfacePrimary,
    color: vars.color.onSurfacePrimary,
    padding: `${vars.spacing.xs} ${vars.spacing.sm}`,
    cursor: "pointer",
});

export const insertSlot = style({
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.sm,
});

export const insertRule = style({
    flex: 1,
    height: "1px",
    background: vars.color.surfaceBorder,
});

export const insertMenuPositioner = style({
    zIndex: 5305,
});

export const insertMenuPopup = style({
    backgroundColor: vars.color.surfacePrimary,
    borderRadius: vars.border.radius.sm,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    boxShadow: vars.shadow.large,
    padding: "0.125rem",
    minWidth: "12rem",
});

export const insertMenuList = style({
    display: "flex",
    flexDirection: "column",
    gap: "1px",
});

export const insertMenuItem = style({
    appearance: "none",
    border: "none",
    backgroundColor: "transparent",
    borderRadius: vars.border.radius.sm,
    color: vars.color.onSurfacePrimary,
    fontSize: vars.typography.bodySmallest.fontSize,
    fontWeight: 500,
    textAlign: "left",
    lineHeight: 1.2,
    padding: `0.375rem ${vars.spacing.sm}`,
    minHeight: "1.75rem",
    cursor: "pointer",
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

export const insertMenuItemMarker = style({
    color: vars.color.onSurfaceSecondary,
    marginLeft: vars.spacing.xs,
});

export const cards = style({
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.sm,
});

export const card = style({
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.sm,
    padding: vars.spacing.md,
    borderRadius: vars.border.radius.md,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    background: vars.color.surfacePrimary,
});

export const cardHeader = style({
    display: "flex",
    justifyContent: "space-between",
    gap: vars.spacing.sm,
    alignItems: "flex-start",
});

export const cardTitleBlock = style({
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.xs,
});

export const cardTitle = style({
    color: vars.color.onSurfacePrimary,
    fontSize: vars.typography.bodySmall.fontSize,
    fontWeight: 600,
});

export const cardMarker = style({
    color: vars.color.onSurfaceSecondary,
    fontSize: vars.typography.bodySmallest.fontSize,
});

export const cardDescription = style({
    color: vars.color.onSurfaceSecondary,
    fontSize: vars.typography.bodySmallest.fontSize,
});

export const deleteButton = style({
    border: "none",
    background: "transparent",
    color: vars.color.onSurfaceSecondary,
    cursor: "pointer",
    padding: 0,
});

export const fieldRow = style({
    display: "grid",
    gap: vars.spacing.sm,
    gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
});

export const note = style({
    color: vars.color.onSurfaceSecondary,
    fontSize: vars.typography.bodySmallest.fontSize,
});

export const warning = style({
    color: vars.color.brandDark,
    fontSize: vars.typography.bodySmallest.fontSize,
});
