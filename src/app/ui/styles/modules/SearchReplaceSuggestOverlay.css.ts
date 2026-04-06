import { style } from "@vanilla-extract/css";
import { vars as dsVars } from "@/app/ui/styles/designSystem.css.ts";

const darkSelector = "[data-theme='dark']";

export const overlayHost = style({
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    zIndex: 60,
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
    borderBottom: `2px dotted ${dsVars.color.brandBase}`,
    background: "transparent",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    selectors: {
        "&:hover": {
            borderBottomColor: dsVars.color.brandDark,
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
    borderRadius: dsVars.border.radius.xl,
    border: `1px solid ${dsVars.color.brandBase}`,
    background: dsVars.color.surfacePrimary,
    boxShadow: `0 10px 22px color-mix(in srgb, ${dsVars.color.onSurfaceInvert} 14%, transparent)`,
    padding: 0,
    margin: 0,
    minWidth: 0,
    selectors: {
        [`${darkSelector} &`]: {
            boxShadow: `0 10px 22px color-mix(in srgb, ${dsVars.color.onSurfaceInvert} 45%, transparent)`,
        },
    },
});

export const bubbleLabel = style({
    fontSize: dsVars.typography.bodySmall.fontSize,
    lineHeight: 1.2,
    fontWeight: 500,
    paddingInline: dsVars.spacing.xs,
    color: dsVars.color.onSurfacePrimary,
    whiteSpace: "nowrap",
});

export const bubbleAction = style({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: "100%",
    paddingBlock: dsVars.spacing.md,
    border: "none",
    borderLeft: `1px solid ${dsVars.color.brandDark}`,
    background: dsVars.color.brandBase,
    color: dsVars.color.onSurfaceInvert,
    cursor: "pointer",
    selectors: {
        "&:hover": {
            background: dsVars.color.brandDark,
        },
    },
});
