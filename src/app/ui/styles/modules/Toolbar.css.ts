import { style } from "@vanilla-extract/css";
import { darkSelector, vars } from "@/app/ui/styles/theme.css.ts";

export const toolbar = style({
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "var(--mantine-spacing-xs) 0",
    gap: "var(--mantine-spacing-md)",
    borderBottom: "1px solid var(--mantine-color-default-border)",
});

export const clearReferenceProject = style({
    fontWeight: 600,
    borderBottom: "1px solid var(--mantine-color-gray-2)",
    borderRadius: "0",
    color: vars.colors.error[6],
    selectors: {
        [`${darkSelector} &`]: {
            color: vars.colors.error[4],
        },
    },
});

export const projectItem = style({
    paddingInlineStart: "1rem", // 12px equivalent to ml-3
});

export const languageLabel = style({
    paddingTop: "var(--mantine-spacing-xs)", // pt-2 equivalent
});

export const currentProjectIndicator = style({
    fontSize: "0.75rem", // text-xs equivalent
    opacity: 0.6,
});

export const projectItemContent = style({
    display: "flex",
    alignItems: "center",
    gap: "0.25rem", // gap-1 equivalent
});
