import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const overlayHost = style({
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
});

export const suggestion = style({
    position: "absolute",
    pointerEvents: "auto",
});

export const underline = style({
    position: "absolute",
    left: 0,
    top: 0,
    border: "none",
    borderBottom: `2px solid ${vars.color.brandBase}`,
    background: "transparent",
    padding: 0,
    margin: 0,
    cursor: "pointer",
});

export const bubble = style({
    position: "absolute",
    left: 0,
    top: `calc(${vars.spacing.xl} * -1)`,
});
