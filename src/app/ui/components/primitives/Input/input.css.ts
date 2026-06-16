import { style, styleVariants } from "@vanilla-extract/css";

import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const inputWrapper = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.xs,
  flex: 1,
});

export const inputLabel = style({
  fontSize: vars.typography.bodySmallest.fontSize,
  fontWeight: 500,
  color: vars.color.onSurfaceSecondary,
});

export const input = style({
  width: "100%",
  backgroundColor: vars.color.surfacePrimary,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.md,
  color: vars.color.onSurfacePrimary,
  fontFamily: vars.typography.fontFamily,
  fontSize: vars.typography.bodySmall.fontSize,
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

export const inputSizes = styleVariants({
  sm: {
    height: "2rem",
    padding: "0 0.5rem",
    fontSize: vars.typography.bodySmallest.fontSize,
  },
  md: {
    height: "2.5rem",
    padding: "0 0.75rem",
    fontSize: vars.typography.bodySmall.fontSize,
  },
  lg: {
    height: "3rem",
    padding: "0 1rem",
    fontSize: vars.typography.bodyNormal.fontSize,
  },
});

export const inputError = style({
  borderColor: vars.color.onSurfaceError,
  selectors: {
    "&:hover, &:focus": {
      borderColor: vars.color.onSurfaceError,
    },
  },
});

export const inputErrorText = style({
  fontSize: vars.typography.bodySmallest.fontSize,
  color: vars.color.onSurfaceError,
});
