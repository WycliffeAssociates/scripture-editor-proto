import { style, styleVariants } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const alert = style({
    display: "flex",
    alignItems: "flex-start",
    gap: vars.spacing.sm,
    padding: vars.spacing.md,
    borderRadius: vars.border.radius.md,
    border: `${vars.border.width.thin} solid transparent`,
});

export const alertIcon = style({
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginTop: "2px",
});

export const alertContent = style({
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.xs,
    fontSize: vars.typography.bodySmall.fontSize,
    lineHeight: vars.typography.bodySmall.lineHeight,
});

export const alertTitle = style({
    fontWeight: 600,
});

export const alertVariants = styleVariants({
    red: {
        backgroundColor: vars.color.surfaceError,
        borderColor: "color-mix(in srgb, currentColor 20%, transparent)",
        color: vars.color.onSurfaceError,
    },
    green: {
        backgroundColor: vars.color.surfaceSuccess,
        borderColor: "color-mix(in srgb, currentColor 20%, transparent)",
        color: vars.color.onSurfaceSuccess,
    },
    yellow: {
        backgroundColor: "#fef9c3",
        borderColor: "#fde047",
        color: "#854d0e",
    },
    blue: {
        backgroundColor: vars.color.brandLight,
        borderColor: vars.color.brandBase,
        color: vars.color.brandDarkest,
    },
});
