import { style } from "@vanilla-extract/css";
import { vars as dsVars } from "@/app/ui/styles/designSystem.css.ts";

const darkSelector = "[data-theme='dark']";

export const toolbar = style({
    width: "100%",
});

export const toolbarInner = style({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    //   padding: "0.35rem 0",
    padding: `${dsVars.spacing.sm} ${dsVars.spacing.md}`,
    gap: dsVars.spacing.md,
    borderBottom: `1px solid ${dsVars.color.surfaceBorder}`,
    width: "100%",
});

export const toolbarSection = style({
    display: "flex",
    alignItems: "center",
    gap: dsVars.spacing.xs,
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
    borderBottom: `1px solid ${dsVars.color.surfaceTertiary}`,
    borderRadius: "0",
    color: dsVars.color.onSurfaceError,
    selectors: {
        [`${darkSelector} &`]: {
            color: dsVars.color.surfaceError,
        },
    },
});

export const projectItem = style({
    paddingInlineStart: dsVars.spacing.md,
});

export const languageLabel = style({
    paddingTop: dsVars.spacing.xs,
});

export const currentProjectIndicator = style({
    fontSize: dsVars.typography.bodySmallest.fontSize,
    opacity: 0.6,
});

export const projectItemContent = style({
    display: "flex",
    alignItems: "center",
    gap: `calc(${dsVars.spacing.xs} * 0.4)`,
});

export const viewOnlyActive = style({
    backgroundColor: dsVars.color.surfaceError,
    selectors: {
        [`${darkSelector} &`]: {
            backgroundColor: dsVars.color.surfaceTertiary,
        },
    },
});
