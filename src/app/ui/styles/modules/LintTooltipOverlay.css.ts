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
    padding: "8px 10px",
    maxWidth: 420,
    boxShadow: "0 10px 24px rgba(0, 0, 0, 0.28)",
    border: `1px solid ${vars.colors.error[1]}`,
});

export const row = style({
    display: "flex",
    gap: 8,
    alignItems: "center",
    justifyContent: "space-between",
    padding: "3px 0",
});

export const message = style({
    margin: 0,
    fontSize: 12,
    lineHeight: 1.35,
    whiteSpace: "pre-wrap",
});

export const fixButton = style({
    border: "none",
    borderRadius: 999,
    padding: "3px 9px",
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: "nowrap",
    cursor: "pointer",
    backgroundColor: "var(--mantine-color-blue-2)",
    color: "var(--mantine-color-blue-9)",
});
