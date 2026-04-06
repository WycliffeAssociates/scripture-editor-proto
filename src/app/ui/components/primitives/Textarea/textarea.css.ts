import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const textareaWrapper = style({
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.xs,
    flex: 1,
});

export const textareaLabel = style({
    fontSize: vars.typography.bodySmallest.fontSize,
    fontWeight: 500,
    color: vars.color.onSurfaceSecondary,
});

export const textarea = style({
    width: "100%",
    minHeight: "80px",
    padding: vars.spacing.sm,
    backgroundColor: vars.color.surfacePrimary,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    borderRadius: vars.border.radius.md,
    color: vars.color.onSurfacePrimary,
    fontFamily: vars.typography.fontFamily,
    fontSize: vars.typography.bodySmall.fontSize,
    lineHeight: vars.typography.bodySmall.lineHeight,
    resize: "vertical",
    transition: "border-color 150ms ease",
    outline: "none",
    selectors: {
        "&:hover": {
            borderColor: vars.color.brandBase,
        },
        "&:focus": {
            borderColor: vars.color.brandBase,
            boxShadow: `0 0 0 2px ${vars.color.brandLight}`,
        },
        "&:disabled": {
            backgroundColor: vars.color.surfaceSecondary,
            cursor: "not-allowed",
            opacity: 0.6,
        },
    },
});

export const textareaAutosize = style({
    resize: "none",
    overflow: "hidden",
    fieldSizing: "content",
});

export const textareaError = style({
    borderColor: vars.color.onSurfaceError,
    selectors: {
        "&:hover, &:focus": {
            borderColor: vars.color.onSurfaceError,
        },
    },
});

export const textareaErrorText = style({
    fontSize: vars.typography.bodySmallest.fontSize,
    color: vars.color.onSurfaceError,
});
