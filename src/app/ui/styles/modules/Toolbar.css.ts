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
    padding: `${vars.spacing.sm} ${vars.spacing.md}`,
    gap: vars.spacing.md,
    borderBottom: `1px solid ${vars.colors.defaultBorder}`,
    width: "100%",
});

export const toolbarSection = style({
    display: "flex",
    alignItems: "center",
    gap: vars.spacing.xs,
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
    borderBottom: `1px solid ${vars.colors.gray[2]}`,
    borderRadius: "0",
    color: vars.colors.error[6],
    selectors: {
        [`${darkSelector} &`]: {
            color: vars.colors.error[4],
        },
    },
});

export const projectItem = style({
    paddingInlineStart: vars.spacing.md,
});

export const languageLabel = style({
    paddingTop: vars.spacing.xs,
});

export const currentProjectIndicator = style({
    fontSize: vars.fontSizes.xs,
    opacity: 0.6,
});

export const projectItemContent = style({
    display: "flex",
    alignItems: "center",
    gap: `calc(${vars.spacing.xs} * 0.4)`,
});

export const viewOnlyActive = style({
    backgroundColor: vars.colors.orange[0],
    selectors: {
        [`${darkSelector} &`]: {
            backgroundColor: vars.colors.orange[9],
        },
    },
});
