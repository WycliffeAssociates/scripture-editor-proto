import { style } from "@vanilla-extract/css";
import { vars } from "@/app/ui/styles/designSystem.css.ts";

export const root = style({
    color: vars.color.onSurfacePrimary,
    selectors: {
        "&[data-disabled]": {
            backgroundColor: "transparent",
            opacity: 0.5,
            cursor: "not-allowed",
        },
    },
});

export const icon = style({
    color: "currentColor",
});
