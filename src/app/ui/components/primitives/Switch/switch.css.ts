import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const root = style({
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    appearance: "none",
    border: "none",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    backgroundColor: "transparent",
    outline: "none",
    userSelect: "none",
    gap: vars.spacing.sm,
});

export const track = style({
    position: "relative",
    flexShrink: 0,
    width: "2.5rem",
    height: "1.25rem",
    borderRadius: "9999px",
    backgroundColor: vars.color.surfaceTertiary,
    transition: "background-color 0.2s ease",
    boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.1)",
    selectors: {
        "&[data-checked]": {
            backgroundColor: vars.color.brandBase,
        },
        "&[data-disabled]": {
            opacity: 0.5,
            cursor: "not-allowed",
        },
        "&[data-readonly]": {
            cursor: "default",
        },
        "&:focus-visible": {
            outline: `2px solid ${vars.color.brandBase}`,
            outlineOffset: "2px",
            borderRadius: "9999px",
        },
    },
});

export const thumb = style({
    position: "absolute",
    top: "50%",
    left: "2px",
    width: "1rem",
    height: "1rem",
    borderRadius: "50%",
    backgroundColor: vars.color.surfacePrimary,
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.2), 0 0 1px rgba(0, 0, 0, 0.1)",
    transform: "translateY(-50%)",
    transition:
        "transform 0.2s cubic-bezier(0.26, 0.75, 0.38, 0.45), background-color 0.2s ease",
    outline: "none",
    selectors: {
        "&[data-checked]": {
            transform: "translateY(-50%) translateX(1.25rem)",
            backgroundColor: vars.color.surfacePrimary,
        },
        "&[data-active]": {
            transform: "translateY(-50%) scale(0.95)",
        },
        "&[data-checked][data-active]": {
            transform: "translateY(-50%) translateX(1.25rem) scale(0.95)",
        },
    },
});

export const label = style({
    fontFamily: "inherit",
    fontSize: vars.typography.bodyNormal.fontSize,
    fontWeight: 600,
    lineHeight: 1.2,
    color: vars.color.onSurfaceSecondary,
    whiteSpace: "nowrap",
    transition: "color 0.2s ease",
});
