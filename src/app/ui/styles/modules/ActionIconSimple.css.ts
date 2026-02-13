import { style } from "@vanilla-extract/css";
import { virtualVars } from "@/app/ui/styles/theme.css.ts";

export const root = style({
    color: virtualVars.text,
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
