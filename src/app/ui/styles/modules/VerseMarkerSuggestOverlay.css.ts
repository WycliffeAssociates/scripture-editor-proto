import { style } from "@vanilla-extract/css";

import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const overlayHost = style({
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
});

export const suggestion = style({
  position: "absolute",
  pointerEvents: "auto",
});

// Brand-blue highlight over the candidate verse number — matches the USFM
// marker color and reads as "this could be a marker", distinct from the red
// lint highlight. Click-through is NOT wanted here: this IS the affordance, so
// it stays interactive (hover/click to open the suggestion popover).
export const annotation = style({
  position: "absolute",
  left: 0,
  top: 0,
  appearance: "none",
  border: "none",
  padding: 0,
  margin: 0,
  borderRadius: vars.border.radius.xs,
  background: `color-mix(in srgb, ${vars.color.brandBase} 18%, transparent)`,
  cursor: "pointer",
  transition: "background 120ms ease",
  selectors: {
    "&:hover, &:focus-visible": {
      background: `color-mix(in srgb, ${vars.color.brandBase} 30%, transparent)`,
      outline: "none",
    },
  },
});

// Padding for the custom content rendered inside the shared AnnotationPopover
// shell (which is padding-less by default).
export const popoverContent = style({
  padding: vars.spacing.xs,
});
