import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const trigger = style({
    width: "2rem",
    minWidth: "2rem",
    height: "2rem",
    padding: 0,
});

export const positioner = style({
    zIndex: 10000,
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
});

export const separator = style({
    height: "1px",
    backgroundColor: vars.color.surfaceBorder,
    marginBlock: vars.spacing.xs,
});
