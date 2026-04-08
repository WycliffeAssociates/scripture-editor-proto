import { globalStyle, style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const checkboxWrapper = style({
    display: "inline-flex",
    alignItems: "center",
    gap: vars.spacing.sm,
    cursor: "pointer",
    userSelect: "none",
});

export const checkboxInput = style({
    position: "absolute",
    opacity: 0,
    width: 0,
    height: 0,
    margin: 0,
});

export const checkboxControl = style({
    width: "1.25rem",
    height: "1.25rem",
    borderRadius: vars.border.radius.sm,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    backgroundColor: vars.color.surfacePrimary,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.15s ease",
    flexShrink: 0,
    selectors: {
        "&:hover": {
            borderColor: vars.color.brandBase,
        },
    },
});

export const checkboxCheck = style({
    width: "0.875rem",
    height: "0.875rem",
    color: vars.color.surfacePrimary,
    opacity: 0,
    transition: "opacity 0.15s ease",
});

export const checkboxLabel = style({
    fontSize: vars.typography.bodySmall.fontSize,
    color: vars.color.onSurfacePrimary,
});

// Cross-element selectors must use globalStyle in vanilla-extract
globalStyle(`${checkboxInput}:checked + ${checkboxControl}`, {
    backgroundColor: vars.color.brandBase,
    borderColor: vars.color.brandBase,
});

globalStyle(`${checkboxInput}:checked + ${checkboxControl} ${checkboxCheck}`, {
    opacity: 1,
});

globalStyle(`${checkboxInput}:focus-visible + ${checkboxControl}`, {
    boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
});

globalStyle(`${checkboxInput}:disabled + ${checkboxControl}`, {
    opacity: 0.5,
    cursor: "not-allowed",
});

globalStyle(`${checkboxInput}:disabled ~ ${checkboxLabel}`, {
    opacity: 0.5,
    cursor: "not-allowed",
});
