import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";

// Modal scaffolding for the chapter-label standardize picker. All values pull
// from the design-system contract (`vars`) — no hardcoded colors.

export const backdrop = style({
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    zIndex: zLayer.dialog,
});

export const popup = style({
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: zLayer.dialog,
    width: "min(28rem, calc(100vw - 2rem))",
    maxHeight: "calc(100vh - 4rem)",
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.md,
    padding: vars.spacing.lg,
    backgroundColor: vars.color.surfacePrimary,
    color: vars.color.onSurfacePrimary,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    borderRadius: vars.border.radius.lg,
    boxShadow: vars.shadow.large,
});

export const title = style({
    fontSize: vars.typography.bodyNormal.fontSize,
    fontWeight: 600,
    margin: 0,
});

export const description = style({
    fontSize: vars.typography.bodySmall.fontSize,
    color: vars.color.onSurfaceSecondary,
    margin: 0,
});

export const list = style({
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.xs,
    overflowY: "auto",
    margin: 0,
    padding: 0,
    listStyle: "none",
});

export const row = style({
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.sm,
    padding: `${vars.spacing.sm} ${vars.spacing.md}`,
    borderRadius: vars.border.radius.md,
    cursor: "pointer",
    selectors: {
        "&:hover": { backgroundColor: vars.color.surfaceSecondary },
    },
});

export const rowLabel = style({
    flex: 1,
    fontSize: vars.typography.bodySmall.fontSize,
});

export const count = style({
    fontSize: vars.typography.bodySmallest.fontSize,
    color: vars.color.onSurfaceSecondary,
    fontVariantNumeric: "tabular-nums",
});

export const dominantTag = style({
    fontSize: vars.typography.bodySmallest.fontSize,
    color: vars.color.onSurfaceSecondary,
});

export const actions = style({
    display: "flex",
    justifyContent: "flex-end",
    gap: vars.spacing.sm,
});
