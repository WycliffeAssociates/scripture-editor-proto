import { style } from "@vanilla-extract/css";

import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const root = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "2rem",
  height: "2rem",
  padding: 0,
  border: "none",
  borderRadius: vars.border.radius.md,
  cursor: "pointer",
  transition: "background-color 0.15s ease-in-out, color 0.15s ease-in-out",
  selectors: {
    "&:focus-visible": {
      outline: "none",
      boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
    },
    "&[data-disabled]": {
      opacity: 0.5,
      cursor: "not-allowed",
    },
  },
});

export const subtle = style({
  backgroundColor: "transparent",
  color: vars.color.onSurfaceSecondary,
  selectors: {
    "&:hover": {
      backgroundColor: vars.button.tertiary.surfaceHover,
    },
    "&:active": {
      backgroundColor: vars.button.tertiary.surfaceActive,
    },
  },
});

export const filled = style({
  backgroundColor: vars.color.surfaceInvert,
  color: vars.color.onSurfaceInvert,
  selectors: {
    "&:hover": {
      backgroundColor: vars.color.onSurfaceSecondary,
    },
    "&:active": {
      backgroundColor: vars.color.onSurfacePrimary,
    },
  },
});

export const icon = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "currentColor",
});
