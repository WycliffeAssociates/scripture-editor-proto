import { style } from "@vanilla-extract/css";
import { breakpoints, vars } from "@/app/ui/styles/theme.css.ts";

export const pageContainer = style({
    paddingTop: vars.spacing.xl,
    paddingBottom: vars.spacing.xl,
});

export const titleBlock = style({
    flexWrap: "nowrap",
    minWidth: 0,
    "@media": {
        "screen and (max-width: 768px)": {
            flexWrap: "wrap",
            gap: vars.spacing.sm,
        },
    },
});

export const backButton = style({
    color: vars.colors.primary[9],
    fontWeight: 600,
    selectors: {
        "&:hover": {
            backgroundColor: vars.colors.primary[0],
        },
    },
});

export const pageTitle = style({
    fontSize: "3rem",
    lineHeight: "1.1",
    letterSpacing: "-0.02em",
    color: vars.colors.primary[9],
    "@media": {
        [breakpoints.minWMd]: {
            fontSize: "3.75rem",
        },
    },
});

export const localizationBlock = style({
    minWidth: "20rem",
    maxWidth: "22rem",
    "@media": {
        "screen and (max-width: 768px)": {
            minWidth: "100%",
            maxWidth: "100%",
        },
    },
});
