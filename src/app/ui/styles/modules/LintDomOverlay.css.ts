import { style } from "@vanilla-extract/css";
import { vars as dsVars } from "@/app/ui/styles/designSystem.css.ts";

export const host = style({
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    zIndex: 12,
});

export const item = style({
    position: "absolute",
    pointerEvents: "auto",
    borderRadius: dsVars.border.radius.sm,
    background: `color-mix(in srgb, ${dsVars.color.surfaceError} 12%, transparent)`,
    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${dsVars.color.onSurfaceError} 55%, transparent)`,
});
