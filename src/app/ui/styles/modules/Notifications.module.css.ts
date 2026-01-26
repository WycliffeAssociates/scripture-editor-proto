import { darken } from "@mantine/core";
import { createVar, keyframes, style } from "@vanilla-extract/css";
import { darkSelector } from "@/app/ui/styles/theme.css.ts";
import { vars } from "../theme.css.ts";

// Create reusable CSS variables
const notificationBg = createVar();
const notificationBorder = createVar();
const notificationHoverBg = createVar();
function getDarkVar(color: string) {
    return {
        [`${darkSelector} &`]: {
            vars: {
                [notificationBg]: darken(color, 0.4),
                [notificationBorder]: color,
            },
        },
    };
}
// Color definitions for different notification types
const errorColors = style({
    vars: {
        [notificationBg]: vars.colors.red[2],
        [notificationBorder]: vars.colors.red.filled,
        // [notificationHoverBg]: "rgba(255, 255, 255, 0.15)",
    },
    selectors: {
        ...getDarkVar(vars.colors.red.filled),
    },
});

const successColors = style({
    vars: {
        [notificationBg]: vars.colors.green[2],
        [notificationBorder]: vars.colors.green.filled,
        // [notificationHoverBg]: "rgba(255, 255, 255, 0.15)",
    },
    selectors: {
        ...getDarkVar(vars.colors.green.filled),
    },
});

const infoColors = style({
    vars: {
        [notificationBg]: vars.colors.primary[2],
        [notificationBorder]: vars.colors.primary.filled,
        // [notificationHoverBg]: "rgba(255, 255, 255, 0.15)",
    },
    selectors: {
        ...getDarkVar(vars.colors.primary.filled),
    },
});

// Shared base styles that reference the CSS variables
const baseRoot = style({
    color: vars.colors.text,
    borderRadius: vars.radiusDefault,
    backgroundColor: notificationBg,
    border: `1px solid ${notificationBorder}`,
});

const baseIcon = style({
    backgroundColor: darken(notificationBg, 0.3),
    color: vars.colors.text,
    borderRadius: "999px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
});

const baseCloseButton = style({
    color: vars.colors.text,
    transition: "color 0.2s ease, background-color 0.2s ease",
    selectors: {
        "&:hover": {
            color: vars.colors.text,
            backgroundColor: "rgba(255, 255, 255, 0.1)",
        },
    },
});

const closeButtonHover = style({
    selectors: {
        "&:hover": {
            backgroundColor: notificationHoverBg,
        },
    },
});

// Root styles for different notification types
export const errorRoot = style([baseRoot, errorColors]);
export const successRoot = style([baseRoot, successColors]);
export const infoRoot = style([baseRoot, infoColors]);

// Icon styles (all share the same base style)
export const errorIcon = baseIcon;
export const successIcon = baseIcon;
export const infoIcon = baseIcon;

// Close button styles
export const errorCloseButton = style([baseCloseButton, closeButtonHover]);
export const successCloseButton = style([baseCloseButton, closeButtonHover]);
export const infoCloseButton = style([baseCloseButton, closeButtonHover]);

// Message text color for better contrast
export const message = style({
    color: vars.colors.text,
    opacity: 0.95,
});

// Spinning animation for progress notifications
const spin = keyframes({
    "0%": { transform: "rotate(0deg)" },
    "100%": { transform: "rotate(360deg)" },
});

export const spinningIcon = style({
    animation: `${spin} 1s linear infinite`,
});
