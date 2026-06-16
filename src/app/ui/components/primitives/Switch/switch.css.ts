import { style } from "@vanilla-extract/css";

import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const root = style({
  position: "relative",
  display: "inline-grid",
  gridTemplateColumns: "max-content minmax(8ch, max-content)",
  alignItems: "center",
  appearance: "none",
  border: "none",
  padding: 0,
  margin: 0,
  cursor: "pointer",
  backgroundColor: "transparent",
  outline: "none",
  userSelect: "none",
  gap: vars.spacing.sm,
});

export const track = style({
  position: "relative",
  flexShrink: 0,
  width: "2.5rem",
  height: "1.25rem",
  borderRadius: "9999px",
  backgroundColor: vars.color.surfaceTertiary,
  transition: "background-color 180ms ease-in-out",
  boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.1)",
  selectors: {
    "&[data-checked]": {
      backgroundColor: vars.color.brandBase,
    },
    "&[data-disabled]": {
      opacity: 0.5,
      cursor: "not-allowed",
    },
    "&[data-readonly]": {
      cursor: "default",
    },
    "&:focus-visible": {
      outline: `2px solid ${vars.color.brandBase}`,
      outlineOffset: "2px",
      borderRadius: "9999px",
    },
  },
});

export const thumb = style({
  position: "absolute",
  top: "50%",
  left: "2px",
  width: "1rem",
  height: "1rem",
  borderRadius: "50%",
  backgroundColor: vars.color.surfacePrimary,
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.2), 0 0 1px rgba(0, 0, 0, 0.1)",
  transform: "translateY(-50%)",
  transition:
    "left 180ms cubic-bezier(0.22, 1, 0.36, 1), transform 180ms cubic-bezier(0.22, 1, 0.36, 1), background-color 180ms ease-in-out",
  willChange: "left, transform",
  outline: "none",
  selectors: {
    "&[data-checked]": {
      left: "calc(100% - 2px - 1rem)",
      backgroundColor: vars.color.surfacePrimary,
    },
    "&[data-active]": {
      transform: "translateY(-50%) scale(0.95)",
    },
    "&[data-checked][data-active]": {
      transform: "translateY(-50%) scale(0.95)",
    },
  },
});

export const label = style({
  minWidth: "8ch",
  fontFamily: "inherit",
  fontSize: vars.typography.bodyNormal.fontSize,
  fontWeight: 600,
  lineHeight: 1.2,
  color: vars.color.onSurfaceSecondary,
  whiteSpace: "nowrap",
  transition: "color 0.2s ease",
  textAlign: "left",
});

export const rootCompact = style([
  root,
  {
    gap: vars.spacing.xs,
    gridTemplateColumns: "max-content max-content",
  },
]);

export const trackCompact = style([
  track,
  {
    width: "1.75rem",
    height: "0.875rem",
  },
]);

export const thumbCompact = style([
  thumb,
  {
    width: "0.625rem",
    height: "0.625rem",
    selectors: {
      "&[data-checked]": {
        left: "calc(100% - 2px - 0.625rem)",
      },
    },
  },
]);

export const labelCompact = style([
  label,
  {
    minWidth: 0,
    fontSize: vars.typography.bodySmallest.fontSize,
    fontWeight: 500,
  },
]);
