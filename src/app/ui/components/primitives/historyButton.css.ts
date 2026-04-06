import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const cluster = style({
    display: "inline-flex",
    alignItems: "center",
    gap: vars.spacing.xs,
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
