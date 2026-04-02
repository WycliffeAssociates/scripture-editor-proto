import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const root = style({
    display: "grid",
    gap: vars.spacing.sm,
});

export const option = style({
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.sm,
    padding: `${vars.spacing.sm} ${vars.spacing.md}`,
    borderRadius: vars.border.radius.md,
    backgroundColor: vars.color.surfacePrimary,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    cursor: "pointer",
    transition: "border-color 150ms ease, background-color 150ms ease",
    selectors: {
        "&:hover": {
            borderColor: vars.color.brandBase,
            backgroundColor: vars.color.brandLight,
        },
        "&:focus-within": {
            outline: `${vars.border.width.thick} solid ${vars.color.brandBase}`,
            outlineOffset: "2px",
        },
    },
});

export const hiddenInput = style({
    position: "absolute",
    opacity: 0,
    pointerEvents: "none",
});

export const control = style({
    width: "16px",
    height: "16px",
    borderRadius: vars.border.radius.full,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    backgroundColor: vars.color.surfacePrimary,
    flexShrink: 0,
    position: "relative",
    transition: "border-color 150ms ease, background-color 150ms ease",
    selectors: {
        '&[data-selected="true"]': {
            borderColor: vars.color.brandBase,
            backgroundColor: vars.color.brandLight,
        },
        '&[data-selected="true"]::after': {
            content: '""',
            position: "absolute",
            inset: "3px",
            borderRadius: vars.border.radius.full,
            backgroundColor: vars.color.brandBase,
        },
    },
});

export const label = style({
    color: vars.color.onSurfacePrimary,
    fontFamily: vars.typography.fontFamily,
    fontSize: vars.typography.bodyNormal.fontSize,
    fontWeight: vars.typography.bodyNormal.fontWeight,
    lineHeight: vars.typography.bodyNormal.lineHeight,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
});
