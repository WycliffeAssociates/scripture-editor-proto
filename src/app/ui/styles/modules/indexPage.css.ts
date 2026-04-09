import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const page = style({
    minHeight: "100dvh",
    padding: vars.spacing.lg,
    backgroundColor: vars.color.surfaceSecondary,
    color: vars.color.onSurfacePrimary,
});

export const shell = style({
    maxWidth: "72rem",
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

export const headerCopy = style({
    display: "grid",
    gap: vars.spacing.xs,
    minWidth: 0,
});

export const title = style({
    margin: 0,
    fontSize: vars.typography.h2.fontSize,
    fontWeight: vars.typography.h2.fontWeight,
    lineHeight: vars.typography.h2.lineHeight,
});

export const description = style({
    margin: 0,
    fontSize: vars.typography.bodySmall.fontSize,
    lineHeight: vars.typography.bodySmall.lineHeight,
    color: vars.color.onSurfaceSecondary,
    maxWidth: "52ch",
});

export const headerActions = style({
    display: "grid",
    gap: vars.spacing.sm,
    justifyItems: "stretch",
    minWidth: "20rem",
});

export const newProjectLink = style({
    width: "100%",
    minHeight: "2.5rem",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: vars.spacing.sm,
    padding: `0 ${vars.spacing.md}`,
    borderRadius: vars.border.radius.md,
    border: `${vars.border.width.thin} solid ${vars.button.primary.border}`,
    backgroundColor: vars.button.primary.surface,
    color: vars.button.primary.onSurface,
    textDecoration: "none",
    fontWeight: 600,
    lineHeight: 1,
    whiteSpace: "nowrap",
    selectors: {
        "&:hover": {
            backgroundColor: vars.button.primary.surfaceHover,
            borderColor: vars.button.primary.surfaceHover,
        },
        "&:active": {
            backgroundColor: vars.button.primary.surfaceActive,
            borderColor: vars.button.primary.surfaceActive,
        },
        "&:focus-visible": {
            boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
        },
    },
});

export const languagePicker = style({
    width: "100%",
});

export const emptyState = style({
    display: "grid",
    gap: vars.spacing.md,
    padding: vars.spacing.lg,
    borderRadius: vars.border.radius.lg,
    backgroundColor: vars.color.surfacePrimary,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    boxShadow: vars.shadow.small,
});

export const emptyText = style({
    margin: 0,
    fontSize: vars.typography.bodyNormal.fontSize,
    lineHeight: vars.typography.bodyNormal.lineHeight,
});

export const emptyActions = style({
    display: "flex",
    gap: vars.spacing.sm,
    flexWrap: "wrap",
});

export const groups = style({
    display: "grid",
    gap: vars.spacing.lg,
});

export const group = style({
    display: "grid",
    gap: vars.spacing.sm,
});

export const groupTitle = style({
    margin: 0,
    fontSize: vars.typography.h4.fontSize,
    fontWeight: vars.typography.h4.fontWeight,
    lineHeight: vars.typography.h4.lineHeight,
});

export const groupRows = style({
    display: "grid",
    gap: vars.spacing.xs,
    padding: vars.spacing.md,
    borderRadius: vars.border.radius.lg,
    backgroundColor: vars.color.surfacePrimary,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    boxShadow: vars.shadow.small,
});
