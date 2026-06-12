import { globalStyle, style } from "@vanilla-extract/css";

import { vars } from "@/app/ui/styles/designSystem.css.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";

export const trigger = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.spacing.sm,
  padding: "10px 14px",
  minHeight: "44px",
  backgroundColor: vars.color.surfacePrimary,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.lg,
  width: "100%",
  cursor: "pointer",
  appearance: "none",
  WebkitAppearance: "none",
  transition: "border-color 200ms ease",
  selectors: {
    "&:hover": {
      borderColor: vars.color.brandBase,
    },
    "&:focus-visible": {
      outline: `${vars.border.width.thick} solid ${vars.color.brandBase}`,
      outlineOffset: "2px",
    },
  },
});

export const triggerIcon = style({
  width: "20px",
  height: "20px",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

export const triggerIconEnd = style({
  width: "20px",
  height: "20px",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

export const triggerValue = style({
  flex: "1 1 auto",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontFamily: vars.typography.fontFamily,
  fontSize: vars.typography.bodyNormal.fontSize,
  fontWeight: vars.typography.bodyNormal.fontWeight,
  lineHeight: vars.typography.bodyNormal.lineHeight,
  color: vars.color.onSurfacePrimary,
  textAlign: "left",
});

/** Compact trigger sizing for dense chrome (e.g. the editor mode picker) —
    smaller text and tighter padding so the current selection reads as a
    control, not a heading. Compose onto the trigger via the consumer's
    className. */
export const triggerCompact = style({
  minHeight: "2rem",
  paddingBlock: "0.375rem",
  paddingInline: vars.spacing.sm,
  borderRadius: vars.border.radius.md,
});

globalStyle(`${triggerCompact} .${triggerValue}`, {
  fontSize: vars.typography.bodySmall.fontSize,
  lineHeight: vars.typography.bodySmall.lineHeight,
});

/* The positioner is position:fixed, so it forms its own stacking context. It
   must carry the dropdown z-index — otherwise the popup's z-index is trapped at
   the positioner's level (auto) and loses to sticky page chrome above it. */
export const positioner = style({
  zIndex: zLayer.selectDropdown,
});

export const popup = style({
  minWidth: "var(--anchor-width)",
  backgroundColor: vars.color.surfacePrimary,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.md,
  boxShadow: vars.shadow.large,
  zIndex: zLayer.selectDropdown,
  overflow: "hidden",
  transformOrigin: "var(--transform-origin)",
  transition: "transform 150ms ease, opacity 150ms ease",
  selectors: {
    "&[data-starting-style]": {
      opacity: 0,
      transform: "scale(0.95)",
    },
    "&[data-ending-style]": {
      opacity: 0,
      transform: "scale(0.95)",
    },
  },
});

export const list = style({
  padding: 0,
  backgroundColor: vars.color.surfacePrimary,
});

export const item = style({
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "12px 16px",
  borderBottom: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  cursor: "pointer",
  fontFamily: vars.typography.fontFamily,
  fontSize: vars.typography.bodyNormal.fontSize,
  fontWeight: vars.typography.bodyNormal.fontWeight,
  lineHeight: vars.typography.bodyNormal.lineHeight,
  color: vars.color.onSurfacePrimary,
  transition: "background-color 150ms ease",
  selectors: {
    "&[data-highlighted]": {
      backgroundColor: vars.color.brandLight,
    },
    "&:last-child": {
      borderBottom: "none",
    },
    "&[data-selected]": {
      color: vars.color.brandBase,
      backgroundColor: vars.color.brandLight,
      fontWeight: "600",
    },
  },
});

/** Stacks the label over its optional description. */
export const itemBody = style({
  flex: "1 0 0",
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: "2px",
});

export const itemText = style({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

/** Muted helper copy beneath the label; wraps and stays normal weight so it
    reads as a caption. Inherits the row's color (brand when selected) but
    softened, matching the title's tone without competing with it. */
export const itemDescription = style({
  fontSize: vars.typography.bodySmall.fontSize,
  lineHeight: vars.typography.bodySmall.lineHeight,
  fontWeight: vars.typography.bodyNormal.fontWeight,
  color: "inherit",
  opacity: 0.75,
});

export const itemIndicatorLeading = style({
  width: "24px",
  height: "24px",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "inherit",
});

export const radioCircle = style({
  width: "20px",
  height: "20px",
  borderRadius: vars.border.radius.full,
  border: `2px solid ${vars.color.onSurfaceSecondary}`,
  color: vars.color.surfacePrimary,
  backgroundColor: "transparent",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition:
    "background-color 120ms ease, border-color 120ms ease, color 120ms ease",
});

export const radioCheck = style({
  width: "14px",
  height: "14px",
  opacity: 0,
  transition: "opacity 120ms ease",
});

globalStyle(`${itemIndicatorLeading}[data-selected] .${radioCircle}`, {
  backgroundColor: vars.color.brandBase,
  borderColor: vars.color.brandBase,
  color: vars.color.surfacePrimary,
});

globalStyle(`${itemIndicatorLeading}[data-selected] .${radioCheck}`, {
  opacity: 1,
});
