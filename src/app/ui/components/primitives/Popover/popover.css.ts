import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const popup = style({
    backgroundColor: vars.color.surfacePrimary,
    border: `${vars.border.width.thin} solid ${vars.color.surfaceBorder}`,
    borderRadius: vars.border.radius.md,
    boxShadow: vars.shadow.large,
    padding: vars.spacing.md,
    zIndex: 100,
    minWidth: "300px",
    outline: "none",
    isolation: "isolate",
    opacity: 1,
});
