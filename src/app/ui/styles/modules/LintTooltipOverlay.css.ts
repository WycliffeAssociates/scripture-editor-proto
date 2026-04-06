import { style } from "@vanilla-extract/css";
import { vars as dsVars } from "@/app/ui/styles/designSystem.css.ts";

export const host = style({
    position: "fixed",
    zIndex: 2000,
    transform: "translate(-50%, -110%)",
    pointerEvents: "none",
});

export const card = style({
    pointerEvents: "auto",
    border: `1px solid ${dsVars.color.onSurfaceError})`,
    color: dsVars.color.onSurfacePrimary,
    borderRadius: dsVars.border.radius.md,
    padding: `${dsVars.spacing.xs} ${dsVars.spacing.sm}`,
    maxWidth: 420,
});

export const row = style({
    display: "flex",
    gap: dsVars.spacing.xs,
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: `calc(${dsVars.spacing.xs} * 0.375) 0`,
});

export const message = style({
    margin: 0,
    fontSize: dsVars.typography.bodySmallest.fontSize,
    lineHeight: 1.35,
    whiteSpace: "pre-wrap",
    backgroundColor: `color-mix(in srgb, ${dsVars.color.surfaceError} 34%, transparent)`,
    border: `1px solid color-mix(in srgb, ${dsVars.color.onSurfaceError} 55%, transparent)`,
    borderRadius: dsVars.border.radius.sm,
    padding: `calc(${dsVars.spacing.xs} * 0.375) ${dsVars.spacing.xs}`,
    flex: 1,
});

export const fixButton = style({
    border: "none",
    borderRadius: 999,
    padding: `calc(${dsVars.spacing.xs} * 0.375) ${dsVars.spacing.sm}`,
    fontSize: dsVars.typography.bodySmallest.fontSize,
    fontWeight: 600,
    whiteSpace: "nowrap",
    cursor: "pointer",
    backgroundColor: dsVars.color.brandLight,
    color: dsVars.color.brandDarkest,
});
