import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";

export const host = style({
    position: "fixed",
    zIndex: zLayer.floatingOverlay,
    transform: "translate(-50%, -110%)",
    pointerEvents: "none",
});

export const card = style({
    pointerEvents: "auto",
    border: `1px solid ${vars.color.onSurfaceError})`,
    color: vars.color.onSurfacePrimary,
    borderRadius: vars.border.radius.md,
    padding: `${vars.spacing.xs} ${vars.spacing.sm}`,
    maxWidth: 420,
});

export const row = style({
    display: "flex",
    gap: vars.spacing.xs,
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: `calc(${vars.spacing.xs} * 0.375) 0`,
});

export const message = style({
    margin: 0,
    fontSize: vars.typography.bodySmallest.fontSize,
    lineHeight: 1.35,
    whiteSpace: "pre-wrap",
    backgroundColor: `${vars.color.surfaceError}`,
    border: `1px solid color-mix(in srgb, ${vars.color.onSurfaceError} 55%, transparent)`,
    borderRadius: vars.border.radius.sm,
    padding: `calc(${vars.spacing.xs} * 0.375) ${vars.spacing.xs}`,
    flex: 1,
});

export const fixButton = style({
    border: "none",
    borderRadius: 999,
    padding: `calc(${vars.spacing.xs} * 0.375) ${vars.spacing.sm}`,
    fontSize: vars.typography.bodySmallest.fontSize,
    fontWeight: 600,
    whiteSpace: "nowrap",
    cursor: "pointer",
    backgroundColor: vars.color.brandLight,
    color: vars.color.brandDarkest,
});
