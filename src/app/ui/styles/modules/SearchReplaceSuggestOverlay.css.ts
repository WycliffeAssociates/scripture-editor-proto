import { style } from "@vanilla-extract/css";
import { darkSelector, vars, virtualVars } from "@/app/ui/styles/theme.css.ts";

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
    borderBottom: `2px dotted ${vars.colors.primary[6]}`,
    background: "transparent",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    selectors: {
        "&:hover": {
            borderBottomColor: vars.colors.primary[5],
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
    borderRadius: vars.radius.xl,
    border: `1px solid ${vars.colors.primary[6]}`,
    background: virtualVars.surface,
    boxShadow: `0 10px 22px color-mix(in srgb, ${vars.colors.black} 14%, transparent)`,
    padding: 0,
    margin: 0,
    minWidth: 0,
    selectors: {
        [`${darkSelector} &`]: {
            boxShadow: `0 10px 22px color-mix(in srgb, ${vars.colors.black} 45%, transparent)`,
        },
    },
});

export const bubbleLabel = style({
    fontSize: vars.fontSizes.sm,
    lineHeight: 1.2,
    fontWeight: 500,
    paddingInline: vars.spacing.xs,
    color: virtualVars.text,
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
    borderLeft: `1px solid ${vars.colors.primary[5]}`,
    background: vars.colors.primary.filled,
    color: vars.colors.white,
    cursor: "pointer",
    selectors: {
        "&:hover": {
            background: vars.colors.primary[7],
        },
    },
});
