import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const root = style({
    position: "relative",
    display: "flex",
    alignItems: "center",
    width: "100%",
    height: "2.5rem",
    cursor: "pointer",
    userSelect: "none",
    touchAction: "none",
    selectors: {
        "&[data-disabled]": {
            opacity: 0.5,
            cursor: "not-allowed",
        },
    },
});

export const track = style({
    position: "relative",
    flexGrow: 1,
    height: "0.375rem",
    backgroundColor: vars.color.surfaceTertiary,
    borderRadius: vars.border.radius.full,
});

export const indicator = style({
    position: "absolute",
    height: "100%",
    backgroundColor: vars.color.brandBase,
    borderRadius: vars.border.radius.full,
});

export const thumb = style({
    display: "block",
    width: "1.25rem",
    height: "1.25rem",
    backgroundColor: vars.color.surfacePrimary,
    border: `${vars.border.width.thick} solid ${vars.color.brandBase}`,
    borderRadius: vars.border.radius.full,
    boxShadow: vars.shadow.small,
    transition: "transform 0.1s ease, box-shadow 0.1s ease",
    outline: "none",
    selectors: {
        "&:hover": {
            transform: "scale(1.1)",
        },
        "&:focus-visible": {
            boxShadow: `0 0 0 2px ${vars.color.surfacePrimary}, 0 0 0 4px ${vars.color.brandBase}`,
        },
        "&[data-active]": {
            transform: "scale(0.95)",
        },
    },
});
