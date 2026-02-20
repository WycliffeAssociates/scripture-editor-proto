import { style } from "@vanilla-extract/css";
import { vars, virtualVars } from "@/app/ui/styles/theme.css.ts";
export const host = style({
    position: "fixed",
    zIndex: 2000,
    transform: "translate(-50%, -110%)",
    pointerEvents: "none",
});

export const card = style({
    pointerEvents: "auto",
    backgroundColor: virtualVars.surface,
    color: virtualVars.text,
    borderRadius: vars.radius.md,
    padding: `${vars.spacing.xs} ${vars.spacing.sm}`,
    maxWidth: 420,
    boxShadow: `0 10px 24px color-mix(in srgb, ${vars.colors.black} 28%, transparent)`,
    border: `1px solid ${vars.colors.error[1]}`,
});

export const row = style({
    display: "flex",
    gap: vars.spacing.xs,
    alignItems: "center",
    justifyContent: "space-between",
    padding: `calc(${vars.spacing.xs} * 0.375) 0`,
});

export const message = style({
    margin: 0,
    fontSize: vars.fontSizes.xs,
    lineHeight: 1.35,
    whiteSpace: "pre-wrap",
});

export const fixButton = style({
    border: "none",
    borderRadius: 999,
    padding: `calc(${vars.spacing.xs} * 0.375) ${vars.spacing.sm}`,
    fontSize: vars.fontSizes.xs,
    fontWeight: 600,
    whiteSpace: "nowrap",
    cursor: "pointer",
    backgroundColor: vars.colors.primary[1],
    color: vars.colors.primary[9],
});
