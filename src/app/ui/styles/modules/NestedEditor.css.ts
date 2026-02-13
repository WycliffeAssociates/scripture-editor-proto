import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/theme.css.ts";

export const editorWrapper = style({
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
});

export const contentEditable = style({
    outline: "none",
    minHeight: "100px",
    padding: "0.5rem",
    border: `1px solid ${vars.colors.defaultBorder}`,
    borderRadius: vars.radius.sm,
    backgroundColor: vars.colors.body,
});

export const placeholder = style({
    color: vars.colors.gray[5],
});
