import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

// Pinned to the top of the viewport. Uses brand/surface tokens so it reads as
// a system notice rather than an in-document message.
export const root = style({
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.md,
    padding: `${vars.spacing.sm} ${vars.spacing.md}`,
    backgroundColor: vars.color.brandBase,
    color: vars.color.onSurfaceInvert,
    boxShadow: vars.shadow.small,
    fontSize: vars.typography.bodySmall.fontSize,
});

export const message = style({
    flex: 1,
    minWidth: 0,
});

export const version = style({
    fontWeight: 600,
    marginRight: vars.spacing.xs,
});

export const actions = style({
    display: "flex",
    gap: vars.spacing.sm,
    flexShrink: 0,
});
