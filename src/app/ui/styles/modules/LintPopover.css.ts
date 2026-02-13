import { darken } from "@mantine/core";
import { style } from "@vanilla-extract/css";
import { darkSelector } from "@/app/ui/styles/theme.css.ts";

const mainRed = `var(--mantine-color-red-9)`;
// const darkSelector = "[data-mantine-color-scheme='dark']";
export const lintPopoverButton = style({
    backgroundColor: mainRed,
    zIndex: 50,
    selectors: {
        // Dark mode styles
        [`${darkSelector} &`]: {
            backgroundColor: `color-mix(in srgb, ${mainRed} 70%, #333)`,
        },

        // Hover state (works in both light and dark modes)
        "&:hover": {
            backgroundColor: darken(mainRed, 0.05),
        },

        // Dark mode hover
        [`${darkSelector} &:hover`]: {
            backgroundColor: `color-mix(in srgb, ${mainRed} 60%, #333)`,
        },
    },
});
export const lintErrorItem = style({
    display: "flex",
    flexDirection: "column",
    width: "100%",
    padding: "var(--mantine-spacing-xs)",
    borderRadius: "var(--mantine-radius-sm)",
    cursor: "pointer",
    transition: "background-color 0.1s ease",
    ":hover": {
        backgroundColor: "var(--mantine-color-gray-1)",
    },
    selectors: {
        [`${darkSelector} &:hover`]: {
            backgroundColor: "var(--mantine-color-dark-6)",
        },
    },
});

export const lintErrorDetails = style({
    display: "flex",
    flexDirection: "column",
    gap: "var(--mantine-spacing-xs)",
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
    gap: "0.5rem",
    alignItems: "stretch",
    fontSize: "var(--mantine-font-size-sm)",
});

export const lintErrorListItem = style({
    width: "100%",
});
