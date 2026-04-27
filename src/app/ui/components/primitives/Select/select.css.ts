import { globalStyle, style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const trigger = style({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars.spacing.sm,
    padding: "10px 14px",
    minHeight: "44px",
    backgroundColor: vars.color.surfacePrimary,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    borderRadius: vars.border.radius.lg,
    width: "100%",
    cursor: "pointer",
    appearance: "none",
    WebkitAppearance: "none",
    transition: "border-color 200ms ease",
    selectors: {
        "&:hover": {
            borderColor: vars.color.brandBase,
        },
        "&:focus-visible": {
            outline: `${vars.border.width.thick} solid ${vars.color.brandBase}`,
            outlineOffset: "2px",
        },
    },
});

export const triggerIcon = style({
    width: "20px",
    height: "20px",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
});

export const triggerIconEnd = style({
    width: "20px",
    height: "20px",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
});

export const triggerValue = style({
    flex: "1 1 auto",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: vars.typography.fontFamily,
    fontSize: vars.typography.bodyNormal.fontSize,
    fontWeight: vars.typography.bodyNormal.fontWeight,
    lineHeight: vars.typography.bodyNormal.lineHeight,
    color: vars.color.onSurfacePrimary,
    textAlign: "left",
});

export const popup = style({
    minWidth: "var(--anchor-width)",
    backgroundColor: vars.color.surfacePrimary,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    borderRadius: vars.border.radius.md,
    boxShadow: vars.shadow.large,
    zIndex: 7000,
    overflow: "hidden",
    transformOrigin: "var(--transform-origin)",
    transition: "transform 150ms ease, opacity 150ms ease",
    selectors: {
        "&[data-starting-style]": {
            opacity: 0,
            transform: "scale(0.95)",
        },
        "&[data-ending-style]": {
            opacity: 0,
            transform: "scale(0.95)",
        },
    },
});

export const list = style({
    padding: 0,
    backgroundColor: vars.color.surfacePrimary,
});

export const item = style({
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px 16px",
    borderBottom: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    cursor: "pointer",
    fontFamily: vars.typography.fontFamily,
    fontSize: vars.typography.bodyNormal.fontSize,
    fontWeight: vars.typography.bodyNormal.fontWeight,
    lineHeight: vars.typography.bodyNormal.lineHeight,
    color: vars.color.onSurfacePrimary,
    transition: "background-color 150ms ease",
    selectors: {
        "&[data-highlighted]": {
            backgroundColor: vars.color.brandLight,
        },
        "&:last-child": {
            borderBottom: "none",
        },
        "&[data-selected]": {
            color: vars.color.brandBase,
            backgroundColor: vars.color.brandLight,
            fontWeight: "600",
        },
    },
});

export const itemText = style({
    flex: "1 0 0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
});

export const itemIndicatorLeading = style({
    width: "24px",
    height: "24px",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "inherit",
});

export const radioCircle = style({
    width: "20px",
    height: "20px",
    borderRadius: vars.border.radius.full,
    border: `2px solid ${vars.color.onSurfaceSecondary}`,
    color: vars.color.surfacePrimary,
    backgroundColor: "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition:
        "background-color 120ms ease, border-color 120ms ease, color 120ms ease",
});

export const radioCheck = style({
    width: "14px",
    height: "14px",
    opacity: 0,
    transition: "opacity 120ms ease",
});

globalStyle(`${itemIndicatorLeading}[data-selected] .${radioCircle}`, {
    backgroundColor: vars.color.brandBase,
    borderColor: vars.color.brandBase,
    color: vars.color.surfacePrimary,
});

globalStyle(`${itemIndicatorLeading}[data-selected] .${radioCheck}`, {
    opacity: 1,
});
