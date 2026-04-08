import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const page = style({
    minHeight: "100%",
    padding: vars.spacing.lg,
    backgroundColor: vars.color.surfaceSecondary,
    color: vars.color.onSurfacePrimary,
});

export const shell = style({
    maxWidth: "80rem",
    margin: "0 auto",
    display: "grid",
    gap: vars.spacing.lg,
});

export const header = style({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: vars.spacing.lg,
    flexWrap: "wrap",
});

export const titleBlock = style({
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.md,
    minWidth: 0,
    flexWrap: "wrap",
});

export const backLink = style({
    display: "inline-flex",
    alignItems: "center",
    gap: vars.spacing.sm,
    minHeight: "2.5rem",
    padding: `0 ${vars.spacing.md}`,
    borderRadius: vars.border.radius.md,
    border: `${vars.border.width.thin} solid ${vars.button.secondary.border}`,
    backgroundColor: vars.button.secondary.surface,
    color: vars.button.secondary.onSurface,
    textDecoration: "none",
    fontWeight: 600,
    whiteSpace: "nowrap",
    selectors: {
        "&:hover": {
            backgroundColor: vars.button.secondary.surfaceHover,
            borderColor: vars.button.secondary.borderHover,
        },
        "&:active": {
            backgroundColor: vars.button.secondary.surfaceActive,
        },
        "&:focus-visible": {
            outline: "none",
            boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
        },
    },
});

export const pageTitle = style({
    margin: 0,
    fontSize: vars.typography.h1.fontSize,
    lineHeight: vars.typography.h1.lineHeight,
    fontWeight: vars.typography.h1.fontWeight,
    letterSpacing: "-0.02em",
});

export const localizationBlock = style({
    minWidth: "20rem",
    maxWidth: "22rem",
    width: "100%",
});

export const notificationLink = style({
    border: "none",
    padding: 0,
    background: "transparent",
    color: vars.color.brandBase,
    font: "inherit",
    fontWeight: 700,
    cursor: "pointer",
    textDecoration: "underline",
    textUnderlineOffset: "0.15em",
    selectors: {
        "&:hover": {
            color: vars.color.brandDark,
        },
        "&:focus-visible": {
            outline: "none",
            boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
            borderRadius: vars.border.radius.sm,
        },
    },
});
