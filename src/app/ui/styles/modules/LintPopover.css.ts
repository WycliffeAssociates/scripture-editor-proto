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
