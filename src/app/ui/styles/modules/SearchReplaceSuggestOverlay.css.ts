import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";

const darkSelector = "[data-theme='dark']";

export const overlayHost = style({
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    zIndex: zLayer.floatingPanel,
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
    borderBottom: `2px dotted ${vars.color.brandBase}`,
    background: "transparent",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    selectors: {
        "&:hover": {
            borderBottomColor: vars.color.brandDark,
        },
    },
});

export const bubble = style({
    position: "absolute",
    left: "50%",
    transform: "translateY(-100%)",
});

export const bubbleShell = style({
    display: "inline-flex",
    alignItems: "center",
    overflow: "hidden",
    borderRadius: vars.border.radius.xl,
    border: `1px solid ${vars.color.brandBase}`,
    background: vars.color.surfacePrimary,
    boxShadow: `0 10px 22px color-mix(in srgb, ${vars.color.onSurfaceInvert} 14%, transparent)`,
    padding: 0,
    margin: 0,
    minWidth: 0,
    selectors: {
        [`${darkSelector} &`]: {
            boxShadow: `0 10px 22px color-mix(in srgb, ${vars.color.onSurfaceInvert} 45%, transparent)`,
        },
    },
});

export const bubbleLabel = style({
    fontSize: vars.typography.bodySmall.fontSize,
    lineHeight: 1.2,
    fontWeight: 500,
    paddingInline: vars.spacing.xs,
    color: vars.color.onSurfacePrimary,
    whiteSpace: "nowrap",
});

export const bubbleAction = style({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: "100%",
    paddingBlock: vars.spacing.md,
    border: "none",
    borderLeft: `1px solid ${vars.color.brandDark}`,
    background: vars.color.brandBase,
    color: vars.color.onSurfaceInvert,
    cursor: "pointer",
    selectors: {
        "&:hover": {
            background: vars.color.brandDark,
        },
    },
});
