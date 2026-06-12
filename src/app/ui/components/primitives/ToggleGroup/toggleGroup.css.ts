import { createVar, style, styleVariants } from "@vanilla-extract/css";

import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const selectedIndexVar = createVar();
export const itemCountVar = createVar();

export const root = style({
  display: "flex",
  backgroundColor: vars.toggleGroup.surface,
  borderRadius: vars.border.radius.xl,
  padding: "0.25rem",
  gap: "4px",
  width: "100%",
  position: "relative",
  isolation: "isolate",
  containerType: "inline-size",
});

export const rootVariants = styleVariants({
  default: {},
  outlinePill: {
    border: `${vars.border.width.thin} solid ${vars.color.brandBase}`,
    borderRadius: vars.border.radius.full,
    backgroundColor: "transparent",
    padding: 0,
    gap: 0,
    overflow: "hidden",
  },
});

export const indicator = style({
  position: "absolute",
  top: "0.25rem",
  bottom: "0.25rem",
  left: "0.25rem",
  width: `calc((100% - 0.5rem - ((${itemCountVar} - 1) * 4px)) / ${itemCountVar})`,
  backgroundColor: vars.toggleGroup.itemSelectedSurface,
  border: `${vars.border.width.thin} solid ${vars.toggleGroup.itemSelectedBorder}`,
  borderRadius: vars.border.radius.xl,
  boxShadow: vars.shadow.small,
  transition: "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
  transform: `translateX(calc(${selectedIndexVar} * (100% + 4px)))`,
  zIndex: 0,
});

export const indicatorVariants = styleVariants({
  default: {},
  outlinePill: {
    top: 0,
    bottom: 0,
    left: 0,
    width: `calc(100% / ${itemCountVar})`,
    backgroundColor: vars.color.brandBase,
    border: "none",
    borderRadius: vars.border.radius.full,
    boxShadow: "none",
    transform: `translateX(calc(${selectedIndexVar} * 100%))`,
  },
});

export const item = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: vars.spacing.sm,
  padding: "0.75rem 1rem",
  borderRadius: vars.border.radius.lg,
  cursor: "pointer",
  border: "1.5px solid transparent",
  backgroundColor: "transparent",
  color: vars.toggleGroup.itemUnselectedOnSurface,
  fontWeight: 600,
  fontSize: vars.typography.bodySmall.fontSize,
  transition: "color 0.15s ease-in-out",
  outline: "none",
  userSelect: "none",
  flex: 1,
  minWidth: 0,
  zIndex: 1,
  position: "relative",
  selectors: {
    "&[data-pressed]": {
      color: vars.toggleGroup.itemSelectedOnSurface,
    },
    "&:hover:not([data-pressed])": {
      backgroundColor: "rgba(0,0,0,0.03)",
    },
    "&:focus-visible": {
      boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
    },
    "&:disabled": {
      opacity: 0.4,
      cursor: "not-allowed",
    },
  },
});

export const itemVariants = styleVariants({
  default: {},
  outlinePill: {
    borderRadius: vars.border.radius.full,
    border: "none",
    minHeight: "3rem",
    color: vars.color.onSurfaceSecondary,
    fontSize: vars.typography.bodyNormal.fontSize,
    fontWeight: 700,
    selectors: {
      "&[data-pressed]": {
        color: vars.color.onSurfaceInvert,
      },
      "&:hover:not([data-pressed])": {
        backgroundColor: "transparent",
      },
    },
  },
});

export const itemIcon = style({
  width: "1.25rem",
  height: "1.25rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
});

export const itemLabel = style({
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "clip",
  fontSize: vars.typography.bodySmall.fontSize,
  transition: "font-size 0.1s ease",
  "@container": {
    "(max-width: 21.25rem)": {
      fontSize: "0.75rem",
    },
    "(max-width: 16.25rem)": {
      selectors: {
        "&:not(:first-child)": {
          display: "none",
        },
      },
    },
  },
});
