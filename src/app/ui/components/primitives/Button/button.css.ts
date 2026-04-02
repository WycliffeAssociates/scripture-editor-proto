import { style, styleVariants } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const buttonBase = style({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: vars.spacing.sm,
    borderRadius: vars.border.radius.md,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s ease-in-out",
    border: `${vars.border.width.thin} solid transparent`,
    whiteSpace: "nowrap",
    outline: "none",
    selectors: {
        "&:disabled": {
            opacity: 0.4,
            cursor: "not-allowed",
        },
        "&:focus-visible": {
            boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
        },
    },
});

export const buttonVariants = styleVariants({
    primary: {
        backgroundColor: vars.button.primary.surface,
        color: vars.button.primary.onSurface,
        borderColor: vars.button.primary.border,
        selectors: {
            "&:hover": {
                backgroundColor: vars.button.primary.surfaceHover,
                borderColor: vars.button.primary.surfaceHover,
            },
            "&:active": {
                backgroundColor: vars.button.primary.surfaceActive,
                borderColor: vars.button.primary.surfaceActive,
            },
        },
    },
    secondary: {
        backgroundColor: vars.button.secondary.surface,
        color: vars.button.secondary.onSurface,
        borderColor: vars.button.secondary.border,
        selectors: {
            "&:hover": {
                backgroundColor: vars.button.secondary.surfaceHover,
                borderColor: vars.button.secondary.borderHover,
            },
            "&:active": {
                backgroundColor: vars.button.secondary.surfaceActive,
            },
        },
    },
    tertiary: {
        backgroundColor: "transparent",
        color: vars.button.tertiary.onSurface,
        borderColor: "transparent",
        selectors: {
            "&:hover": {
                backgroundColor: vars.button.tertiary.surfaceHover,
                color: vars.button.tertiary.onSurfaceHover,
            },
            "&:active": {
                backgroundColor: vars.button.tertiary.surfaceActive,
            },
        },
    },
});

export const buttonSizes = styleVariants({
    sm: {
        height: "2rem",
        padding: "0 0.75rem",
        fontSize: vars.typography.bodySmallest.fontSize,
    },
    md: {
        height: "2.5rem",
        padding: "0 1rem",
        fontSize: vars.typography.bodySmall.fontSize,
    },
    lg: {
        height: "3rem",
        padding: "0 1.5rem",
        fontSize: vars.typography.bodyNormal.fontSize,
    },
});

export const iconSlot = style({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
});
