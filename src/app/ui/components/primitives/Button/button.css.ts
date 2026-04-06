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
    subtle: {
        backgroundColor: "transparent",
        color: vars.color.onSurfaceSecondary,
        borderColor: "transparent",
        selectors: {
            "&:hover": {
                backgroundColor: vars.color.surfaceTertiary,
            },
            "&:active": {
                backgroundColor: vars.color.surfaceBorder,
            },
        },
    },
    light: {
        backgroundColor: "color-mix(in srgb, currentColor 10%, transparent)",
        color: vars.color.brandBase,
        borderColor: "transparent",
        selectors: {
            "&:hover": {
                backgroundColor:
                    "color-mix(in srgb, currentColor 15%, transparent)",
            },
            "&:active": {
                backgroundColor:
                    "color-mix(in srgb, currentColor 20%, transparent)",
            },
        },
    },
    // Default maps to secondary for Mantine compatibility
    default: {
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
});

export const buttonSizes = styleVariants({
    xs: {
        height: "1.5rem",
        padding: "0 0.5rem",
        fontSize: "0.75rem",
    },
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
    // Icon button sizes - square with equal padding
    iconXs: {
        width: "1.5rem",
        height: "1.5rem",
        padding: "0",
        fontSize: "0.75rem",
    },
    iconSm: {
        width: "2rem",
        height: "2rem",
        padding: "0",
        fontSize: vars.typography.bodySmallest.fontSize,
    },
    iconMd: {
        width: "2.5rem",
        height: "2.5rem",
        padding: "0",
        fontSize: vars.typography.bodySmall.fontSize,
    },
    iconLg: {
        width: "3rem",
        height: "3rem",
        padding: "0",
        fontSize: vars.typography.bodyNormal.fontSize,
    },
});

export const iconSlot = style({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
});
