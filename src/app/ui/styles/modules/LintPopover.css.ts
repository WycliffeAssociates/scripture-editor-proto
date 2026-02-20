import { darken } from "@mantine/core";
import { style } from "@vanilla-extract/css";
import { darkSelector, vars } from "@/app/ui/styles/theme.css.ts";

const mainRed = vars.colors.error[9];
export const lintPopoverButton = style({
    backgroundColor: mainRed,
    zIndex: 50,
    selectors: {
        // Dark mode styles
        [`${darkSelector} &`]: {
            backgroundColor: `color-mix(in srgb, ${mainRed} 70%, ${vars.colors.dark[7]})`,
        },

        // Hover state (works in both light and dark modes)
        "&:hover": {
            backgroundColor: darken(mainRed, 0.05),
        },

        // Dark mode hover
        [`${darkSelector} &:hover`]: {
            backgroundColor: `color-mix(in srgb, ${mainRed} 60%, ${vars.colors.dark[7]})`,
        },
    },
});
export const lintErrorItem = style({
    display: "flex",
    flexDirection: "column",
    width: "100%",
    padding: vars.spacing.xs,
    borderRadius: vars.radius.sm,
    cursor: "pointer",
    transition: "background-color 0.1s ease",
    ":hover": {
        backgroundColor: vars.colors.gray[1],
    },
    selectors: {
        [`${darkSelector} &:hover`]: {
            backgroundColor: vars.colors.dark[6],
        },
    },
});

export const lintErrorDetails = style({
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.xs,
    textAlign: "start",
});

export const lintPopoverDropdown = style({
    maxHeight: "16rem",
    overflowY: "auto",
});

export const lintErrorList = style({
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: vars.spacing.sm,
    alignItems: "stretch",
    fontSize: vars.fontSizes.sm,
});

export const lintErrorListItem = style({
    width: "100%",
});
