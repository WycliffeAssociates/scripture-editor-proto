import { keyframes, style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

const spinKeyframes = keyframes({
    "0%": { transform: "rotate(0deg)" },
    "100%": { transform: "rotate(360deg)" },
});

export const root = style({
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.sm,
    padding: `${vars.spacing.xs} ${vars.spacing.sm}`,
    borderBottom: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    backgroundColor: vars.color.surfaceSecondary,
});

export const trigger = style({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars.spacing.xs,
    width: "100%",
    minWidth: "12rem",
    minHeight: "1.875rem",
    padding: `0 ${vars.spacing.sm}`,
    backgroundColor: vars.color.surfacePrimary,
    color: vars.color.onSurfacePrimary,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    borderRadius: vars.border.radius.sm,
    fontSize: vars.typography.bodySmallest.fontSize,
    lineHeight: vars.typography.bodySmallest.lineHeight,
    cursor: "pointer",
    selectors: {
        "&:focus-visible": {
            outline: "none",
            boxShadow: `0 0 0 2px ${vars.color.brandLight}`,
        },
    },
});

export const triggerLabel = style({
    display: "inline-flex",
    alignItems: "center",
    gap: vars.spacing.xs,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textAlign: "left",
});

export const triggerChevron = style({
    flex: "0 0 auto",
    color: vars.color.onSurfaceSecondary,
});

export const popup = style({
    display: "flex",
    flexDirection: "column",
    backgroundColor: vars.color.surfacePrimary,
    borderRadius: vars.border.radius.sm,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    boxShadow: vars.shadow.large,
    width: "min(24rem, calc(100vw - 2rem))",
    maxHeight: "min(32rem, calc(100vh - 6rem))",
    overflow: "hidden",
    pointerEvents: "auto",
});

export const header = style({
    padding: vars.spacing.xs,
    borderBottom: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
});

export const searchInput = style({
    width: "100%",
    minHeight: "1.875rem",
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    borderRadius: vars.border.radius.sm,
    outline: "none",
    backgroundColor: vars.color.surfacePrimary,
    color: vars.color.onSurfacePrimary,
    fontSize: vars.typography.bodySmallest.fontSize,
    lineHeight: vars.typography.bodySmallest.lineHeight,
    padding: `0 ${vars.spacing.sm}`,
    selectors: {
        "&:focus-visible": {
            borderColor: vars.color.brandBase,
            boxShadow: `0 0 0 2px ${vars.color.brandLight}`,
        },
    },
});

export const scroll = style({
    overflowY: "auto",
    padding: vars.spacing.xs,
});

export const sectionLabel = style({
    fontSize: vars.typography.bodySmallest.fontSize,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: vars.color.onSurfaceSecondary,
    padding: `${vars.spacing.sm} ${vars.spacing.xs} ${vars.spacing.xs}`,
});

export const languageHeader = style({
    fontSize: vars.typography.bodySmallest.fontSize,
    fontWeight: 600,
    color: vars.color.onSurfacePrimary,
    padding: `${vars.spacing.xs} ${vars.spacing.xs} 0.125rem`,
});

export const languageToggle = style({
    appearance: "none",
    border: "none",
    backgroundColor: "transparent",
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    fontSize: vars.typography.bodySmallest.fontSize,
    fontWeight: 600,
    color: vars.color.onSurfacePrimary,
    textAlign: "left",
    padding: `${vars.spacing.xs} ${vars.spacing.xs}`,
    borderRadius: vars.border.radius.sm,
    cursor: "pointer",
    selectors: {
        "&:hover": { backgroundColor: vars.button.tertiary.surfaceHover },
    },
});

export const languageToggleChevron = style({
    flex: "0 0 auto",
    color: vars.color.onSurfaceSecondary,
    transition: "transform 120ms ease",
});

export const languageToggleChevronOpen = style({
    transform: "rotate(90deg)",
});

export const row = style({
    appearance: "none",
    border: "none",
    backgroundColor: "transparent",
    borderRadius: vars.border.radius.sm,
    color: vars.color.onSurfacePrimary,
    fontSize: vars.typography.bodySmallest.fontSize,
    fontWeight: 500,
    textAlign: "left",
    lineHeight: 1.2,
    padding: `0.1875rem ${vars.spacing.xs}`,
    minHeight: "1.5rem",
    cursor: "pointer",
    display: "grid",
    gridTemplateColumns: "0.875rem minmax(0, 1fr) auto",
    alignItems: "center",
    gap: "0.375rem",
    width: "100%",
    selectors: {
        "&:hover": { backgroundColor: vars.button.tertiary.surfaceHover },
    },
});

export const rowIndent = style({
    paddingLeft: vars.spacing.sm,
});

export const rowDisabled = style({
    cursor: "default",
    color: vars.color.onSurfaceSecondary,
    selectors: {
        "&:hover": { backgroundColor: "transparent" },
    },
});

export const rowIndicator = style({
    width: "0.875rem",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: vars.color.brandBase,
});

export const rowLabel = style({
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
});

export const rowTag = style({
    flex: "0 0 auto",
    fontSize: "0.625rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
    color: vars.color.onSurfaceSecondary,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    borderRadius: vars.border.radius.sm,
    padding: "0 0.25rem",
});

export const rowTrailing = style({
    flex: "0 0 auto",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    color: vars.color.onSurfaceSecondary,
});

export const empty = style({
    padding: `${vars.spacing.sm} ${vars.spacing.xs}`,
    fontSize: vars.typography.bodySmallest.fontSize,
    color: vars.color.onSurfaceSecondary,
});

export const triggerInfo = style({
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.xs,
    fontSize: vars.typography.bodySmallest.fontSize,
    color: vars.color.onSurfaceSecondary,
    whiteSpace: "nowrap",
});

export const spin = style({
    animation: `${spinKeyframes} 0.9s linear infinite`,
});
