import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const root = style({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars.spacing.sm,
    minHeight: "2.5rem",
    paddingBlock: vars.spacing.xs,
    flexWrap: "wrap",
});

export const cluster = style({
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.xs,
    flexWrap: "wrap",
    minWidth: 0,
});

export const leftCluster = style({
    flex: "1 1 auto",
});

export const rightCluster = style({
    flex: "0 1 auto",
    marginLeft: "auto",
});

export const iconButton = style({
    width: "2rem",
    minWidth: "2rem",
    height: "2rem",
    padding: 0,
    borderRadius: vars.border.radius.md,
});

export const statusText = style({
    color: vars.color.onSurfaceSecondary,
    fontSize: vars.typography.bodySmallest.fontSize,
    fontWeight: 600,
    whiteSpace: "nowrap",
});
