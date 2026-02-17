import { style } from "@vanilla-extract/css";
import { darkSelector, vars } from "@/app/ui/styles/theme.css.ts";

export const toolbar = style({
    width: "100%",
});

export const toolbarInner = style({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    //   padding: "0.35rem 0",
    padding: "0.5rem 1rem",
    gap: "var(--mantine-spacing-md)",
    borderBottom: `1px solid ${vars.colors.defaultBorder}`,
    width: "100%",
});

export const toolbarSection = style({
    display: "flex",
    alignItems: "center",
    gap: "var(--mantine-spacing-xs)",
    flexWrap: "nowrap",
    minWidth: 0,
    "@media": {
        // On small screens, allow wrapping so controls remain reachable.
        "screen and (max-width: 48em)": {
            flexWrap: "wrap",
        },
    },
});

export const referenceDropdown = style({
    maxHeight: "50vh",
    overflowY: "auto",
});

export const referenceProjectButton = style({
    maxWidth: "18rem",
    minWidth: 0,
    flexShrink: 1,
});

export const referenceProjectLabel = style({
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
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

export const viewOnlyActive = style({
    backgroundColor: vars.colors.orange[0],
    selectors: {
        [`${darkSelector} &`]: {
            backgroundColor: vars.colors.orange[9],
        },
    },
});
