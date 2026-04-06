import { style } from "@vanilla-extract/css";
import { vars as dsVars } from "@/app/ui/styles/designSystem.css.ts";

export const root = style({
    color: dsVars.color.onSurfacePrimary,
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
