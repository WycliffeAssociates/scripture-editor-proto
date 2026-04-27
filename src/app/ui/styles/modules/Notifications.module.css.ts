import { keyframes, style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";

const slideIn = keyframes({
    from: { opacity: 0, transform: "translateY(0.5rem)" },
    to: { opacity: 1, transform: "translateY(0)" },
});

const spin = keyframes({
    from: { transform: "rotate(0deg)" },
    to: { transform: "rotate(360deg)" },
});

export const viewport = style({
    position: "fixed",
    right: vars.spacing.md,
    bottom: vars.spacing.md,
    zIndex: zLayer.popoverPositioner,
    width: "min(24rem, calc(100vw - 2rem))",
    display: "flex",
    flexDirection: "column-reverse",
    gap: vars.spacing.sm,
    pointerEvents: "none",
});

const toastToneStyles = {
    error: {
        background: vars.color.surfaceError,
        border: vars.color.onSurfaceError,
        icon: vars.color.onSurfaceError,
    },
    success: {
        background: vars.color.surfaceSuccess,
        border: vars.color.onSurfaceSuccess,
        icon: vars.color.onSurfaceSuccess,
    },
    info: {
        background: vars.color.surfaceSecondary,
        border: vars.color.brandBase,
        icon: vars.color.brandBase,
    },
};

const toastRootBase = style({
    pointerEvents: "auto",
    borderRadius: vars.border.radius.lg,
    borderWidth: vars.border.width.thin,
    borderStyle: "solid",
    boxShadow: vars.shadow.medium,
    animation: `${slideIn} 140ms ease-out`,
});

export const toastRootByTone = {
    error: style([
        toastRootBase,
        {
            backgroundColor: toastToneStyles.error.background,
            borderColor: toastToneStyles.error.border,
        },
    ]),
    success: style([
        toastRootBase,
        {
            backgroundColor: toastToneStyles.success.background,
            borderColor: toastToneStyles.success.border,
        },
    ]),
    info: style([
        toastRootBase,
        {
            backgroundColor: toastToneStyles.info.background,
            borderColor: toastToneStyles.info.border,
        },
    ]),
};

export const toastContent = style({
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr) auto",
    alignItems: "start",
    gap: vars.spacing.sm,
    padding: vars.spacing.md,
});

const toastIconBase = style({
    width: "2rem",
    height: "2rem",
    borderRadius: vars.border.radius.full,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: vars.color.surfacePrimary,
});

export const toastIconByTone = {
    error: style([toastIconBase, { color: toastToneStyles.error.icon }]),
    success: style([toastIconBase, { color: toastToneStyles.success.icon }]),
    info: style([toastIconBase, { color: toastToneStyles.info.icon }]),
};

export const textContent = style({
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.xs,
});

export const title = style({
    margin: 0,
    color: vars.color.onSurfacePrimary,
    fontSize: vars.typography.bodySmall.fontSize,
    fontWeight: 700,
    lineHeight: vars.typography.bodySmall.lineHeight,
});

export const message = style({
    margin: 0,
    color: vars.color.onSurfaceSecondary,
    fontSize: vars.typography.bodySmallest.fontSize,
    lineHeight: vars.typography.bodySmallest.lineHeight,
});

const toastCloseButtonBase = style({
    width: "2rem",
    height: "2rem",
    border: "none",
    borderRadius: vars.border.radius.md,
    backgroundColor: "transparent",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    selectors: {
        "&:hover": {
            backgroundColor: vars.color.surfacePrimary,
        },
    },
});

export const toastCloseButtonByTone = {
    error: style([toastCloseButtonBase, { color: toastToneStyles.error.icon }]),
    success: style([
        toastCloseButtonBase,
        { color: toastToneStyles.success.icon },
    ]),
    info: style([toastCloseButtonBase, { color: toastToneStyles.info.icon }]),
};

export const spinningIcon = style({
    animation: `${spin} 1s linear infinite`,
});
