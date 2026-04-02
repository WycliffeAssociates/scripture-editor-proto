import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const container = style({
    display: "inline-flex",
    alignItems: "center",
    gap: "1px",
});

export const key = style({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: vars.kbd.surface,
    color: vars.kbd.onSurface,
    borderRadius: vars.border.radius.xs,
    padding: "0.25rem",
    minWidth: "1.5rem",
    height: "1.5rem",
    fontFamily: "inherit",
    fontSize: "0.75rem",
    fontWeight: 600,
    lineHeight: 1,
    whiteSpace: "nowrap",
});

export const icon = style({
    width: "1rem",
    height: "1rem",
    display: "block",
});
