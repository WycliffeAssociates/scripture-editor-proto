import { keyframes, style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const triggerButton = style({
    height: "2rem",
    minWidth: "2rem",
    padding: 0,
    borderRadius: vars.border.radius.md,
    border: `${vars.border.width.thin} solid transparent`,
    backgroundColor: "transparent",
    color: vars.color.onSurfaceSecondary,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition:
        "background-color 120ms ease, color 120ms ease, border-color 120ms ease",
    selectors: {
        "&:hover": {
            backgroundColor: vars.button.tertiary.surfaceHover,
            color: vars.color.onSurfacePrimary,
        },
        "&:focus-visible": {
            outline: "none",
            boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
        },
    },
});

export const triggerButtonActive = style({
    backgroundColor: vars.button.tertiary.surfaceActive,
    color: vars.color.brandBase,
});

const dropdownIn = keyframes({
    from: { opacity: 0, transform: "translateY(-6px) scale(0.98)" },
    to: { opacity: 1, transform: "translateY(0) scale(1)" },
});

export const popover = style({
    width: "26.25rem",
    maxWidth: "calc(100vw - 1.5rem)",
    maxHeight: "32.5rem",
    backgroundColor: vars.color.surfacePrimary,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    borderRadius: vars.border.radius.lg,
    boxShadow: vars.shadow.large,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    animation: `${dropdownIn} 140ms ease-out`,
    transformOrigin: "top right",
});

export const header = style({
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: "0.875rem 1rem 0.5rem",
    gap: vars.spacing.sm,
    borderBottom: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
});

export const headerText = style({
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "0.125rem",
});

export const title = style({
    fontSize: "0.9375rem",
    fontWeight: 700,
    color: vars.color.onSurfacePrimary,
    letterSpacing: "-0.01em",
    lineHeight: 1.3,
});

export const subtitle = style({
    fontSize: "0.75rem",
    color: vars.color.onSurfaceSecondary,
});

export const headerActions = style({
    display: "flex",
    gap: vars.spacing.xs,
    flexShrink: 0,
});

export const closeButton = style({
    appearance: "none",
    border: "none",
    background: "transparent",
    width: "1.75rem",
    height: "1.75rem",
    borderRadius: vars.border.radius.sm,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: vars.color.onSurfaceSecondary,
    flexShrink: 0,
    selectors: {
        "&:hover": {
            backgroundColor: vars.button.tertiary.surfaceHover,
            color: vars.color.onSurfacePrimary,
        },
    },
});

export const listViewport = style({
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
});

export const virtualInner = style({
    position: "relative",
    width: "100%",
});

export const virtualRow = style({
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
});

export const emptyState = style({
    padding: `${vars.spacing.lg} ${vars.spacing.md}`,
    textAlign: "center",
    fontSize: vars.typography.bodySmall.fontSize,
    color: vars.color.onSurfaceSecondary,
});
