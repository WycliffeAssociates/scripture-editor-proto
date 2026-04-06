import { keyframes, style, styleVariants } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const root = style({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: vars.spacing.xs,
    minHeight: "2rem",
    padding: `0 ${vars.spacing.sm}`,
    borderRadius: vars.border.radius.md,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    backgroundColor: vars.color.surfacePrimary,
    color: vars.color.onSurfaceSecondary,
    fontSize: vars.typography.bodySmallest.fontSize,
    fontWeight: 600,
    letterSpacing: "0.01em",
    whiteSpace: "nowrap",
    cursor: "pointer",
    transition:
        "background-color 140ms ease, border-color 140ms ease, color 140ms ease, transform 140ms ease, box-shadow 140ms ease",
    selectors: {
        "&:hover": {
            transform: "translateY(-1px)",
            boxShadow: vars.shadow.small,
        },
        "&:focus-visible": {
            outline: "none",
            boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
        },
        "&:disabled": {
            cursor: "not-allowed",
            opacity: 0.6,
            transform: "none",
            boxShadow: "none",
        },
    },
});

const spin = keyframes({
    from: { transform: "rotate(0deg)" },
    to: { transform: "rotate(360deg)" },
});

export const spinningIcon = style({
    animation: `${spin} 900ms linear infinite`,
});

export const content = style({
    display: "inline-flex",
    alignItems: "center",
});

export const iconSlot = style({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
});

export const stateVariants = styleVariants({
    connected: {
        borderColor: vars.color.brandBase,
        backgroundColor: `color-mix(in srgb, ${vars.color.brandBase} 10%, ${vars.color.surfacePrimary})`,
        color: vars.color.brandBase,
    },
    behind: {
        borderColor: "#c99700",
        backgroundColor: `color-mix(in srgb, #f6c343 16%, ${vars.color.surfacePrimary})`,
        color: "#8a5e00",
    },
    diverged: {
        borderColor: "#c99700",
        backgroundColor: `color-mix(in srgb, #f6c343 16%, ${vars.color.surfacePrimary})`,
        color: "#8a5e00",
    },
    syncing: {
        borderColor: vars.color.brandBase,
        backgroundColor: `color-mix(in srgb, ${vars.color.brandBase} 12%, ${vars.color.surfacePrimary})`,
        color: vars.color.brandBase,
    },
});
