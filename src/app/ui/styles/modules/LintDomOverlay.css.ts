import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const host = style({
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    zIndex: 12,
});

export const item = style({
    position: "absolute",
    width: "1rem",
    height: "1rem",
    pointerEvents: "auto",
    borderRadius: vars.border.radius.full,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: `color-mix(in srgb, ${vars.color.surfaceError} 88%, ${vars.color.surfacePrimary})`,
    color: vars.color.onSurfaceError,
    boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, inset 0 0 0 1px color-mix(in srgb, ${vars.color.onSurfaceError} 35%, transparent), ${vars.shadow.small}`,
    cursor: "pointer",
    selectors: {
        "&::before": {
            content: '"!"',
            fontSize: vars.typography.bodySmallest.fontSize,
            lineHeight: 1,
            fontWeight: 800,
        },
        "&:hover": {
            transform: "scale(1.06)",
        },
    },
});
