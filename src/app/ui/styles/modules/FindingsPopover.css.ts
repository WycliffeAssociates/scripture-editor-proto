import { globalStyle, keyframes, style } from "@vanilla-extract/css";
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
    gap: "0.375rem",
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

export const triggerButtonWithCount = style({
    padding: "0 0.5rem 0 0.625rem",
});

export const triggerButtonActive = style({
    backgroundColor: vars.button.tertiary.surfaceActive,
    color: vars.color.brandBase,
});

export const countPill = style({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "1.25rem",
    height: "1.25rem",
    padding: "0 0.4375rem",
    borderRadius: vars.border.radius.full,
    backgroundColor: vars.color.surfaceError,
    color: vars.color.onSurfaceError,
    fontSize: "0.75rem",
    fontWeight: 700,
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
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
    transformOrigin: "top left",
});

export const header = style({
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: "1rem 1.25rem 0",
    gap: vars.spacing.sm,
});

export const headerText = style({
    minWidth: 0,
});

export const title = style({
    fontSize: "1rem",
    fontWeight: 700,
    color: vars.color.onSurfacePrimary,
    letterSpacing: "-0.01em",
    lineHeight: 1.3,
});

export const subtitle = style({
    fontSize: "0.75rem",
    color: vars.color.onSurfaceSecondary,
    marginTop: "0.125rem",
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

export const scopeTabs = style({
    display: "flex",
    gap: "0.25rem",
    padding: `${vars.spacing.xs} 1.25rem 0`,
    borderBottom: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    marginBottom: vars.spacing.xs,
});

export const scopeTab = style({
    appearance: "none",
    background: "transparent",
    border: "none",
    padding: "0.625rem 0.25rem 0.6875rem",
    marginBottom: "-1px",
    fontSize: "0.8125rem",
    fontWeight: 500,
    color: vars.color.onSurfaceSecondary,
    borderBottom: "2px solid transparent",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    transition: "color 120ms ease, border-color 120ms ease",
});

export const scopeTabActive = style({
    fontWeight: 600,
    color: vars.color.brandBase,
    borderBottomColor: vars.color.brandBase,
});

export const scopeTabCount = style({
    fontSize: "0.6875rem",
    fontWeight: 600,
    padding: "1px 0.4375rem",
    borderRadius: vars.border.radius.full,
    backgroundColor: vars.color.surfaceSecondary,
    color: vars.color.onSurfaceSecondary,
    fontVariantNumeric: "tabular-nums",
});

export const scopeTabCountActive = style({
    backgroundColor: vars.color.brandLight,
    color: vars.color.brandBase,
});

export const filterRibbon = style({
    display: "flex",
    gap: vars.spacing.xs,
    padding: `${vars.spacing.xs} 1.25rem`,
    flexWrap: "wrap",
});

export const listViewport = style({
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: `${vars.spacing.xs} 0.5rem ${vars.spacing.sm}`,
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

export const issueRow = style({
    appearance: "none",
    background: "transparent",
    border: "none",
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.sm,
    width: "100%",
    boxSizing: "border-box",
    padding: "0.6875rem 1rem",
    cursor: "pointer",
    textAlign: "left",
    borderRadius: vars.border.radius.md,
    transition: "background-color 120ms ease",
    selectors: {
        "&:hover, &:focus-visible": {
            backgroundColor: vars.button.tertiary.surfaceHover,
            outline: "none",
        },
    },
});

export const issueContent = style({
    flex: 1,
    minWidth: 0,
    fontSize: "0.875rem",
    lineHeight: 1.45,
    color: vars.color.onSurfacePrimary,
});

export const issueRef = style({
    fontWeight: 600,
    color: vars.color.onSurfacePrimary,
});

export const issueSeparator = style({
    color: vars.color.onSurfaceSecondary,
    margin: "0 0.375rem",
});

export const issueMessage = style({
    color: vars.color.onSurfaceSecondary,
    fontWeight: 400,
});

export const chevronIcon = style({
    flexShrink: 0,
    color: vars.color.onSurfaceTertiary,
    transition: "color 120ms ease, transform 120ms ease",
});

globalStyle(`${issueRow}:hover ${chevronIcon}`, {
    color: vars.color.onSurfacePrimary,
    transform: "translateX(2px)",
});

export const emptyState = style({
    padding: "2rem 1.25rem 1.75rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.625rem",
    textAlign: "center",
});

export const emptyStateIconCircle = style({
    width: "2.75rem",
    height: "2.75rem",
    borderRadius: vars.border.radius.full,
    backgroundColor: vars.color.surfaceSuccess,
    color: vars.color.onSurfaceSuccess,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
});

export const emptyStateIconCircleLarge = style({
    width: "3.5rem",
    height: "3.5rem",
});

export const emptyStateTitle = style({
    fontSize: "0.875rem",
    fontWeight: 600,
    color: vars.color.onSurfacePrimary,
});

export const emptyStateTitleLarge = style({
    fontSize: "0.9375rem",
});

export const emptyStateBody = style({
    fontSize: "0.8125rem",
    color: vars.color.onSurfaceSecondary,
    maxWidth: "17.5rem",
    lineHeight: 1.5,
});

export const emptyStateAction = style({
    appearance: "none",
    marginTop: "0.375rem",
    padding: "0.5rem 0.875rem",
    borderRadius: vars.border.radius.md,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    backgroundColor: vars.color.surfacePrimary,
    fontSize: "0.8125rem",
    fontWeight: 500,
    color: vars.color.onSurfacePrimary,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    selectors: {
        "&:hover": {
            backgroundColor: vars.button.tertiary.surfaceHover,
            borderColor: vars.color.brandBase,
        },
    },
});
