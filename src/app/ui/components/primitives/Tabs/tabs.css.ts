import { keyframes, style } from "@vanilla-extract/css";
import { containerQuery } from "@/app/ui/styles/breakpoints.ts";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

const fadeInAnimation = keyframes({
    from: { opacity: 0, transform: "translateY(4px)" },
    to: { opacity: 1, transform: "translateY(0)" },
});

export const root = style({
    display: "flex",
    flexDirection: "column",
    width: "100%",
    position: "relative",
    isolation: "isolate",
    containerType: "inline-size",
});

export const list = style({
    display: "flex",
    alignItems: "stretch",
    position: "relative",
    zIndex: 0,
    gap: 0,
    width: "100%",
});

export const tab = style({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    padding: `${vars.spacing.md} ${vars.spacing.xl}`,
    maxWidth: "320px",
    flex: "1 0 0%",
    border: "none",
    margin: 0,
    outline: 0,
    background: "none",
    appearance: "none",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: vars.typography.bodyNormal.fontSize,
    fontWeight: 600,
    lineHeight: 1.2,
    color: vars.color.onSurfacePrimary,
    userSelect: "none",
    whiteSpace: "nowrap",
    wordBreak: "keep-all",
    transition: "color 0.2s ease, border-color 0.2s ease, opacity 0.2s ease",
    borderBottom: `3px solid transparent`,
    selectors: {
        "&[data-active]": {
            color: vars.color.brandBase,
            borderBottomColor: vars.color.brandBase,
        },
        "&[data-disabled]": {
            opacity: 0.5,
            cursor: "not-allowed",
        },
        "&:hover:not([data-disabled]):not([data-active])": {
            color: vars.color.onSurfaceSecondary,
            borderBottomColor: vars.color.surfaceBorder,
        },
        "&:focus-visible": {
            outline: `2px solid ${vars.color.brandBase}`,
            outlineOffset: "-2px",
            borderRadius: vars.border.radius.sm,
        },
    },
    "@container": {
        [containerQuery.down("sm")]: {
            padding: `${vars.spacing.sm} ${vars.spacing.md}`,
            fontSize: vars.typography.bodySmall.fontSize,
        },
    },
});

export const tabLabel = style({
    textAlign: "center",
    transition: "opacity 0.2s ease",
});

export const panel = style({
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    outline: 0,
    padding: vars.spacing.lg,
    animation: `${fadeInAnimation} 0.2s ease-out`,
    selectors: {
        "&[hidden]": {
            display: "none",
        },
        "&:focus-visible": {
            outline: `2px solid ${vars.color.brandBase}`,
            outlineOffset: "-2px",
            borderRadius: vars.border.radius.md,
        },
    },
});
