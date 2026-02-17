// src/app/ui/styles/modules/Projectview.css.ts

import { darken, lighten } from "@mantine/core";
import { style } from "@vanilla-extract/css";
import { appHeaderOffsetVar } from "@/app/ui/styles/layoutVars.css.ts";
import { darkSelector, vars, virtualVars } from "@/app/ui/styles/theme.css.ts";

// Layout
export const appLayout = style({
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
    vars: { [appHeaderOffsetVar]: "6.75rem" },
    "@media": {
        // On small screens the side panels are not sticky; keep a smaller value as a sane default.
        "screen and (max-width: 48em)": {
            vars: { [appHeaderOffsetVar]: "4.75rem" },
        },
    },
});

export const appLayoutWithReference = style({
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
    vars: { [appHeaderOffsetVar]: "6.75rem" },
    "@media": {
        "screen and (max-width: 48em)": {
            vars: { [appHeaderOffsetVar]: "4.75rem" },
        },
    },
});

// Navigation Ribbon
export const navRibbon = style({
    position: "sticky",
    top: 0,
    zIndex: 40,
    backgroundColor: vars.colors.body,
    borderBottom: `1px solid ${vars.colors.defaultBorder}`,
});

export const chapterRibbon = style({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.25rem 0.25rem 0.5rem 0.25rem",
    backgroundColor: vars.colors.body,
});

export const chapterNavRow = style({
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.5rem 1rem",
});

export const chapterNavLeft = style({
    justifySelf: "start",
    display: "flex",
    alignItems: "center",
});

export const chapterNavRight = style({
    justifySelf: "end",
    display: "flex",
    alignItems: "center",
});

export const locationPill = style({
    justifySelf: "center",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
    color: virtualVars.text,
});

export const locationPrimary = style({
    fontWeight: 700,
    letterSpacing: "-0.01em",
    lineHeight: 1.1,
});

export const mobileRibbon = style({
    backgroundColor: vars.colors.body,
    borderBottom: `1px solid ${vars.colors.gray[3]}`,
    padding: "0.5rem 1rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.5rem",
});

export const mobileRibbonLeft = style({
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
});

export const mobileRibbonRight = style([mobileRibbonLeft]);

export const editorWrapperDesktop = style({
    width: "100%",
    minWidth: 0,
    maxWidth: "65ch",
    margin: "0 auto",
    justifySelf: "center",
    alignSelf: "start",
    paddingInline: "1rem",
});

export const editor = style({
    maxWidth: "75ch",
    width: "100%",
    margin: "0 auto",
    position: "relative",
});

export const editorNavButton = style({
    alignSelf: "stretch",
    width: "max-content",
    cursor: "pointer",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "0.5rem 1rem",
    boxShadow:
        "0px 1px 3px rgba(31, 31, 31, 0.12), 0px 1px 2px rgba(31, 31, 31, 0.24)",
    borderRadius: "8px",
    backgroundColor: lighten(virtualVars.surface, 0.2),
    color: virtualVars.text,

    selectors: {
        "&:hover": {
            backgroundColor: darken(virtualVars.surface, 0.02),
        },
        [`${darkSelector} &:hover`]: {
            backgroundColor: lighten(virtualVars.surface, 0.3),
        },
        "&:active": {
            transform: "translateY(1px)",
        },
    },

    "@media": {
        "screen and (max-width: 26em)": {
            margin: "0.25rem",
            padding: "0.25rem 0.5rem",
            fontSize: "0.875rem",
        },
    },
});
export const editorNavButtonHidden = style({
    padding: 0,
});
// Mobile Tab Bar
export const mobileTabsBar = style({
    display: "flex",
    paddingBlock: "0.25rem",
    borderBottom: `1px solid ${vars.colors.gray[3]}`,
    backgroundColor: vars.colors.body,
});

export const mobileTabButton = style({
    flex: 1,
    padding: "0.5rem 0.75rem",
    background: "transparent",
    border: 0,
    cursor: "pointer",
    color: virtualVars.text,
    opacity: 0.75,
    fontWeight: 600,
});

export const mobileTabButtonActive = style({
    opacity: 1,
    color: "var(--mantine-primary-color-filled)",
});

// Mobile Editors (Tab Switching)
export const mobileEditorsContainer = style({
    display: "block",
});
export const desktopContentGrid = style({
    display: "grid",
    gridTemplateColumns: "1fr",
    alignItems: "start",
    gap: "1rem",
    paddingInline: "0.5rem",
});

// Main and reference are stacked on mobile; visibility is toggled via inline `display` in `ProjectView`.
export const editorMainSmall = style({
    paddingInline: "1rem",
    backgroundColor: vars.colors.body,
    display: "block",
});

export const editorReferenceSmall = style({
    paddingInline: "1rem",
    backgroundColor: vars.colors.body,
    display: "block",
});

export const referenceColumn = style({
    position: "sticky",
    top: appHeaderOffsetVar,
    alignSelf: "start",
    height: `calc(100vh - ${appHeaderOffsetVar})`,
    minWidth: 0,
    width: "100%",
    overflow: "auto",
    paddingInline: "0.5rem",
    borderLeft: `1px solid ${vars.colors.gray[3]}`,
    backgroundColor: vars.colors.body,
});
