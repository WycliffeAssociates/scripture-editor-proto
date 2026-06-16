import { style } from "@vanilla-extract/css";

import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const root = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.sm,
  alignItems: "flex-start",
  width: "100%",
  minWidth: 0,
});

/** The status line + its identity/help text, tightly grouped above the action. */
export const summary = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.xs,
  width: "100%",
  minWidth: 0,
});

/** Action sits apart from the summary for hierarchy; full-width call to action. */
export const action = style({
  width: "100%",
});

export const statusLine = style({
  display: "flex",
  alignItems: "center",
  gap: vars.spacing.xs,
  // A status line, not a heading — keep it the smaller body size so it doesn't
  // shout next to the picker.
  fontSize: vars.typography.bodySmallest.fontSize,
  fontWeight: 600,
  lineHeight: vars.typography.bodySmallest.lineHeight,
  color: vars.color.onSurfacePrimary,
});

export const statusIcon = style({
  display: "inline-flex",
  flexShrink: 0,
});

export const statusIconReady = style({
  color: vars.color.onSurfaceSuccess,
});

export const statusIconMuted = style({
  color: vars.color.onSurfaceTertiary,
});

/** The owner/name (or pasted link) — can be long, so wrap instead of clipping. */
export const identity = style({
  maxWidth: "100%",
  fontSize: vars.typography.bodySmallest.fontSize,
  lineHeight: vars.typography.bodySmallest.lineHeight,
  color: vars.color.onSurfaceSecondary,
  overflowWrap: "anywhere",
  wordBreak: "break-word",
});

export const help = style({
  margin: 0,
  maxWidth: "100%",
  fontSize: vars.typography.bodySmallest.fontSize,
  lineHeight: vars.typography.bodySmallest.lineHeight,
  color: vars.color.onSurfaceTertiary,
  overflowWrap: "anywhere",
});
