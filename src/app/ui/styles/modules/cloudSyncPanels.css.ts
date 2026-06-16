import { style } from "@vanilla-extract/css";

import { vars } from "@/app/ui/styles/designSystem.css.ts";

/**
 * Styles for the redesigned cloud-sync popover panels (see CloudSyncPanels.tsx).
 * Shared verbatim by the real popover and the /playground state gallery so the
 * two never drift. Reuses CloudStatusPopover.css for the primitives (heading,
 * body, label, input, settingRow, …); this module only adds the new structure.
 */

/** Centered icon + "Project Sync" title + subtitle block. */
export const header = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: vars.spacing.sm,
  textAlign: "center",
});

/** Surfaced "needs review" affordance — background carries it, no border. */
export const reviewBanner = style({
  appearance: "none",
  width: "100%",
  textAlign: "left",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.spacing.sm,
  background: vars.color.surfaceError,
  border: "none",
  borderRadius: vars.border.radius.lg,
  padding: `${vars.spacing.sm} ${vars.spacing.md}`,
  cursor: "pointer",
  color: vars.color.onSurfaceSecondary,
});

export const reviewBannerText = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.125rem",
});

export const reviewBannerLabel = style({
  fontSize: vars.typography.bodySmallest.fontSize,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: vars.color.onSurfaceSecondary,
});

export const reviewBannerDetail = style({
  fontSize: vars.typography.bodySmall.fontSize,
  fontWeight: 600,
  color: vars.color.onSurfacePrimary,
});

/** Granular local-vs-shared version timestamps, each with a clock. */
export const clocks = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.xs,
  fontSize: vars.typography.bodySmall.fontSize,
  color: vars.color.onSurfaceSecondary,
});

export const clockItem = style({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.375rem",
});

export const clockTime = style({
  fontWeight: 600,
  color: vars.color.brandBase,
});

/** Body of the single "Project details" dropdown. */
export const detailsBody = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.sm,
  marginTop: vars.spacing.xs,
  background: vars.color.surfaceSecondary,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.md,
  padding: vars.spacing.sm,
});

/** Send & receive settings, divided off as a subsection at the bottom. */
export const subsection = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.xs,
  paddingTop: vars.spacing.sm,
  borderTop: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
});

export const urlRow = style({
  display: "flex",
  alignItems: "center",
  gap: vars.spacing.xs,
  marginTop: "0.25rem",
});

export const url = style({
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: vars.typography.bodySmall.fontSize,
  color: vars.color.onSurfaceSecondary,
  background: vars.color.surfacePrimary,
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.sm,
  padding: "0.375rem 0.5rem",
});

export const copyButton = style({
  flex: "0 0 auto",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.25rem",
  fontSize: vars.typography.bodySmallest.fontSize,
  fontWeight: 600,
  color: vars.color.brandBase,
  background: "transparent",
  border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  borderRadius: vars.border.radius.sm,
  padding: "0.375rem 0.5rem",
  cursor: "pointer",
});

/** Sign-in form — one uniform gap drives the rhythm between every element. */
export const loginForm = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.sm,
});

export const loginHeader = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  gap: "0.375rem",
});

export const localAssurance = style({
  margin: 0,
  fontSize: vars.typography.bodySmallest.fontSize,
  color: vars.color.onSurfaceTertiary,
});

export const errorText = style({
  margin: 0,
  fontSize: vars.typography.bodySmall.fontSize,
  color: vars.color.onSurfaceError,
  textAlign: "center",
});

export const createAccountRow = style({
  margin: 0,
  textAlign: "center",
  fontSize: vars.typography.bodySmall.fontSize,
  color: vars.color.onSurfaceSecondary,
});

export const createAccountLink = style({
  color: vars.color.brandBase,
  fontWeight: 600,
  textDecoration: "underline",
  cursor: "pointer",
});

export const fullWidthButton = style({
  width: "100%",
});

export const inlineIconLabel = style({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.375rem",
});

/**
 * Sets the account-level logout apart from the project actions above it:
 * a hairline divider, identity on the left, a compact (non-full-width) logout
 * tucked at the inline end so it takes intention to reach.
 */
export const accountFooter = style({
  marginTop: "0.25rem",
  paddingTop: vars.spacing.md,
  borderTop: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.spacing.sm,
});

export const accountIdentity = style({
  fontSize: vars.typography.bodySmall.fontSize,
  color: vars.color.onSurfaceSecondary,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

/** "Project details" disclosure summary — looks clickable, native marker hidden. */
export const detailsSummary = style({
  listStyle: "none",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: vars.spacing.xs,
  fontSize: vars.typography.bodySmallest.fontSize,
  fontWeight: 600,
  letterSpacing: "0.02em",
  textTransform: "uppercase",
  color: vars.color.onSurfaceSecondary,
  selectors: {
    "&::-webkit-details-marker": { display: "none" },
    "&:hover": { color: vars.color.onSurfacePrimary },
  },
});

export const detailsChevron = style({
  display: "inline-flex",
  transition: "transform 120ms ease",
  selectors: {
    "details[open] &": { transform: "rotate(90deg)" },
  },
});

/** Inline cloud-action error (create/connect/fork failures), in-panel. */
export const actionError = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.125rem",
  background: vars.color.surfaceError,
  borderRadius: vars.border.radius.md,
  padding: `${vars.spacing.sm} ${vars.spacing.md}`,
});

export const actionErrorTitle = style({
  fontSize: vars.typography.bodySmall.fontSize,
  fontWeight: 700,
  color: vars.color.onSurfaceError,
});

export const actionErrorMessage = style({
  fontSize: vars.typography.bodySmallest.fontSize,
  lineHeight: vars.typography.bodySmallest.lineHeight,
  color: vars.color.onSurfaceSecondary,
});
