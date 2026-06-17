import { style } from "@vanilla-extract/css";

import { vars } from "@/app/ui/styles/designSystem.css.ts";

// Shared tooltip popup styling for icon-only / ambiguous affordances. Mirrors
// the toolbar tooltip look so hover hints read identically across surfaces.
export const popup = style({
  backgroundColor: vars.color.surfaceInvert,
  color: vars.color.onSurfaceInvert,
  borderRadius: vars.border.radius.sm,
  padding: `${vars.spacing.xs} ${vars.spacing.sm}`,
  fontSize: vars.typography.bodySmallest.fontSize,
  fontWeight: 600,
  boxShadow: vars.shadow.medium,
  maxWidth: "18rem",
});
